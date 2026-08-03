import {Schema} from 'effect';
import {Workflow} from 'effect/unstable/workflow';

export const CrashInputSchema = Schema.Struct({name: Schema.String, failUntilIso: Schema.String});

export const WorkflowCrashWorkflow = Workflow.make({
  name: 'WorkflowCrash',
  payload: CrashInputSchema.fields,
  success: Schema.String,
  idempotencyKey: ({name}) => name,
});

export const ActivityCrashWorkflow = Workflow.make({
  name: 'ActivityCrash',
  payload: CrashInputSchema.fields,
  success: Schema.String,
  idempotencyKey: ({name}) => name,
});

export class SimulatedCrashError extends Schema.TaggedErrorClass<SimulatedCrashError>()('SimulatedCrashError', {
  site: Schema.String,
  failUntilIso: Schema.String,
}) {
  get message() {
    return `${this.site}: simulated crash — retryable via SQS redelivery until ${this.failUntilIso}`;
  }
}
