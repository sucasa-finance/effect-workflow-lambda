import {Schema} from 'effect';
import {Workflow} from 'effect/workflow';

export const IdempotentRunWorkflow = Workflow.make('IdempotentRun', {
  payload: {key: Schema.String},
  success: Schema.Struct({key: Schema.String, activityCount: Schema.Number}),
  idempotencyKey: ({key}) => key,
});
