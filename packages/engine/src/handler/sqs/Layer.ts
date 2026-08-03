import { SQS, type SQSService } from '@effect-aws/client-sqs';
import { Context, Effect, Layer } from 'effect';
import * as WorkflowEngine from 'effect/unstable/workflow/WorkflowEngine';

import { make, MessageProcessor } from '../../LambdaWorkflowEngine.js';
import { EffectWorkflowStorage } from '../../WorkflowStorage.js';
import type { WorkflowModule } from '../../WorkflowModule.js';

import { makeSqsSend } from './Send.js';

export { decodeMessage } from './Send.js';

const registerModules = (
  engine: WorkflowEngine.WorkflowEngine['Service'],
  modules: ReadonlyArray<WorkflowModule>,
) =>
  Effect.gen(function* () {
    const EngineLive = Layer.effectContext(
      Effect.succeed(Context.make(WorkflowEngine.WorkflowEngine, engine)),
    );
    for (const mod of modules) {
      yield* Layer.build(mod.handler.pipe(Layer.provide(EngineLive))).pipe(Effect.scoped);
    }
  });

export const layer = (config: {
  readonly queueUrl: string;
  readonly modules: ReadonlyArray<WorkflowModule>;
}): Layer.Layer<WorkflowEngine.WorkflowEngine | MessageProcessor, never, SQSService | EffectWorkflowStorage> =>
  Layer.effectContext(
    Effect.gen(function* () {
      const send = yield* makeSqsSend(config.queueUrl);
      const { engine, processMessage } = yield* make(send);
      yield* registerModules(engine, config.modules);
      return Context.make(WorkflowEngine.WorkflowEngine, engine).pipe(
        Context.add(MessageProcessor, MessageProcessor.of({ processMessage })),
      );
    }),
  );
