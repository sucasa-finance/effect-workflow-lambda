import {Effect} from 'effect';
import {DurableDeferred} from 'effect/unstable/workflow';

import {ApprovalDecisionSignal, ApprovalWorkflow} from './approval.workflow.define.js';

export const ApprovalWorkflowHandler = ApprovalWorkflow.toLayer(
  Effect.fnUntraced(function* ({requestId}) {
    yield* Effect.logInfo('approval workflow awaiting decision').pipe(Effect.annotateLogs({requestId}));

    // Suspends here (durably — across replays, deploys and restarts) until
    // ApprovalDecisionSignal is completed from outside the workflow.
    const decision = yield* DurableDeferred.await(ApprovalDecisionSignal);

    yield* Effect.logInfo('approval decision received').pipe(
      Effect.annotateLogs({requestId, approvedBy: decision.approvedBy}),
    );

    return `request ${requestId} approved by ${decision.approvedBy}`;
  }),
);
