import {Effect, Schema} from 'effect';
import {Activity} from 'effect/unstable/workflow';

import {ActivityCrashWorkflow, SimulatedCrashError, WorkflowCrashWorkflow} from './crash.workflow.define.js';

const dieWhileBefore = (failUntilIso: string, site: string): Effect.Effect<void> =>
  Effect.suspend(() =>
    Date.now() < new Date(failUntilIso).getTime()
      ? Effect.die(new SimulatedCrashError({site, failUntilIso}))
      : Effect.void,
  );

export const WorkflowCrashWorkflowHandler = WorkflowCrashWorkflow.toLayer(
  Effect.fnUntraced(function* ({name, failUntilIso}) {
    yield* Effect.logInfo('workflow-crash workflow replaying').pipe(Effect.annotateLogs({name, failUntilIso}));
    yield* dieWhileBefore(failUntilIso, 'workflow body');

    yield* Effect.logInfo('workflow-crash workflow survived').pipe(Effect.annotateLogs({name}));

    return `workflow-crash survived, ${name}`;
  }),
);

export const ActivityCrashWorkflowHandler = ActivityCrashWorkflow.toLayer(
  Effect.fnUntraced(function* ({name, failUntilIso}) {
    yield* Effect.logInfo('activity-crash workflow replaying').pipe(Effect.annotateLogs({name, failUntilIso}));

    const outcome = yield* Activity.make({
      name: 'crash-prone',
      success: Schema.String,
      execute: Effect.fn('crash-prone')(function* () {
        yield* Effect.logInfo('crash-prone activity executing').pipe(Effect.annotateLogs({failUntilIso}));
        yield* dieWhileBefore(failUntilIso, 'crash-prone activity');
        return 'activity survived';
      })(),
    });

    yield* Effect.logInfo('activity-crash workflow finished').pipe(Effect.annotateLogs({name, outcome}));

    return `activity-crash finished, ${name}: ${outcome}`;
  }),
);
