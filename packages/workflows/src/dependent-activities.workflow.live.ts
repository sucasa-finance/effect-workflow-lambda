import {Effect, Schema} from 'effect';
import {Activity} from 'effect/unstable/workflow';

import {DependentActivitiesWorkflow} from './dependent-activities.workflow.define.js';
import type {WorkflowModule} from './module.js';

const task = (name: string, millis: number) =>
  Activity.make({
    name,
    success: Schema.String,
    execute: Effect.fn(name)(function* () {
      yield* Effect.logInfo(`${name} activity executing`);
      yield* Effect.sleep(millis);
      return name;
    })(),
  });

// `dependent` waits on `first`; `independent` is dispatched while `first` runs but is listed after `dependent`, so a
// replay targeting `independent` is suspended by the still-pending `dependent` before it reaches its target.
export const DependentActivitiesWorkflowHandler = DependentActivitiesWorkflow.toLayer(
  Effect.fnUntraced(function* () {
    const first = yield* Effect.cached(task('first', 50));
    const dependent = first.pipe(Effect.flatMap(() => task('dependent', 100)));
    const independent = task('independent', 10);

    return yield* Effect.all([first, dependent, independent], {concurrency: 'unbounded'});
  }),
);

export const DependentActivitiesModule: WorkflowModule = {
  workflow: DependentActivitiesWorkflow,
  handler: DependentActivitiesWorkflowHandler,
};
