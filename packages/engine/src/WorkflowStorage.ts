import {Context, Effect, Option} from 'effect';

export type EffectWorkflowExecutionRecord = {
  readonly workflowName: string;
  readonly payload: unknown;
  readonly result: Option.Option<unknown>;
  readonly interrupted: boolean;
};

export type EffectWorkflowStorageService = {
  readonly getExecution: (executionId: string) => Effect.Effect<Option.Option<EffectWorkflowExecutionRecord>>;
  readonly createExecution: (input: {
    readonly executionId: string;
    readonly workflowName: string;
    readonly payload: unknown;
  }) => Effect.Effect<boolean>;
  readonly setExecutionResult: (executionId: string, result: unknown) => Effect.Effect<void>;
  readonly setExecutionInterrupted: (executionId: string) => Effect.Effect<void>;
  readonly getActivityExit: (activityId: string) => Effect.Effect<Option.Option<unknown>>;
  readonly setActivityExit: (activityId: string, exit: unknown) => Effect.Effect<void>;
  readonly markActivityEnqueued: (activityId: string) => Effect.Effect<boolean>;
  readonly getDeferred: (executionId: string, deferredName: string) => Effect.Effect<Option.Option<unknown>>;
  readonly setDeferred: (executionId: string, deferredName: string, exit: unknown) => Effect.Effect<boolean>;
  readonly resetExecution: (executionId: string) => Effect.Effect<boolean>;
};

export class EffectWorkflowStorage extends Context.Service<EffectWorkflowStorage, EffectWorkflowStorageService>()(
  'effect-workflow-engine/EffectWorkflowStorage',
) {}
