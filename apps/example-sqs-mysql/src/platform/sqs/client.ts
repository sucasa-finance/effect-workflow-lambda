import { SQS } from '@effect-aws/client-sqs';
import { Duration, Effect, Schema } from 'effect';

import { type EffectWorkflowMessage, EffectWorkflowMessageSchema, type Send } from '@effect-workflow-engine/engine/LambdaWorkflowEngine';

const endpoint = process.env.AWS_ENDPOINT_URL ?? 'http://localhost:4570';
const queueName = process.env.SQS_QUEUE_NAME ?? 'ewf-sqs-mysql-queue';

export const queueUrl = `${endpoint}/000000000000/${queueName}`;

export const SqsLive = SQS.layer({
  region: 'ap-southeast-2',
  endpoint,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'test',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'test',
  },
});

const messageCodec = Schema.fromJsonString(Schema.toCodecJson(EffectWorkflowMessageSchema));

export const makeSqsSend = Effect.gen(function* () {
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
