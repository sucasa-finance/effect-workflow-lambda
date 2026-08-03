import {Schema} from 'effect';
import {Workflow} from 'effect/unstable/workflow';

export const FanOutWorkflow = Workflow.make({
  name: 'FanOut',
  payload: {count: Schema.Number},
  success: Schema.Array(Schema.String),
  idempotencyKey: ({count}) => `fan-${count}`,
});
