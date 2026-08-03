import {Effect, Layer, Option} from 'effect';
import {SqlClient} from 'effect/unstable/sql';

import {type EffectWorkflowExecutionRecord, EffectWorkflowStorage} from './WorkflowStorage.js';

function escapeLikePattern(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
}

const makeEffectWorkflowStorageMysql = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const insertIgnoringDuplicate = (insert: Effect.Effect<unknown, unknown>): Effect.Effect<boolean> =>
    insert.pipe(
      Effect.as(true),
      Effect.catch(() =>
        Effect.logDebug('effect workflow row already exists — treating insert as no-op').pipe(Effect.as(false)),
      ),
    );

  return EffectWorkflowStorage.of({
    getExecution: executionId =>
      sql<{
        workflow_name: string;
        payload: unknown;
        result: unknown | null;
        interrupted: boolean;
      }>`SELECT workflow_name, payload, result, interrupted
         FROM effect_workflow_executions
         WHERE execution_id = ${executionId}
         LIMIT 1`.pipe(
        Effect.map(rows =>
          Option.map(
            Option.fromNullishOr(rows[0]),
            (row): EffectWorkflowExecutionRecord => ({
              workflowName: row.workflow_name,
              payload: row.payload,
              result: Option.fromNullishOr(row.result),
              interrupted: Boolean(row.interrupted),
            }),
          ),
        ),
        Effect.orDie,
      ),

    createExecution: input =>
      insertIgnoringDuplicate(
        sql`INSERT INTO effect_workflow_executions (execution_id, workflow_name, payload)
            VALUES (${input.executionId}, ${input.workflowName}, ${JSON.stringify(input.payload)})`,
      ),

    setExecutionResult: (executionId, result) =>
      sql`UPDATE effect_workflow_executions
          SET result = ${JSON.stringify(result)}
          WHERE execution_id = ${executionId}
            AND result IS NULL`.pipe(Effect.asVoid, Effect.orDie),

    setExecutionInterrupted: executionId =>
      sql`UPDATE effect_workflow_executions
          SET interrupted = true
          WHERE execution_id = ${executionId}`.pipe(Effect.asVoid, Effect.orDie),

    getActivityExit: activityId =>
      sql<{exit_value: unknown}>`SELECT exit_value
         FROM effect_workflow_activities
         WHERE activity_id = ${activityId}
           AND exit_value IS NOT NULL
         LIMIT 1`.pipe(Effect.map(rows => Option.fromNullishOr(rows[0]?.exit_value)), Effect.orDie),

    setActivityExit: (activityId, exit) =>
      sql`INSERT INTO effect_workflow_activities (activity_id, exit_value)
          VALUES (${activityId}, ${JSON.stringify(exit)})
          ON DUPLICATE KEY UPDATE exit_value = COALESCE(exit_value, VALUES(exit_value))`.pipe(
        Effect.asVoid,
        Effect.orDie,
      ),

    markActivityEnqueued: activityId =>
      insertIgnoringDuplicate(
        sql`INSERT INTO effect_workflow_activities (activity_id, exit_value)
            VALUES (${activityId}, NULL)`,
      ),

    getDeferred: (executionId, deferredName) =>
      sql<{exit_value: unknown}>`SELECT exit_value
         FROM effect_workflow_deferreds
         WHERE execution_id = ${executionId}
           AND deferred_name = ${deferredName}
         LIMIT 1`.pipe(Effect.map(rows => Option.fromNullishOr(rows[0]?.exit_value)), Effect.orDie),

    setDeferred: (executionId, deferredName, exit) =>
      insertIgnoringDuplicate(
        sql`INSERT INTO effect_workflow_deferreds (execution_id, deferred_name, exit_value)
            VALUES (${executionId}, ${deferredName}, ${JSON.stringify(exit)})`,
      ),

    resetExecution: executionId =>
      Effect.gen(function* () {
        const rows = yield* sql<{result: unknown | null}>`SELECT result
          FROM effect_workflow_executions
          WHERE execution_id = ${executionId}
          LIMIT 1`;

        if (rows.length === 0 || rows[0].result === null) {
          return false;
        }

        yield* sql`UPDATE effect_workflow_executions
          SET result = NULL, interrupted = false
          WHERE execution_id = ${executionId}`;

        yield* sql`DELETE FROM effect_workflow_activities
          WHERE activity_id LIKE ${escapeLikePattern(executionId) + '/%'}
            AND JSON_EXTRACT(exit_value, '$._tag') != 'Success'`;

        yield* Effect.logInfo('execution reset for redrive').pipe(Effect.annotateLogs({executionId}));
        return true;
      }).pipe(Effect.orDie),
  });
});

export const EffectWorkflowStorageSqlLive: Layer.Layer<EffectWorkflowStorage, never, SqlClient.SqlClient> =
  Layer.effect(EffectWorkflowStorage)(makeEffectWorkflowStorageMysql);
