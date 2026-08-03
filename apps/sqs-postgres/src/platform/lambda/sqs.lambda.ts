import { Effect, Layer } from 'effect';
import { LambdaHandler, type SQSEvent } from '@effect-aws/lambda';

import { make, type EffectWorkflowMessage } from '@effect-workflow-engine/engine/LambdaWorkflowEngine';
import { EffectWorkflowStoragePgLive } from '@effect-workflow-engine/engine/PostgresWorkflowStorage.live';

import { DatabaseLive } from '../database/client.js';
import { SqsLive, makeSqsSend, decodeMessage } from '../sqs/client.js';
import { modules, registerModules } from '../modules.js';

const makeProcessMessage = Effect.gen(function* () {
  const send = yield* makeSqsSend;
  const { engine, processMessage } = yield* make(send);
  yield* registerModules(engine, modules);
  return processMessage;
});

const sqsHandler = (event: SQSEvent) =>
  Effect.gen(function* () {
    const processMessage = yield* makeProcessMessage;

    for (const record of event.Records) {
      yield* Effect.logInfo('processing SQS message').pipe(
        Effect.annotateLogs({ messageId: record.messageId }),
      );

      const decoded = yield* Effect.orDie(decodeMessage(record.body)) as Effect.Effect<EffectWorkflowMessage>;
      yield* processMessage(decoded);
    }
  });

const DependenciesLive = Layer.mergeAll(
  EffectWorkflowStoragePgLive.pipe(Layer.provide(DatabaseLive)),
  SqsLive,
);

export const handler = LambdaHandler.make({
  handler: sqsHandler,
  layer: DependenciesLive,
});
