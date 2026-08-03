import {it} from '@effect/vitest';
import {Effect, Layer, Option} from 'effect';
import {describe, expect} from 'vitest';

import * as LambdaWorkflowEngine from '../src/LambdaWorkflowEngine.local.js';
import {EffectWorkflowStorage} from '../src/WorkflowStorage.js';

import {DuplicateExecuteWorkflow} from '@effect-workflow-engine/workflows/duplicate-execute.workflow.define';
import {DuplicateExecuteWorkflowHandler, resetCallCount} from '@effect-workflow-engine/workflows/duplicate-execute.workflow.live';

const TestLayer = DuplicateExecuteWorkflowHandler.pipe(Layer.provideMerge(LambdaWorkflowEngine.layer));

const pollUntilComplete = (executionId: string) =>
  Effect.gen(function* () {
    let result = yield* DuplicateExecuteWorkflow.poll(executionId);
    while (Option.isNone(result) || result.value._tag !== 'Complete') {
      yield* Effect.sleep('100 millis');
      result = yield* DuplicateExecuteWorkflow.poll(executionId);
    }
    return result.value;
  });

describe('DuplicateExecute — idempotency', () => {
  it.live(
    'calling execute twice with the same idempotency key creates only one execution',
    () =>
      Effect.gen(function* () {
        resetCallCount();
        const storage = yield* EffectWorkflowStorage;

        yield* DuplicateExecuteWorkflow.execute({id: 'dup-1'}, {discard: true});
        yield* DuplicateExecuteWorkflow.execute({id: 'dup-1'}, {discard: true});

        const executionId = yield* DuplicateExecuteWorkflow.executionId({id: 'dup-1'});
        const result = yield* pollUntilComplete(executionId);

        expect(result.exit._tag).toBe('Success');
        if (result.exit._tag === 'Success') {
          expect(result.exit.value).toBe('done-dup-1-1');
        }

        const record = yield* storage.getExecution(executionId);
        expect(Option.isSome(record)).toBe(true);
      }).pipe(Effect.provide(TestLayer)),
    15_000,
  );
});
