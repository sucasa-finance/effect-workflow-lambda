import {it} from '@effect/vitest';
import {Effect, Layer, Option} from 'effect';
import {describe, expect} from 'vitest';

import * as LambdaWorkflowEngine from '../src/LambdaWorkflowEngine.local.js';

import {FanOutWorkflow} from '@effect-workflow-engine/workflows/fan-out.workflow.define';
import {FanOutWorkflowHandler} from '@effect-workflow-engine/workflows/fan-out.workflow.live';

const TestLayer = FanOutWorkflowHandler.pipe(Layer.provideMerge(LambdaWorkflowEngine.layer));

const pollUntilComplete = (executionId: string) =>
  Effect.gen(function* () {
    let result = yield* FanOutWorkflow.poll(executionId);
    while (Option.isNone(result) || result.value._tag !== 'Complete') {
      yield* Effect.sleep('100 millis');
      result = yield* FanOutWorkflow.poll(executionId);
    }
    return result.value;
  });

describe('FanOut — concurrent activity dispatch at scale', () => {
  it.live(
    'dispatches 5 concurrent activities and aggregates all results',
    () =>
      Effect.gen(function* () {
        yield* FanOutWorkflow.execute({count: 5}, {discard: true});
        const executionId = yield* FanOutWorkflow.executionId({count: 5});

        const result = yield* pollUntilComplete(executionId);
        expect(result.exit._tag).toBe('Success');
        if (result.exit._tag === 'Success') {
          const values = result.exit.value as ReadonlyArray<string>;
          expect(values).toHaveLength(5);
          for (let i = 0; i < 5; i++) {
            expect(values[i]).toBe(`result-${i}`);
          }
        }
      }).pipe(Effect.provide(TestLayer)),
    30_000,
  );
});
