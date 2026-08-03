import {Schema} from 'effect';
import {DurableDeferred, Workflow} from 'effect/unstable/workflow';

export const ApprovalInputSchema = Schema.Struct({requestId: Schema.String});

export const ApprovalWorkflow = Workflow.make({
  name: 'Approval',
  payload: ApprovalInputSchema.fields,
  success: Schema.String,
  idempotencyKey: ({requestId}) => requestId,
});

/**
 * The external signal's contract: name + success schema. Completing it from
 * outside the workflow needs a token — derive one with
 * `DurableDeferred.tokenFromExecutionId({workflow: ApprovalWorkflow, executionId})`
 * and pass it to `DurableDeferred.succeed(ApprovalDecisionSignal, {token, value})`.
 */
export const ApprovalDecisionSignal = DurableDeferred.make('approval-decision', {
  success: Schema.Struct({approvedBy: Schema.String}),
});
