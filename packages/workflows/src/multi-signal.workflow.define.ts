import {Schema} from 'effect';
import {DurableDeferred, Workflow} from 'effect/unstable/workflow';

export const MultiSignalWorkflow = Workflow.make({
  name: 'MultiSignal',
  payload: {requestId: Schema.String},
  success: Schema.Struct({managerApproval: Schema.String, legalApproval: Schema.String}),
  idempotencyKey: ({requestId}) => requestId,
});

export const ManagerSignal = DurableDeferred.make('manager-approval', {
  success: Schema.Struct({approvedBy: Schema.String}),
});

export const LegalSignal = DurableDeferred.make('legal-approval', {
  success: Schema.Struct({approvedBy: Schema.String}),
});
