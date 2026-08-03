import { Cause, Clock, Context, Duration, Effect, Exit, Fiber, Option, Schema } from 'effect';
import type * as Activity from 'effect/unstable/workflow/Activity';
import * as Workflow from 'effect/unstable/workflow/Workflow';
import * as WorkflowEngine from 'effect/unstable/workflow/WorkflowEngine';

import { EffectWorkflowStorage } from './WorkflowStorage.js';

export const EffectWorkflowMessageSchema = Schema.Union([
  Schema.Struct({
    _tag: Schema.Literal('RunWorkflow'),
    executionId: Schema.String,
  }),
  Schema.Struct({
    _tag: Schema.Literal('RunActivity'),
    executionId: Schema.String,
    activityId: Schema.String,
    attempt: Schema.Number,
  }),
  Schema.Struct({
    _tag: Schema.Literal('RunClock'),
    executionId: Schema.String,
    deferredName: Schema.String,
    wakeUpAt: Schema.Number,
    exit: Schema.Unknown,
  }),
]);

export type EffectWorkflowMessage = typeof EffectWorkflowMessageSchema.Type;

export type Send = (message: EffectWorkflowMessage, options?: { readonly delay?: Duration.Duration }) => Effect.Effect<void>;

export class MessageProcessor extends Context.Service<
  MessageProcessor,
  {
    readonly processMessage: (message: EffectWorkflowMessage) => Effect.Effect<void>;
  }
>()('effect-workflow-engine/MessageProcessor') {}

type Registration = {
  readonly workflow: Workflow.AnyWithProps;
  readonly execute: (payload: object, executionId: string) => Effect.Effect<unknown, unknown>;
  readonly payloadJson: Schema.Top;
  readonly resultJson: Schema.Top;
};

