import {Effect, Schema} from 'effect';
import {Activity} from 'effect/unstable/workflow';

import {FanOutWorkflow} from './fan-out.workflow.define.js';
import type {WorkflowModule} from './module.js';

export const FanOutWorkflowHandler = FanOutWorkflow.toLayer(
  Effect.fnUntraced(function* ({count}) {
    yield* Effect.logInfo('fan-out workflow started').pipe(Effect.annotateLogs({count}));

    const results = yield* Effect.all(
      Array.from({length: count}, (_, i) =>
        Activity.make({
          name: `task-${i}`,
          success: Schema.String,
          execute: Effect.fn(`task-${i}`)(function* () {
            yield* Effect.logInfo(`task-${i} activity executing`);
            yield* Effect.sleep('100 millis');
            return `result-${i}`;
          })(),
        }),
      ),
      {concurrency: 'unbounded'},
    );

    yield* Effect.logInfo('fan-out workflow completed').pipe(Effect.annotateLogs({count, results}));
    return results as unknown as ReadonlyArray<string>;
  }),
);

export const FanOutModule: WorkflowModule = {
  workflow: FanOutWorkflow,
  handler: FanOutWorkflowHandler,
};
