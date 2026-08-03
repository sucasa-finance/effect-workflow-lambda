import {Schema} from 'effect';
import {Workflow} from 'effect/unstable/workflow';

export class PaymentDeclinedError extends Schema.TaggedErrorClass<PaymentDeclinedError>()('PaymentDeclinedError', {
  reason: Schema.String,
}) {
  get message() {
    return `payment declined: ${this.reason}`;
  }
}

export const TypedFailureWorkflow = Workflow.make({
  name: 'TypedFailure',
  payload: {id: Schema.String, shouldFail: Schema.Boolean},
  success: Schema.String,
  error: PaymentDeclinedError,
  idempotencyKey: ({id}) => id,
});
