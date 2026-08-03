import { SQS } from '@effect-aws/client-sqs';
import { Duration, Effect, Schema } from 'effect';

import { EffectWorkflowMessageSchema, type EffectWorkflowMessage, type Send } from '../../LambdaWorkflowEngine.js';

const messageCodec = Schema.fromJsonString(Schema.toCodecJson(EffectWorkflowMessageSchema));

export const makeSqsSend = (queueUrl: string) =>
  Effect.gen(function* () {
    const sqs = yield* SQS;
    const encode = Schema.encodeUnknownEffect(messageCodec);

    return ((message: EffectWorkflowMessage, options?: { readonly delay?: Duration.Duration }) =>
      Effect.gen(function* () {
        const delaySeconds =
          options?.delay === undefined
            ? undefined
            : Math.ceil(
                Duration.toSeconds(
                  Duration.clamp(options.delay, { minimum: Duration.zero, maximum: Duration.minutes(15) }),
                ),
              );

        yield* Effect.orDie(
          sqs.sendMessage({
            QueueUrl: queueUrl,
            MessageBody: yield* Effect.orDie(encode(message)),
            DelaySeconds: delaySeconds,
          }),
        );
      })) as Send;
  });

export const decodeMessage = Schema.decodeUnknownEffect(messageCodec);
