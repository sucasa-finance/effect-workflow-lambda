import type { Layer } from 'effect';
import type { WorkflowEngine } from 'effect/workflow/WorkflowEngine';

export interface WorkflowModule {
  readonly handler: Layer.Layer<never, never, WorkflowEngine>;
}
