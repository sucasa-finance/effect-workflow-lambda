import {Schema} from 'effect';
import {Workflow} from 'effect/unstable/workflow';

export const DependentActivitiesWorkflow = Workflow.make('DependentActivities', {
  payload: {id: Schema.String},
  success: Schema.Array(Schema.String),
  idempotencyKey: ({id}) => id,
});
