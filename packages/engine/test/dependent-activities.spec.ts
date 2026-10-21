import {it} from '@effect/vitest';
import {Effect, Layer} from 'effect';
import {describe, expect} from 'vitest';

import * as LambdaWorkflowEngine from '../src/LambdaWorkflowEngine.local.js';

import {DependentActivitiesWorkflow} from '@effect-workflow-engine/workflows/dependent-activities.workflow.define';
import {DependentActivitiesWorkflowHandler} from '@effect-workflow-engine/workflows/dependent-activities.workflow.live';

const TestLayer = DependentActivitiesWorkflowHandler.pipe(Layer.provideMerge(LambdaWorkflowEngine.layer));

describe('DependentActivities — an activity the targeting replay never reaches', () => {
  it.live(
    'dispatches it again once a later replay reaches it',
    () =>
      Effect.gen(function* () {
        const result = yield* DependentActivitiesWorkflow.execute({id: 'dependent-1'});

        expect(result).toEqual(['first', 'dependent', 'independent']);
      }).pipe(Effect.provide(TestLayer)),
    15_000,
  );
});
