import {it} from '@effect/vitest';
import {Effect, Layer, Option} from 'effect';
import {describe, expect} from 'vitest';

import * as LambdaWorkflowEngine from '../src/LambdaWorkflowEngine.local.js';

import {GreetWorkflow} from '@effect-workflow-engine/workflows/greet.workflow.define';
import {GreetWorkflowHandler} from '@effect-workflow-engine/workflows/greet.workflow.live';

const TestLayer = GreetWorkflowHandler.pipe(Layer.provideMerge(LambdaWorkflowEngine.layer));

describe('GreetWorkflow via EffectWorkflowEngine', () => {
  it.live(
    'runs concurrent activities, a durable sleep, and a farewell activity',
    () =>
      Effect.gen(function* () {
        const result = yield* GreetWorkflow.execute({name: 'world'});

        expect(result).toEqual({greeting: 'hello, World', farewell: 'goodbye, World'});
      }).pipe(Effect.provide(TestLayer)),
    15_000,
  );

  it.live(
    'interrupting a workflow mid durable sleep persists an interrupted result',
    () =>
      Effect.gen(function* () {
        yield* GreetWorkflow.execute({name: 'doomed'}, {discard: true});
        const executionId = yield* GreetWorkflow.executionId({name: 'doomed'});

        yield* Effect.sleep('1 second');
        yield* GreetWorkflow.interrupt(executionId);

        let result = yield* GreetWorkflow.poll(executionId);
        while (Option.isNone(result)) {
          yield* Effect.sleep('100 millis');
          result = yield* GreetWorkflow.poll(executionId);
        }

        expect(result.value._tag).toBe('Complete');
        if (result.value._tag === 'Complete') {
          expect(result.value.exit._tag).toBe('Failure');
        }
      }).pipe(Effect.provide(TestLayer)),
    15_000,
  );

  it.live(
    'resume replays a suspended workflow without re-running completed activities',
    () =>
      Effect.gen(function* () {
        yield* GreetWorkflow.execute({name: 'phoenix'}, {discard: true});
        const executionId = yield* GreetWorkflow.executionId({name: 'phoenix'});

        yield* Effect.sleep('1 second');
        yield* GreetWorkflow.resume(executionId);

        let result = yield* GreetWorkflow.poll(executionId);
        while (Option.isNone(result) || result.value._tag !== 'Complete') {
          yield* Effect.sleep('100 millis');
          result = yield* GreetWorkflow.poll(executionId);
        }

        expect(result.value.exit).toMatchObject({
          _tag: 'Success',
          value: {greeting: 'hello, Phoenix', farewell: 'goodbye, Phoenix'},
        });
      }).pipe(Effect.provide(TestLayer)),
    15_000,
  );
});
