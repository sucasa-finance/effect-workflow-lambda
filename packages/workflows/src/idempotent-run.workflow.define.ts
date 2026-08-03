import {Schema} from 'effect';
import {Workflow} from 'effect/unstable/workflow';

export const IdempotentRunWorkflow = Workflow.make({
  name: 'IdempotentRun',
  payload: {key: Schema.String},
  success: Schema.Struct({key: Schema.String, activityCount: Schema.Number}),
  idempotencyKey: ({key}) => key,
});
