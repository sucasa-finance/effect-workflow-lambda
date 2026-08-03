import {Schema} from 'effect';
import {DurableDeferred, Workflow} from 'effect/unstable/workflow';

export const InterruptActivityWorkflow = Workflow.make({
  name: 'InterruptActivity',
  payload: {id: Schema.String},
  success: Schema.String,
  idempotencyKey: ({id}) => id,
});

export const WorkSignal = DurableDeferred.make('work-signal', {
  success: Schema.String,
});
