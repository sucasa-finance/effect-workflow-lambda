import {Effect, Layer, Option} from 'effect';
import * as Redis from 'effect/unstable/persistence/Redis';

import {type EffectWorkflowExecutionRecord, EffectWorkflowStorage} from './WorkflowStorage.js';

const PREFIX = 'ewf:';

const makeRedisStorage = Effect.gen(function* () {
  const redis = yield* Redis.Redis;

  const getJson = (key: string): Effect.Effect<Option.Option<unknown>> =>
    redis.send<string | null>('GET', key).pipe(
      Effect.map(v => Option.map(Option.fromNullishOr(v), JSON.parse as (v: string) => unknown)),
      Effect.orDie,
    );

  const setJson = (key: string, value: unknown): Effect.Effect<void> =>
    redis.send('SET', key, JSON.stringify(value)).pipe(Effect.asVoid, Effect.orDie);

  const setNx = (key: string, value: string): Effect.Effect<boolean> =>
    redis.send<number>('SETNX', key, value).pipe(Effect.map(r => r === 1), Effect.orDie);

  const del = (key: string): Effect.Effect<void> =>
    redis.send('DEL', key).pipe(Effect.asVoid, Effect.orDie);

  const sadd = (key: string, member: string): Effect.Effect<void> =>
    redis.send('SADD', key, member).pipe(Effect.asVoid, Effect.orDie);

  const smembers = (key: string): Effect.Effect<string[]> =>
    redis.send<string[]>('SMEMBERS', key).pipe(Effect.map(v => v ?? []), Effect.orDie);

  const execKey = (id: string) => `${PREFIX}exec:${id}`;
  const actKey = (id: string) => `${PREFIX}act:${id}`;
  const enqKey = (id: string) => `${PREFIX}enq:${id}`;
  const defKey = (execId: string, name: string) => `${PREFIX}def:${execId}/${name}`;
  const idxKey = (execId: string) => `${PREFIX}idx:${execId}`;

  return EffectWorkflowStorage.of({
    getExecution: executionId =>
      getJson(execKey(executionId)).pipe(
        Effect.map(opt =>
          Option.map(opt, (raw): EffectWorkflowExecutionRecord => {
            const r = raw as any;
            return {
              workflowName: r.workflowName,
              payload: r.payload,
              result: r.hasResult ? Option.some(r.result) : Option.none(),
              interrupted: Boolean(r.interrupted),
            };
          }),
        ),
      ),

    createExecution: ({executionId, workflowName, payload}) =>
      setNx(execKey(executionId), JSON.stringify({
        workflowName,
        payload,
        hasResult: false,
        result: null,
        interrupted: false,
      })),

    setExecutionResult: (executionId, result) =>
      getJson(execKey(executionId)).pipe(
        Effect.flatMap(opt =>
          Option.match(opt, {
            onNone: () => Effect.void,
            onSome: raw => {
              const state = raw as any;
              if (state.hasResult) return Effect.void;
              return setJson(execKey(executionId), {...state, hasResult: true, result});
            },
          }),
        ),
        Effect.asVoid,
      ),

    setExecutionInterrupted: executionId =>
      getJson(execKey(executionId)).pipe(
        Effect.flatMap(opt =>
          Option.match(opt, {
            onNone: () => Effect.void,
            onSome: raw => {
              const state = raw as any;
              return setJson(execKey(executionId), {...state, interrupted: true});
            },
          }),
        ),
        Effect.asVoid,
      ),

    getActivityExit: activityId => getJson(actKey(activityId)),

    setActivityExit: (activityId, exit) =>
      redis.send<number>('EXISTS', actKey(activityId)).pipe(
        Effect.flatMap(exists => (exists === 1 ? Effect.void : setJson(actKey(activityId), exit))),
        Effect.asVoid,
        Effect.orDie,
      ),

    markActivityEnqueued: activityId =>
      setNx(enqKey(activityId), '1').pipe(
        Effect.flatMap(wasNew => {
          if (!wasNew) return Effect.succeed(false);
          const parts = activityId.split('/');
          const executionId = parts.slice(0, -2).join('/');
          return sadd(idxKey(executionId), activityId).pipe(Effect.as(true));
        }),
      ),

    getDeferred: (executionId, deferredName) => getJson(defKey(executionId, deferredName)),

    setDeferred: (executionId, deferredName, exit) =>
      setNx(defKey(executionId, deferredName), JSON.stringify(exit)).pipe(
        Effect.map(wasNew => wasNew),
      ),

    resetExecution: executionId =>
      getJson(execKey(executionId)).pipe(
        Effect.flatMap(opt =>
          Option.match(opt, {
            onNone: () => Effect.succeed(false),
            onSome: raw => {
              const state = raw as any;
              if (!state.hasResult) return Effect.succeed(false);
              return Effect.gen(function* () {
                yield* setJson(execKey(executionId), {
                  ...state,
                  hasResult: false,
                  result: null,
                  interrupted: false,
                });
                const ids = yield* smembers(idxKey(executionId));
                for (const activityId of ids) {
                  const exitOpt = yield* getJson(actKey(activityId));
                  if (Option.isSome(exitOpt)) {
                    const exit = exitOpt.value as {_tag?: string};
                    if (exit?._tag !== 'Success') {
                      yield* del(actKey(activityId));
                      yield* del(enqKey(activityId));
                    }
                  }
                }
                return true;
              });
            },
          }),
        ),
      ),
  });
});

export const EffectWorkflowStorageRedisLive: Layer.Layer<EffectWorkflowStorage, never, Redis.Redis> =
  Layer.effect(EffectWorkflowStorage)(makeRedisStorage);