export const make = (send: Send) =>
  Effect.gen(function* () {
    const storage = yield* EffectWorkflowStorage;

    const registrations = new Map<string, Registration>();
    const activityTargets = new Map<string, string>();

    const registrationFor = (workflowName: string) =>
      Effect.suspend(() => {
        const reg = registrations.get(workflowName);
        return reg
          ? Effect.succeed(reg)
          : Effect.die(`LambdaWorkflowEngine: workflow ${workflowName} is not registered`);
      });

    const decodeResult = (registration: Registration, result: unknown) =>
      Effect.orDie(Schema.decodeUnknownEffect(registration.resultJson)(result)) as Effect.Effect<
        Workflow.Result<unknown, unknown>
      >;

    // ── message processor (replay + clock) ────────────────────────────

    const runWorkflow = Effect.fnUntraced(function* (executionId: string, targetActivityId?: string) {
      const record = yield* storage.getExecution(executionId);
      if (Option.isNone(record)) {
        return yield* Effect.die(`LambdaWorkflowEngine: unknown execution ${executionId}`);
      }

      if (Option.isSome(record.value.result)) {
        yield* Effect.logDebug('workflow replay skipped — result already persisted').pipe(
          Effect.annotateLogs({ workflowName: record.value.workflowName, executionId }),
        );
        return;
      }

      const registration = yield* registrationFor(record.value.workflowName);
      const payload = yield* Effect.orDie(Schema.decodeUnknownEffect(registration.payloadJson)(record.value.payload)) as Effect.Effect<unknown>;

      yield* Effect.logInfo('workflow replay started').pipe(
        Effect.annotateLogs({ workflowName: record.value.workflowName, executionId, targetActivityId }),
      );

      const instance = WorkflowEngine.WorkflowInstance.initial(registration.workflow, executionId);
      instance.interrupted = record.value.interrupted;

      if (targetActivityId !== undefined) {
        activityTargets.set(executionId, targetActivityId);
      }

      const result = yield* registration.execute(payload as object, executionId).pipe(
        Effect.onExit(() => {
          if (!instance.interrupted) {
            return Effect.void;
          }
          instance.suspended = false;
          return Effect.withFiber(fiber => Effect.interruptible(Fiber.interrupt(fiber)));
        }),
        Workflow.intoResult,
        Effect.provideService(WorkflowEngine.WorkflowInstance, instance),
        Effect.provideService(WorkflowEngine.WorkflowEngine, engine),
        Effect.ensuring(Effect.sync(() => activityTargets.delete(executionId))),
      );

      if (result._tag === 'Complete') {
        if (Exit.isFailure(result.exit) && Cause.hasDies(result.exit.cause)) {
          yield* Effect.logWarning('workflow crashed — rethrowing so the queue redelivers').pipe(
            Effect.annotateLogs({ workflowName: record.value.workflowName, executionId }),
          );
          return yield* Effect.failCause(result.exit.cause as Cause.Cause<never>);
        }

        const encoded = yield* Effect.orDie(Schema.encodeUnknownEffect(registration.resultJson)(result)) as Effect.Effect<unknown>;
        yield* storage.setExecutionResult(executionId, encoded);
        yield* Effect.logInfo('workflow completed').pipe(
          Effect.annotateLogs({ workflowName: record.value.workflowName, executionId }),
        );
      } else {
        yield* Effect.logInfo('workflow suspended (awaiting activities or deferreds)').pipe(
          Effect.annotateLogs({ workflowName: record.value.workflowName, executionId }),
        );
      }
    });

    const processClock = Effect.fnUntraced(function* (message: Extract<EffectWorkflowMessage, { _tag: 'RunClock' }>) {
      const now = yield* Clock.currentTimeMillis;
      if (now < message.wakeUpAt) {
        yield* send(message, { delay: Duration.millis(message.wakeUpAt - now) });
        return;
      }

      const newlyDone = yield* storage.setDeferred(message.executionId, message.deferredName, message.exit);
      if (newlyDone) {
        yield* Effect.logInfo('durable clock fired').pipe(
          Effect.annotateLogs({ executionId: message.executionId, deferredName: message.deferredName }),
        );
        yield* send({ _tag: 'RunWorkflow', executionId: message.executionId });
      }
    });

    const processMessage = (message: EffectWorkflowMessage): Effect.Effect<void> => {
      switch (message._tag) {
        case 'RunWorkflow':
          return runWorkflow(message.executionId);
        case 'RunActivity':
          return runWorkflow(message.executionId, message.activityId).pipe(
            Effect.andThen(send({ _tag: 'RunWorkflow', executionId: message.executionId })),
          );
        case 'RunClock':
          return processClock(message);
      }
    };

    // ── workflow engine (register, execute, poll, etc.) ───────────────

    const engine = WorkflowEngine.makeUnsafe({
      register: (workflow, execute) =>
        Effect.sync(() => {
          const workflowWithProps = workflow as Workflow.AnyWithProps;
          registrations.set(workflow.name, {
            workflow: workflowWithProps,
            execute: execute as Registration['execute'],
            payloadJson: Schema.toCodecJson(workflowWithProps.payloadSchema),
            resultJson: Schema.toCodecJson(
              Workflow.Result({
                success: workflowWithProps.successSchema,
                error: workflowWithProps.errorSchema,
              }),
            ),
          });
        }),

      execute: (workflow, options) =>
        Effect.gen(function* () {
          const registration = yield* registrationFor(workflow.name);
          const record = yield* storage.getExecution(options.executionId);

          if (Option.isNone(record)) {
            const payload = yield* Effect.orDie(Schema.encodeUnknownEffect(registration.payloadJson)(options.payload)) as Effect.Effect<unknown>;
            if (
              yield* storage.createExecution({
                executionId: options.executionId,
                workflowName: workflow.name,
                payload,
              })
            ) {
              yield* send({ _tag: 'RunWorkflow', executionId: options.executionId });
            }
          }

          if (options.discard) {
            return undefined;
          }

          const result = Option.flatMap(yield* storage.getExecution(options.executionId), execution => execution.result);
          if (Option.isNone(result)) {
            return new Workflow.Suspended({ cause: undefined });
          }

          return yield* decodeResult(registration, result.value);
        }) as never,

      poll: Effect.fnUntraced(function* (workflow, executionId) {
        const registration = yield* registrationFor(workflow.name);
        const record = yield* storage.getExecution(executionId);
        const result = Option.flatMap(record, execution => execution.result);
        if (Option.isNone(result)) {
          return Option.none();
        }

        return Option.some(yield* decodeResult(registration, result.value));
      }),

      interrupt: (_workflow, executionId) =>
        storage
          .setExecutionInterrupted(executionId)
          .pipe(Effect.andThen(send({ _tag: 'RunWorkflow', executionId }))),

      interruptUnsafe: (_workflow, executionId) =>
        storage
          .setExecutionInterrupted(executionId)
          .pipe(Effect.andThen(send({ _tag: 'RunWorkflow', executionId }))),

      resume: (_workflow, executionId) => send({ _tag: 'RunWorkflow', executionId }),

      activityExecute: Effect.fnUntraced(function* (anyActivity, attempt) {
        const activity = anyActivity as Activity.Activity<Schema.Top, Schema.Top>;
        const instance = yield* WorkflowEngine.WorkflowInstance;
        const activityId = `${instance.executionId}/${activity.name}/${attempt}`;
        const exitJson = Schema.toCodecJson(activity.exitSchema);

        const stored = yield* storage.getActivityExit(activityId);
        if (Option.isSome(stored)) {
          yield* Effect.logDebug('activity replayed from history').pipe(
            Effect.annotateLogs({ activityId, activityName: activity.name }),
          );
          const decoded = yield* Effect.orDie(Schema.decodeUnknownEffect(exitJson)(stored.value)) as Effect.Effect<unknown>;
          const exit = yield* Effect.orDie(
            Schema.encodeEffect(activity.exitSchema)(decoded as never),
          ) as Effect.Effect<unknown>;
          return new Workflow.Complete({ exit: exit as Exit.Exit<unknown, unknown> });
        }

        if (activityTargets.get(instance.executionId) === activityId) {
          yield* Effect.logInfo('activity executing').pipe(
            Effect.annotateLogs({ activityId, activityName: activity.name, attempt }),
          );
          const activityInstance = WorkflowEngine.WorkflowInstance.initial(instance.workflow, instance.executionId);
          activityInstance.interrupted = instance.interrupted;
          const result = yield* activity.executeEncoded.pipe(
            Workflow.intoResult,
            Effect.provideService(WorkflowEngine.WorkflowInstance, activityInstance),
          ) as Effect.Effect<Workflow.Result<unknown, unknown>>;
          if (result._tag === 'Complete') {
            if (Exit.isFailure(result.exit) && Cause.hasDies(result.exit.cause)) {
              yield* Effect.logWarning('activity crashed — rethrowing so the queue redelivers').pipe(
                Effect.annotateLogs({ activityId, activityName: activity.name, attempt }),
              );
              return yield* Effect.failCause(result.exit.cause as Cause.Cause<never>);
            }

            yield* Effect.logInfo('activity completed').pipe(
              Effect.annotateLogs({ activityId, exitTag: result.exit._tag }),
            );
            const decoded = yield* Effect.orDie(
              Schema.decodeEffect(activity.exitSchema)(Exit.map(result.exit, (value) => value ?? null) as never),
            ) as Effect.Effect<unknown>;
            const encoded = yield* Effect.orDie(Schema.encodeUnknownEffect(exitJson)(decoded)) as Effect.Effect<unknown>;
            yield* storage.setActivityExit(activityId, encoded);
          }

          return result;
        }

        if (yield* storage.markActivityEnqueued(activityId)) {
          yield* Effect.logInfo('activity dispatched to queue').pipe(
            Effect.annotateLogs({ activityId, activityName: activity.name, attempt }),
          );
          yield* send({
            _tag: 'RunActivity',
            executionId: instance.executionId,
            activityId,
            attempt,
          });
        }

        return new Workflow.Suspended({ cause: undefined });
      }),

      deferredResult: deferred =>
        Effect.gen(function* () {
          const instance = yield* WorkflowEngine.WorkflowInstance;
          const stored = yield* storage.getDeferred(instance.executionId, deferred.name);
          return stored as Option.Option<Exit.Exit<unknown, unknown>>;
        }),

      deferredDone: options =>
        Effect.gen(function* () {
          const newlyDone = yield* storage.setDeferred(options.executionId, options.deferredName, options.exit);
          if (newlyDone) {
            yield* send({ _tag: 'RunWorkflow', executionId: options.executionId });
          }
        }),

      scheduleClock: Effect.fnUntraced(function* (_workflow, options) {
        const { clock } = options;
        const exit = yield* Effect.orDie(
          Schema.encodeEffect(clock.deferred.exitSchema)(Exit.void as never),
        ) as Effect.Effect<unknown>;
        const now = yield* Clock.currentTimeMillis;
        const wakeUpAt = now + Duration.toMillis(clock.duration);

        yield* Effect.logInfo('durable clock scheduled').pipe(
          Effect.annotateLogs({ executionId: options.executionId, deferredName: clock.deferred.name, wakeUpAt }),
        );

        yield* send(
          {
            _tag: 'RunClock',
            executionId: options.executionId,
            deferredName: clock.deferred.name,
            wakeUpAt,
            exit,
          },
          { delay: clock.duration },
        );
      }),
    });

    return { engine, processMessage };
  });
