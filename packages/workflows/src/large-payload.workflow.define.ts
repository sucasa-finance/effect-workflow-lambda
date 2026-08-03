import {Schema} from 'effect';
import {Workflow} from 'effect/unstable/workflow';

export const LargePayloadWorkflow = Workflow.make({
  name: 'LargePayload',
  payload: {
    id: Schema.String,
    unicodeText: Schema.String,
    nested: Schema.Struct({
      items: Schema.Array(Schema.Struct({key: Schema.String, value: Schema.String})),
    }),
    largeString: Schema.String,
  },
  success: Schema.Struct({
    echoId: Schema.String,
    unicodeLength: Schema.Number,
    itemCount: Schema.Number,
    largeStringLength: Schema.Number,
  }),
  idempotencyKey: ({id}) => id,
});
