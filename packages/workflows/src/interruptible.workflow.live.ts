import {Effect} from 'effect';
import {DurableDeferred} from 'effect/unstable/workflow';

import {BlockingSignal, InterruptibleWorkflow} from './interruptible.workflow.define.js';
import type {WorkflowModule} from './module.js';

export const InterruptibleWorkflowHandler = InterruptibleWorkflow.toLayer(
  Effect.fnUntraced(function* ({id}) {
    yield* Effect.logInfo('interruptible workflow started — will block on signal forever').pipe(Effect.annotateLogs({id}));

    const result = yield* DurableDeferred.await(BlockingSignal);

    yield* Effect.logInfo('interruptible workflow resumed (should not reach here if interrupted)').pipe(
      Effect.annotateLogs({id, result}),
    );
    return `completed-${id}-${result}`;
  }),
);

export const InterruptibleModule: WorkflowModule = {
  workflow: InterruptibleWorkflow,
  handler: InterruptibleWorkflowHandler,
  signals: {'blocking-signal': BlockingSignal},
};
