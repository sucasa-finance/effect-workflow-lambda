import {Effect, Layer, Option} from 'effect';
import * as KeyValueStore from 'effect/unstable/persistence/KeyValueStore';

import {type EffectWorkflowExecutionRecord, EffectWorkflowStorage} from './WorkflowStorage.js';

const makeMemoryStorage = Effect.gen(function* () {
  const kv = yield* KeyValueStore.KeyValueStore;
  const executions = KeyValueStore.prefix(kv, 'executions/');
  const activities = KeyValueStore.prefix(kv, 'activities/');
  const enqueued = KeyValueStore.prefix(kv, 'enqueued/');
  const deferreds = KeyValueStore.prefix(kv, 'deferreds/');
  const activityIndex = KeyValueStore.prefix(kv, 'activity-index/');

  const getJson = (store: KeyValueStore.KeyValueStore, key: string) =>
    Effect.map(store.get(key), v => Option.map(Option.fromNullishOr(v), JSON.parse as (v: string) => unknown));

  const setJson = (store: KeyValueStore.KeyValueStore, key: string, value: unknown) =>
    store.set(key, JSON.stringify(value));

  const trackActivity = (executionId: string, activityId: string) =>
    getJson(activityIndex, executionId).pipe(
      Effect.flatMap(opt => {
        const ids: string[] = Option.getOrElse(opt, () => []) as string[];
        if (!ids.includes(activityId)) ids.push(activityId);
        return setJson(activityIndex, executionId, ids);
      }),
    );

  return EffectWorkflowStorage.of({
    getExecution: executionId =>
      getJson(executions, executionId).pipe(
        Effect.map(opt =>
          Option.map(
            opt,
            (raw): EffectWorkflowExecutionRecord => {
              const r = raw as any;
              return {
                workflowName: r.workflowName,
                payload: r.payload,
                result: r.hasResult ? Option.some(r.result) : Option.none(),
                interrupted: Boolean(r.interrupted),
              };
            },
          ),
        ),
        Effect.orDie,
      ),

    createExecution: ({executionId, workflowName, payload}) =>
      executions.has(executionId).pipe(
        Effect.flatMap(exists => {
          if (exists) return Effect.succeed(false);
          return setJson(executions, executionId, {
            workflowName,
            payload,
            hasResult: false,
            result: null,
            interrupted: false,
          }).pipe(Effect.as(true));
        }),
        Effect.orDie,
      ),

    setExecutionResult: (executionId, result) =>
      getJson(executions, executionId).pipe(
        Effect.flatMap(opt =>
          Option.match(opt, {
            onNone: () => Effect.void,
            onSome: raw => {
              const state = raw as any;
              if (state.hasResult) return Effect.void;
              return setJson(executions, executionId, {...state, hasResult: true, result});
            },
          }),
        ),
        Effect.asVoid,
        Effect.orDie,
      ),

    setExecutionInterrupted: executionId =>
      getJson(executions, executionId).pipe(
        Effect.flatMap(opt =>
          Option.match(opt, {
            onNone: () => Effect.void,
            onSome: raw => {
              const state = raw as any;
              return setJson(executions, executionId, {...state, interrupted: true});
            },
          }),
        ),
        Effect.asVoid,
        Effect.orDie,
      ),

    getActivityExit: activityId => getJson(activities, activityId).pipe(Effect.orDie),

    setActivityExit: (activityId, exit) =>
      activities.has(activityId).pipe(
        Effect.flatMap(exists => (exists ? Effect.void : setJson(activities, activityId, exit))),
        Effect.asVoid,
        Effect.orDie,
      ),

    markActivityEnqueued: activityId =>
      enqueued.has(activityId).pipe(
        Effect.flatMap(exists => {
          if (exists) return Effect.succeed(false);
          const executionId = activityId.split('/').slice(0, -1).join('/');
          return Effect.all([enqueued.set(activityId, '1'), trackActivity(executionId, activityId)]).pipe(
            Effect.as(true),
          );
        }),
        Effect.orDie,
      ),

    getDeferred: (executionId, deferredName) =>
      getJson(deferreds, `${executionId}/${deferredName}`).pipe(Effect.orDie),

    setDeferred: (executionId, deferredName, exit) => {
      const key = `${executionId}/${deferredName}`;
      return deferreds.has(key).pipe(
        Effect.flatMap(exists => {
          if (exists) return Effect.succeed(false);
          return setJson(deferreds, key, exit).pipe(Effect.as(true));
        }),
        Effect.orDie,
      );
    },

    resetExecution: executionId =>
      getJson(executions, executionId).pipe(
        Effect.flatMap(opt =>
          Option.match(opt, {
            onNone: () => Effect.succeed(false),
            onSome: raw => {
              const state = raw as any;
              if (!state.hasResult) return Effect.succeed(false);
              return Effect.gen(function* () {
                yield* setJson(executions, executionId, {
                  ...state,
                  hasResult: false,
                  result: null,
                  interrupted: false,
                });
                const idsOpt = yield* getJson(activityIndex, executionId);
                const ids: string[] = (Option.getOrElse(idsOpt, () => []) as string[]);
                for (const activityId of ids) {
                  const exitOpt = yield* getJson(activities, activityId);
                  if (Option.isSome(exitOpt)) {
                    const exit = exitOpt.value as {_tag?: string};
                    if (exit?._tag !== 'Success') {
                      yield* activities.remove(activityId);
                      yield* enqueued.remove(activityId);
                    }
                  }
                }
                return true;
              });
            },
          }),
        ),
        Effect.orDie,
      ),
  });
});

export const EffectWorkflowStorageKvLive: Layer.Layer<
  EffectWorkflowStorage,
  never,
  KeyValueStore.KeyValueStore
> = Layer.effect(EffectWorkflowStorage)(makeMemoryStorage);
