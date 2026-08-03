import {Effect, Schema} from 'effect';
import {Activity} from 'effect/unstable/workflow';

import {DuplicateExecuteWorkflow} from './duplicate-execute.workflow.define.js';
import type {WorkflowModule} from './module.js';

let callCount = 0;

export const DuplicateExecuteWorkflowHandler = DuplicateExecuteWorkflow.toLayer(
  Effect.fnUntraced(function* ({id}) {
    yield* Effect.logInfo('duplicate-execute workflow started').pipe(Effect.annotateLogs({id}));

    const count = yield* Activity.make({
      name: 'counted',
      success: Schema.Number,
      execute: Effect.fn('counted')(function* () {
        return ++callCount;
      })(),
    });

    yield* Effect.logInfo('duplicate-execute workflow finished').pipe(Effect.annotateLogs({id, count}));
    return `done-${id}-${count}`;
  }),
);

export const DuplicateExecuteModule: WorkflowModule = {
  workflow: DuplicateExecuteWorkflow,
  handler: DuplicateExecuteWorkflowHandler,
};

export {callCount as _testCallCount};
export const resetCallCount = () => { callCount = 0; };
