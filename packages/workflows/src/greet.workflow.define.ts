import {Schema} from 'effect';
import {Workflow} from 'effect/workflow';

export const GreetInputSchema = Schema.Struct({name: Schema.String});

export type GreetInput = typeof GreetInputSchema.Type;

export class SalutationLookupError extends Schema.TaggedError<SalutationLookupError>()('SalutationLookupError', {
  name: Schema.String,
}) {
  get message() {
    return `no salutation found for ${JSON.stringify(this.name)}`;
  }
}

export class GreetBlankNameError extends Schema.TaggedError<GreetBlankNameError>()('GreetBlankNameError', {
  name: Schema.String,
}) {
  get message() {
    return 'cannot greet a blank name';
  }
}

export const GreetWorkflow = Workflow.make('Greet', {
  payload: GreetInputSchema.fields,
  success: Schema.Struct({greeting: Schema.String, farewell: Schema.String}),
  error: Schema.Union([GreetBlankNameError, SalutationLookupError]),
  idempotencyKey: ({name}) => name,
});
