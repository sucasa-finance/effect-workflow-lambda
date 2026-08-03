import {it} from '@effect/vitest';
import {Effect, Layer, Option} from 'effect';
import {describe, expect} from 'vitest';

import * as LambdaWorkflowEngine from '../src/LambdaWorkflowEngine.local.js';
import {EffectWorkflowStorage} from '../src/WorkflowStorage.js';

import {LargePayloadWorkflow} from '@effect-workflow-engine/workflows/large-payload.workflow.define';
import {LargePayloadWorkflowHandler} from '@effect-workflow-engine/workflows/large-payload.workflow.live';

const TestLayer = LargePayloadWorkflowHandler.pipe(Layer.provideMerge(LambdaWorkflowEngine.layer));

const pollUntilComplete = (executionId: string) =>
  Effect.gen(function* () {
    let result = yield* LargePayloadWorkflow.poll(executionId);
    while (Option.isNone(result) || result.value._tag !== 'Complete') {
      yield* Effect.sleep('100 millis');
      result = yield* LargePayloadWorkflow.poll(executionId);
    }
    return result.value;
  });

describe('LargePayload — JSON round-trip edge cases', () => {
  it.live(
    'stores and retrieves unicode, nested objects, and 100KB+ strings',
    () =>
      Effect.gen(function* () {
        const storage = yield* EffectWorkflowStorage;

        const unicodeText = '你好世界 🌍 مرحبا بالعالم Привет мир café résumé naïve';
        const items = Array.from({length: 50}, (_, i) => ({key: `k-${i}`, value: `v-${i}-${'x'.repeat(100)}`}));
        const largeString = 'A'.repeat(100_000);

        const payload = {id: 'lp-1', unicodeText, nested: {items}, largeString};

        yield* LargePayloadWorkflow.execute(payload, {discard: true});
        const executionId = yield* LargePayloadWorkflow.executionId(payload);

        const result = yield* pollUntilComplete(executionId);
        expect(result.exit._tag).toBe('Success');
        if (result.exit._tag === 'Success') {
          expect(result.exit.value).toEqual({
            echoId: 'lp-1',
            unicodeLength: unicodeText.length,
            itemCount: 50,
            largeStringLength: 100_000,
          });
        }

        const record = yield* storage.getExecution(executionId);
        expect(Option.isSome(record)).toBe(true);
        if (Option.isSome(record)) {
          const storedPayload = record.value.payload as {unicodeText: string; nested: {items: unknown[]}; largeString: string};
          expect(storedPayload.unicodeText).toBe(unicodeText);
          expect(storedPayload.nested.items).toHaveLength(50);
          expect(storedPayload.largeString.length).toBe(100_000);
        }
      }).pipe(Effect.provide(TestLayer)),
    15_000,
  );
});
