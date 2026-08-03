import {Effect} from 'effect';
import {DurableDeferred} from 'effect/unstable/workflow';

import {InterruptActivityWorkflow, WorkSignal} from './interrupt-activity.workflow.define.js';
import type {WorkflowModule} from './module.js';

export const InterruptActivityWorkflowHandler = InterruptActivityWorkflow.toLayer(
  Effect.fnUntraced(function* ({id}) {
    yield* Effect.logInfo('interrupt-activity workflow started — awaiting signal').pipe(Effect.annotateLogs({id}));

    const result = yield* DurableDeferred.await(WorkSignal);

    yield* Effect.logInfo('interrupt-activity workflow finished').pipe(Effect.annotateLogs({id, result}));
    return `completed-${id}-${result}`;
  }),
);

export const InterruptActivityModule: WorkflowModule = {
  workflow: InterruptActivityWorkflow,
  handler: InterruptActivityWorkflowHandler,
  signals: { 'work-signal': WorkSignal },
};
