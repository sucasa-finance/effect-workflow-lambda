import {Schema} from 'effect';
import {Workflow} from 'effect/workflow';

export const FanOutWorkflow = Workflow.make('FanOut', {
  payload: {count: Schema.Number},
  success: Schema.Array(Schema.String),
  idempotencyKey: ({count}) => `fan-${count}`,
});
