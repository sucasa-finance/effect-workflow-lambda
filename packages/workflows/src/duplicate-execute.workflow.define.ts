import {Schema} from 'effect';
import {Workflow} from 'effect/unstable/workflow';

export const DuplicateExecuteWorkflow = Workflow.make({
  name: 'DuplicateExecute',
  payload: {id: Schema.String},
  success: Schema.String,
  idempotencyKey: ({id}) => id,
});
