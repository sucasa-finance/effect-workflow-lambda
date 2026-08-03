import type { Effect, Layer, Option } from 'effect';
import type { DurableDeferred, Workflow } from 'effect/unstable/workflow';
import type { WorkflowEngine } from 'effect/unstable/workflow/WorkflowEngine';

export interface WorkflowModule {
  readonly workflow: Workflow.AnyWithProps & {
    readonly poll: (executionId: string) => Effect.Effect<Option.Option<any>, any, any>;
    readonly interrupt: (executionId: string) => Effect.Effect<void, never, WorkflowEngine>;
  };
  readonly handler: Layer.Layer<never, never, WorkflowEngine>;
  readonly signals?: Record<string, DurableDeferred.DurableDeferred<any, any>>;
}
