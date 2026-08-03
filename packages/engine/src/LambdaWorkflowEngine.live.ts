import { SQS } from '@effect-aws/client-sqs';
import { Config, Context, Duration, Effect, Layer, Schema } from 'effect';
import type { SqlClient } from 'effect/unstable/sql';
import * as WorkflowEngine from 'effect/unstable/workflow/WorkflowEngine';

import { EffectWorkflowMessageSchema, type Send, make, MessageProcessor } from './LambdaWorkflowEngine.js';
import { EffectWorkflowStorageSqlLive } from './MySqlWorkflowStorage.live.js';

export { MessageProcessor, EffectWorkflowMessageSchema } from './LambdaWorkflowEngine.js';
export type { EffectWorkflowMessage } from './LambdaWorkflowEngine.js';

const EffectWorkflowQueueUrlConfig = Config.nonEmptyString('EFFECT_WORKFLOW_QUEUE_URL');

const makeSqsSend = Effect.gen(function* () {
  const sqs = yield* SQS;
  const encodeMessage = Schema.encodeUnknownEffect(
    Schema.fromJsonString(Schema.toCodecJson(EffectWorkflowMessageSchema)),
  );

  return Effect.fnUntraced(function* (message, options) {
    const delaySeconds =
      options?.delay === undefined
        ? undefined
        : Math.ceil(
            Duration.toSeconds(
              Duration.clamp(options.delay, {
                minimum: Duration.zero,
                maximum: Duration.minutes(15),
              }),
            ),
          );

    yield* Effect.orDie(
      sqs.sendMessage({
        QueueUrl: yield* Effect.orDie(EffectWorkflowQueueUrlConfig.asEffect()),
        MessageBody: yield* Effect.orDie(encodeMessage(message)),
        DelaySeconds: delaySeconds,
      }),
    );

    yield* Effect.logDebug('effect workflow message sent').pipe(
      Effect.annotateLogs({ tag: message._tag, executionId: message.executionId, delaySeconds }),
    );
  }) as Send;
});

export const layer: Layer.Layer<
  WorkflowEngine.WorkflowEngine | MessageProcessor,
  never,
  SqlClient.SqlClient
> = Layer.effectContext(
  Effect.gen(function* () {
    const send = yield* makeSqsSend;
    const { engine, processMessage } = yield* make(send);
    return Context.make(WorkflowEngine.WorkflowEngine, engine).pipe(
      Context.add(MessageProcessor, MessageProcessor.of({ processMessage })),
    );
  }),
).pipe(
  Layer.provide(EffectWorkflowStorageSqlLive),
  Layer.provide(SQS.defaultLayer),
);
