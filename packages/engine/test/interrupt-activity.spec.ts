import {it} from '@effect/vitest';
import {Cause, Effect, Layer, Option} from 'effect';
import {DurableDeferred} from 'effect/unstable/workflow';
import {describe, expect} from 'vitest';

import * as LambdaWorkflowEngine from '../src/LambdaWorkflowEngine.local.js';
import {EffectWorkflowStorage} from '../src/WorkflowStorage.js';

import {InterruptActivityWorkflow, WorkSignal} from '@effect-workflow-engine/workflows/interrupt-activity.workflow.define';
import {InterruptActivityWorkflowHandler} from '@effect-workflow-engine/workflows/interrupt-activity.workflow.live';

const TestLayer = InterruptActivityWorkflowHandler.pipe(Layer.provideMerge(LambdaWorkflowEngine.layer));

describe('InterruptActivity — interrupt a suspended workflow', () => {
  it.live(
    'interrupting while awaiting a signal persists a failure with interrupt cause',
    () =>
      Effect.gen(function* () {
        yield* InterruptActivityWorkflow.execute({id: 'int-1'}, {discard: true});
        const executionId = yield* InterruptActivityWorkflow.executionId({id: 'int-1'});

        yield* Effect.sleep('500 millis');

        let result = yield* InterruptActivityWorkflow.poll(executionId);
        expect(Option.isNone(result)).toBe(true);

        yield* InterruptActivityWorkflow.interrupt(executionId);

        let attempts = 0;
        while (Option.isNone(result) && attempts < 50) {
          yield* Effect.sleep('100 millis');
          result = yield* InterruptActivityWorkflow.poll(executionId);
          attempts++;
        }

        expect(Option.isSome(result)).toBe(true);
        if (Option.isSome(result)) {
          expect(result.value._tag).toBe('Complete');
          if (result.value._tag === 'Complete') {
            expect(result.value.exit._tag).toBe('Failure');
            if (result.value.exit._tag === 'Failure') {
              expect(Cause.hasInterruptsOnly(result.value.exit.cause)).toBe(true);
            }
          }
        }
      }).pipe(Effect.provide(TestLayer)),
    15_000,
  );

  it.live(
    'after interrupt + redrive, workflow resumes and completes when signal arrives',
    () =>
      Effect.gen(function* () {
        const storage = yield* EffectWorkflowStorage;

        yield* InterruptActivityWorkflow.execute({id: 'int-2'}, {discard: true});
        const executionId = yield* InterruptActivityWorkflow.executionId({id: 'int-2'});

        yield* Effect.sleep('500 millis');
        yield* InterruptActivityWorkflow.interrupt(executionId);

        let result = yield* InterruptActivityWorkflow.poll(executionId);
        let attempts = 0;
        while (Option.isNone(result) && attempts < 50) {
          yield* Effect.sleep('100 millis');
          result = yield* InterruptActivityWorkflow.poll(executionId);
          attempts++;
        }

        expect(Option.isSome(result)).toBe(true);

        const wasReset = yield* storage.resetExecution(executionId);
        expect(wasReset).toBe(true);
        yield* InterruptActivityWorkflow.resume(executionId);

        yield* Effect.sleep('500 millis');
        result = yield* InterruptActivityWorkflow.poll(executionId);
        expect(Option.isNone(result)).toBe(true);

        const token = DurableDeferred.tokenFromExecutionId(WorkSignal, {workflow: InterruptActivityWorkflow, executionId});
        yield* DurableDeferred.succeed(WorkSignal, {token, value: 'signal-value'});

        result = yield* InterruptActivityWorkflow.poll(executionId);
        attempts = 0;
        while ((Option.isNone(result) || result.value._tag !== 'Complete') && attempts < 100) {
          yield* Effect.sleep('100 millis');
          result = yield* InterruptActivityWorkflow.poll(executionId);
          attempts++;
        }

        expect(Option.isSome(result)).toBe(true);
        if (Option.isSome(result) && result.value._tag === 'Complete') {
          expect(result.value.exit._tag).toBe('Success');
          if (result.value.exit._tag === 'Success') {
            expect(result.value.exit.value).toBe('completed-int-2-signal-value');
          }
        }
      }).pipe(Effect.provide(TestLayer)),
    30_000,
  );
});
