import {Effect, Schema} from 'effect';
import {Activity} from 'effect/unstable/workflow';

import {IdempotentRunWorkflow} from './idempotent-run.workflow.define.js';
import type {WorkflowModule} from './module.js';

let activityRunCount = 0;

export const IdempotentRunWorkflowHandler = IdempotentRunWorkflow.toLayer(
  Effect.fnUntraced(function* ({key}) {
    yield* Effect.logInfo('idempotent-run workflow started').pipe(Effect.annotateLogs({key}));

    const count = yield* Activity.make({
      name: 'increment-counter',
      success: Schema.Number,
      execute: Effect.fn('increment-counter')(function* () {
        return ++activityRunCount;
      })(),
    });

    yield* Effect.logInfo('idempotent-run workflow finished').pipe(Effect.annotateLogs({key, count}));
    return {key, activityCount: count};
  }),
);

export const IdempotentRunModule: WorkflowModule = {
  workflow: IdempotentRunWorkflow,
  handler: IdempotentRunWorkflowHandler,
};

export {activityRunCount as _testActivityRunCount};
export const resetActivityRunCount = () => { activityRunCount = 0; };
