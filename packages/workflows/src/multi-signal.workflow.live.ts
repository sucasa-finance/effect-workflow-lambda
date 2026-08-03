import {Effect} from 'effect';
import {DurableDeferred} from 'effect/unstable/workflow';

import {LegalSignal, ManagerSignal, MultiSignalWorkflow} from './multi-signal.workflow.define.js';
import type {WorkflowModule} from './module.js';

export const MultiSignalWorkflowHandler = MultiSignalWorkflow.toLayer(
  Effect.fnUntraced(function* ({requestId}) {
    yield* Effect.logInfo('multi-signal workflow awaiting both approvals').pipe(Effect.annotateLogs({requestId}));

    const [manager, legal] = yield* Effect.all(
      [DurableDeferred.await(ManagerSignal), DurableDeferred.await(LegalSignal)],
      {concurrency: 'unbounded'},
    );

    yield* Effect.logInfo('multi-signal workflow both approvals received').pipe(
      Effect.annotateLogs({requestId, managerApproval: manager.approvedBy, legalApproval: legal.approvedBy}),
    );

    return {managerApproval: manager.approvedBy, legalApproval: legal.approvedBy};
  }),
);

export const MultiSignalModule: WorkflowModule = {
  workflow: MultiSignalWorkflow,
  handler: MultiSignalWorkflowHandler,
  signals: {
    'manager-approval': ManagerSignal,
    'legal-approval': LegalSignal,
  },
};
