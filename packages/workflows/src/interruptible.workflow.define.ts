import {Schema} from 'effect';
import {DurableDeferred, Workflow} from 'effect/unstable/workflow';

export const InterruptibleWorkflow = Workflow.make('Interruptible', {
  payload: {id: Schema.String},
  success: Schema.String,
  idempotencyKey: ({id}) => id,
});

export const BlockingSignal = DurableDeferred.make('blocking-signal', {
  success: Schema.String,
});
