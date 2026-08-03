import {Schema} from 'effect';
import {Workflow} from 'effect/unstable/workflow';

export const GreetInputSchema = Schema.Struct({name: Schema.String});

export type GreetInput = typeof GreetInputSchema.Type;

export class SalutationLookupError extends Schema.TaggedErrorClass<SalutationLookupError>()('SalutationLookupError', {
  name: Schema.String,
}) {
  get message() {
    return `no salutation found for ${JSON.stringify(this.name)}`;
  }
}

export class GreetBlankNameError extends Schema.TaggedErrorClass<GreetBlankNameError>()('GreetBlankNameError', {
  name: Schema.String,
}) {
  get message() {
    return 'cannot greet a blank name';
  }
}

export const GreetWorkflow = Workflow.make({
  name: 'Greet',
  payload: GreetInputSchema.fields,
  success: Schema.Struct({greeting: Schema.String, farewell: Schema.String}),
  error: Schema.Union([GreetBlankNameError, SalutationLookupError]),
  idempotencyKey: ({name}) => name,
});
