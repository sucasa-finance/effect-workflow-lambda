import {Schema} from 'effect';
import {Workflow} from 'effect/workflow';

export const DependentActivitiesWorkflow = Workflow.make('DependentActivities', {
  payload: {id: Schema.String},
  success: Schema.Array(Schema.String),
  idempotencyKey: ({id}) => id,
});
