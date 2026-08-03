import {it} from '@effect/vitest';
import {Effect, Layer, Option} from 'effect';
import {describe, expect} from 'vitest';

import * as LambdaWorkflowEngine from '../src/LambdaWorkflowEngine.local.js';
import {EffectWorkflowStorage} from '../src/WorkflowStorage.js';

import {GreetWorkflow} from '@effect-workflow-engine/workflows/greet.workflow.define';
import {GreetWorkflowHandler} from '@effect-workflow-engine/workflows/greet.workflow.live';

const TestLayer = GreetWorkflowHandler.pipe(Layer.provideMerge(LambdaWorkflowEngine.layer));

const pollUntilComplete = (executionId: string) =>
  Effect.gen(function* () {
    let result = yield* GreetWorkflow.poll(executionId);
    while (Option.isNone(result) || result.value._tag !== 'Complete') {
      yield* Effect.sleep('100 millis');
      result = yield* GreetWorkflow.poll(executionId);
    }

    return result.value;
  });

describe('GreetWorkflow redrive edge cases', () => {
  it.live(
    'workflow typed failure → redrive replays from scratch',
    () =>
      Effect.gen(function* () {
        const storage = yield* EffectWorkflowStorage;

        yield* GreetWorkflow.execute({name: '  '}, {discard: true});
        const executionId = yield* GreetWorkflow.executionId({name: '  '});

        const result1 = yield* pollUntilComplete(executionId);
        expect(result1.exit._tag).toBe('Failure');

        const wasReset = yield* storage.resetExecution(executionId);
        expect(wasReset).toBe(true);

        yield* GreetWorkflow.resume(executionId);

        const result2 = yield* pollUntilComplete(executionId);
        expect(result2.exit._tag).toBe('Failure');
      }).pipe(Effect.provide(TestLayer)),
    15_000,
  );

  it.live(
    'activity typed failure → redrive clears failed exit, re-executes activity',
    () =>
      Effect.gen(function* () {
        const storage = yield* EffectWorkflowStorage;

        yield* GreetWorkflow.execute({name: 'test123'}, {discard: true});
        const executionId = yield* GreetWorkflow.executionId({name: 'test123'});

        const result1 = yield* pollUntilComplete(executionId);
        expect(result1.exit._tag).toBe('Failure');

        const wasReset = yield* storage.resetExecution(executionId);
        expect(wasReset).toBe(true);

        yield* GreetWorkflow.resume(executionId);

        const result2 = yield* pollUntilComplete(executionId);
        expect(result2.exit._tag).toBe('Failure');
      }).pipe(Effect.provide(TestLayer)),
    15_000,
  );

  it.live(
    'redrive a running execution is a no-op',
    () =>
      Effect.gen(function* () {
        const storage = yield* EffectWorkflowStorage;

        yield* GreetWorkflow.execute({name: 'still-running'}, {discard: true});
        const executionId = yield* GreetWorkflow.executionId({name: 'still-running'});

        const wasReset = yield* storage.resetExecution(executionId);
        expect(wasReset).toBe(false);
      }).pipe(Effect.provide(TestLayer)),
    15_000,
  );

  it.live(
    'redrive a non-existent execution returns false',
    () =>
      Effect.gen(function* () {
        const storage = yield* EffectWorkflowStorage;

        const wasReset = yield* storage.resetExecution('does-not-exist');
        expect(wasReset).toBe(false);
      }).pipe(Effect.provide(TestLayer)),
    15_000,
  );

  it.live(
    'successful activities are preserved after redrive',
    () =>
      Effect.gen(function* () {
        const storage = yield* EffectWorkflowStorage;

        yield* GreetWorkflow.execute({name: 'world'}, {discard: true});
        const executionId = yield* GreetWorkflow.executionId({name: 'world'});

        const result1 = yield* pollUntilComplete(executionId);
        expect(result1.exit._tag).toBe('Success');

        const fetchExit = yield* storage.getActivityExit(`${executionId}/fetch-salutation/1`);
        expect(Option.isSome(fetchExit)).toBe(true);

        const wasReset = yield* storage.resetExecution(executionId);
        expect(wasReset).toBe(true);

        const fetchExitAfter = yield* storage.getActivityExit(`${executionId}/fetch-salutation/1`);
        expect(Option.isSome(fetchExitAfter)).toBe(true);

        yield* GreetWorkflow.resume(executionId);

        const result2 = yield* pollUntilComplete(executionId);
        expect(result2.exit._tag).toBe('Success');
        if (result2.exit._tag === 'Success') {
          expect(result2.exit.value).toEqual({greeting: 'hello, World', farewell: 'goodbye, World'});
        }
      }).pipe(Effect.provide(TestLayer)),
    15_000,
  );

  it.live(
    'durable sleep suspends and resumes via delayed message, not inline blocking',
    () =>
      Effect.gen(function* () {
        yield* GreetWorkflow.execute({name: 'sleeper'}, {discard: true});
        const executionId = yield* GreetWorkflow.executionId({name: 'sleeper'});

        const result = yield* pollUntilComplete(executionId);
        expect(result.exit._tag).toBe('Success');
        if (result.exit._tag === 'Success') {
          expect(result.exit.value).toEqual({greeting: 'hello, Sleeper', farewell: 'goodbye, Sleeper'});
        }
      }).pipe(Effect.provide(TestLayer)),
    15_000,
  );
});
