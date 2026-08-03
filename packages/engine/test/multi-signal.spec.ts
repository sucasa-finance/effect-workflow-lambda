import {it} from '@effect/vitest';
import {Effect, Layer, Option} from 'effect';
import {DurableDeferred} from 'effect/unstable/workflow';
import {describe, expect} from 'vitest';

import * as LambdaWorkflowEngine from '../src/LambdaWorkflowEngine.local.js';

import {LegalSignal, ManagerSignal, MultiSignalWorkflow} from '@effect-workflow-engine/workflows/multi-signal.workflow.define';
import {MultiSignalWorkflowHandler} from '@effect-workflow-engine/workflows/multi-signal.workflow.live';

const TestLayer = MultiSignalWorkflowHandler.pipe(Layer.provideMerge(LambdaWorkflowEngine.layer));

const pollUntilComplete = (executionId: string) =>
  Effect.gen(function* () {
    let result = yield* MultiSignalWorkflow.poll(executionId);
    while (Option.isNone(result) || result.value._tag !== 'Complete') {
      yield* Effect.sleep('100 millis');
      result = yield* MultiSignalWorkflow.poll(executionId);
    }
    return result.value;
  });

describe('MultiSignal — multiple concurrent durable deferreds', () => {
  it.live(
    'first signal alone does not complete; second signal completes the workflow',
    () =>
      Effect.gen(function* () {
        yield* MultiSignalWorkflow.execute({requestId: 'ms-1'}, {discard: true});
        const executionId = yield* MultiSignalWorkflow.executionId({requestId: 'ms-1'});

        yield* Effect.sleep('500 millis');
        let result = yield* MultiSignalWorkflow.poll(executionId);
        expect(Option.isNone(result) || result.value._tag === 'Suspended').toBe(true);

        const opts = {workflow: MultiSignalWorkflow, executionId};
        const mgrToken = DurableDeferred.tokenFromExecutionId(ManagerSignal, opts);
        yield* DurableDeferred.succeed(ManagerSignal, {token: mgrToken, value: {approvedBy: 'alice'}});

        yield* Effect.sleep('500 millis');
        result = yield* MultiSignalWorkflow.poll(executionId);
        expect(Option.isNone(result) || result.value._tag === 'Suspended').toBe(true);

        const legalToken = DurableDeferred.tokenFromExecutionId(LegalSignal, opts);
        yield* DurableDeferred.succeed(LegalSignal, {token: legalToken, value: {approvedBy: 'bob'}});

        const final = yield* pollUntilComplete(executionId);
        expect(final.exit._tag).toBe('Success');
        if (final.exit._tag === 'Success') {
          expect(final.exit.value).toEqual({managerApproval: 'alice', legalApproval: 'bob'});
        }
      }).pipe(Effect.provide(TestLayer)),
    15_000,
  );

  it.live(
    'signals arriving in reverse order also completes correctly',
    () =>
      Effect.gen(function* () {
        yield* MultiSignalWorkflow.execute({requestId: 'ms-2'}, {discard: true});
        const executionId = yield* MultiSignalWorkflow.executionId({requestId: 'ms-2'});

        yield* Effect.sleep('500 millis');

        const opts = {workflow: MultiSignalWorkflow, executionId};
        const legalToken = DurableDeferred.tokenFromExecutionId(LegalSignal, opts);
        yield* DurableDeferred.succeed(LegalSignal, {token: legalToken, value: {approvedBy: 'carol'}});

        yield* Effect.sleep('500 millis');
        let result = yield* MultiSignalWorkflow.poll(executionId);
        expect(Option.isNone(result) || result.value._tag === 'Suspended').toBe(true);

        const mgrToken = DurableDeferred.tokenFromExecutionId(ManagerSignal, opts);
        yield* DurableDeferred.succeed(ManagerSignal, {token: mgrToken, value: {approvedBy: 'dave'}});

        const final = yield* pollUntilComplete(executionId);
        expect(final.exit._tag).toBe('Success');
        if (final.exit._tag === 'Success') {
          expect(final.exit.value).toEqual({managerApproval: 'dave', legalApproval: 'carol'});
        }
      }).pipe(Effect.provide(TestLayer)),
    15_000,
  );
});
