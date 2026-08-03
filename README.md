# effect-workflow-engine

A queue-driven, replay-based implementation of Effect's [`WorkflowEngine`](https://github.com/Effect-TS/effect/tree/main/packages/effect/src/unstable/workflow) interface — structured to mirror the [`cluster/`](https://github.com/Effect-TS/effect/tree/main/packages/effect/src/unstable/cluster) package so it can eventually be upstreamed with minimal friction.

> `effect@4.0.0-beta.62` · `effect/unstable/workflow`

## Why not Temporal?

Temporal is the gold standard for durable workflows, but it requires a dedicated cluster (self-hosted or cloud). This engine achieves Temporal-like semantics — replay-based execution, activity persistence, durable timers, external signals — using commodity infrastructure: **SQS** for message dispatch, **SQL** for durable state, and **Lambda** as the compute layer. No new infrastructure to provision or monitor.

Workflow authors write **stock Effect workflow code**. The engine is a swappable `WorkflowEngine` implementation — the same workflow runs against `WorkflowEngine.layerMemory` in tests and this engine in production.

## Repo structure

```
src/
  LambdaWorkflowEngine.ts      # Core engine — make(send) → {engine, processMessage}
  LambdaWorkflowEngine.live.ts  # Production layer — SQS send + SQL storage
  TestWorkflowEngine.ts         # Test layer — PersistedQueue + KVS memory
  WorkflowStorage.ts            # Storage service contract + types
  SqlWorkflowStorage.ts         # MySQL adapter via effect/unstable/sql
  PgWorkflowStorage.ts          # Postgres adapter via effect/unstable/sql
  KvWorkflowStorage.ts          # KeyValueStore adapter (tests)
  index.ts                      # Barrel export
examples/
  hello-world/                  # Greet workflow — activities, durable sleep, typed failures
    run-mysql.ts                # Runnable example against local MySQL
    run-pg.ts                   # Runnable example against local Postgres
  human-approval/               # DurableDeferred — external signal / human-in-the-loop
  failure-modes/                # Defect workflows — SQS redelivery demonstration
migrations/
  mysql/001_create_tables.sql   # MySQL schema
  postgres/001_create_tables.sql # Postgres schema
docker-compose.yml              # MySQL 8.4 + Postgres 17 for local dev
test/
  greet.workflow.spec.ts        # End-to-end engine tests
  greet.workflow.redrive.spec.ts # Redrive + edge case tests
```

## Database tables

The engine requires three tables. Migrations are provided for both MySQL and Postgres under `migrations/`.

### `effect_workflow_executions`

| Column | Type | Description |
|---|---|---|
| `execution_id` | PK, text | Derived from workflow name + idempotency key |
| `workflow_name` | text | Registered workflow name |
| `payload` | JSON/JSONB | Encoded workflow input |
| `result` | JSON/JSONB, nullable | `NULL` while running; set on completion |
| `interrupted` | boolean | Whether the execution was interrupted |

### `effect_workflow_activities`

| Column | Type | Description |
|---|---|---|
| `activity_id` | PK, text | `{executionId}/{activityName}/{attempt}` |
| `exit_value` | JSON/JSONB, nullable | `NULL` while enqueued; exit value on completion |

### `effect_workflow_deferreds`

| Column | Type | Description |
|---|---|---|
| `execution_id` | text | FK to executions |
| `deferred_name` | text | Deferred identifier |
| `exit_value` | JSON/JSONB | Exit value when the deferred completes |
| | PK | `(execution_id, deferred_name)` |

## Quick start

### In-memory (tests)

```ts
import * as TestWorkflowEngine from 'effect-workflow-engine/TestWorkflowEngine';

const TestLayer = GreetWorkflowHandler.pipe(
  Layer.provideMerge(TestWorkflowEngine.layer),
);

const result = yield* GreetWorkflow.execute({ name: 'world' }).pipe(
  Effect.provide(TestLayer),
);
```

### Local development with Docker

```bash
# Start MySQL and Postgres (tables auto-created from migrations/)
docker compose up -d

# Run against MySQL
npm run example:mysql

# Run against Postgres
npm run example:pg

# Tear down
docker compose down
```

### Production (SQS + SQL + Lambda)

```ts
import { LambdaWorkflowEngine } from 'effect-workflow-engine';

// LambdaWorkflowEngine.live.ts provides WorkflowEngine + MessageProcessor
// Requires: SqlClient.SqlClient (from @effect/sql-mysql2 or @effect/sql-pg)
// Requires: EFFECT_WORKFLOW_QUEUE_URL environment variable

// Lambda handler calls:
const processor = yield* MessageProcessor;
yield* processor.processMessage(sqsMessage);
```

## Architecture

The engine takes a single `send` function — the only transport abstraction:

```ts
type Send = (
  message: EffectWorkflowMessage,
  options?: { readonly delay?: Duration.Duration },
) => Effect.Effect<void>;
```

In production, `send` wraps SQS `sendMessage`. In tests, it writes to a `PersistedQueue` with a self-looping pump. This eliminates the need for a transport service layer — `send` is the Lambda-side equivalent of what sharding provides for free in `ClusterWorkflowEngine`.

### Message flow

```
Workflow.execute  →  INSERT execution row  +  RunWorkflow (send)

RunWorkflow       →  replay body  →  RunActivity × N  +  suspend

RunActivity       →  replay with target  →  persist exit  →  RunWorkflow

RunClock          →  check wakeUpAt  →  complete deferred  →  RunWorkflow
```

### Comparison with ClusterWorkflowEngine

| | ClusterWorkflowEngine | LambdaWorkflowEngine |
|---|---|---|
| **Message dispatch** | Sharding entities (implicit) | Explicit `send` function |
| **processMessage** | Not needed (sharding handles it) | Required — glue that sharding provides for free |
| **Storage** | `MessageStorage` (cluster-internal) | `WorkflowStorage` (same shape, different name) |
| **Compute** | Long-lived cluster nodes | Ephemeral Lambda invocations |

### Failure model

| Type | Persisted? | SQS retry? | Recovery |
|---|---|---|---|
| **Defect** (crash) | No | Yes — redelivers up to maxReceiveCount, then DLQ | Redrive DLQ (always safe) |
| **Typed failure** | Yes | No — business logic decided this is final | `resetExecution` → redrive |
| **Redrive** | Operator-initiated | N/A | NULLs result, deletes failed activity exits, re-enqueues RunWorkflow |

### Idempotent by construction

All storage writes are **first-writer-wins**:

- **Execution creation** — unique key + duplicate-key no-op
- **Execution result** — `WHERE result IS NULL` guard
- **Activity exits** — `ON DUPLICATE KEY UPDATE ... COALESCE` (MySQL) / `ON CONFLICT DO UPDATE ... COALESCE` (Postgres)
- **Deferreds** — unique key + duplicate-key no-op

## Edge cases verified

| Scenario | Behaviour | Status |
|---|---|:---:|
| Workflow typed failure → redrive | Reset NULLs result, replay re-runs from scratch | ✅ |
| Activity typed failure → redrive | Failed exit cleared, successful activities cached, activity re-executes | ✅ |
| Defect → SQS redelivery → DLQ | Engine rethrows, Lambda fails, SQS redelivers up to maxReceiveCount | ✅ |
| Durable sleep doesn't hold Lambda | Suspend → delayed RunClock → fresh invocation resumes | ✅ |
| DurableDeferred (external signal) | Workflow suspends, DurableDeferred.succeed resumes from outside | ✅ |
| Successful activities preserved on redrive | Only failed exits deleted; replay skips completed activities | ✅ |
| Redrive running execution | No-op (result IS NULL, nothing to reset) | ✅ |
| Long sleep > 15 min | RunClock hop chain, re-enqueues with remaining delay | ✅ |
| Concurrent replay idempotency | First-writer-wins on all storage writes | ✅ |

## What workflow authors write

Workflow code is **stock Effect** — no engine-specific APIs:

```ts
// greet.workflow.define.ts — pure contract
export const GreetWorkflow = Workflow.make({
  name: 'Greet',
  payload: GreetInputSchema.fields,
  success: Schema.Struct({ greeting: Schema.String, farewell: Schema.String }),
  error: Schema.Union([GreetBlankNameError, SalutationLookupError]),
  idempotencyKey: ({ name }) => name,
});

// greet.workflow.live.ts — pure behaviour
export const GreetWorkflowHandler = GreetWorkflow.toLayer(
  Effect.fnUntraced(function* ({ name }) {
    if (name.trim() === '') return yield* Effect.fail(new GreetBlankNameError({ name }));

    const [salutation, decorated] = yield* Effect.all(
      [fetchSalutationActivity({ name }), decorateNameActivity({ name })],
      { concurrency: 'unbounded' },
    );

    yield* DurableClock.sleep({ name: 'pause', duration: '5 seconds' });

    const farewell = yield* farewellActivity({ name: decorated });
    return { greeting: `${salutation}, ${decorated}`, farewell };
  }),
);
```

## Bringing your own storage

The engine depends on a single `WorkflowStorage` interface. Ship your own adapter:

```ts
const MyStorageLayer = Layer.effect(EffectWorkflowStorage)(
  Effect.gen(function* () {
    return EffectWorkflowStorage.of({
      getExecution: ...,
      createExecution: ...,
      setExecutionResult: ...,
      // all methods from WorkflowStorageService
    });
  }),
);
```

## Questions for the Effect core team

1. Is this the intended way to implement a custom `WorkflowEngine` via `makeUnsafe`? Are there foot-guns we should watch for?
2. The `activityExecute` return type expects `Workflow.Result` — is `Suspended` the correct way to signal "activity not yet done, come back later"?
3. `DurableClock.sleep`'s `inMemoryThreshold` defaults to 60s. For SQS-driven execution, we set it to `1 millis` to always go durable. Is there a better knob?
4. Activity retry policies — the engine threads `attempt` through `activityExecute` but doesn't drive retry counts. Is there an intended retry contract?
5. Any concerns with the `resetExecution` approach for redrive?
6. The `exit` JSON structure uses `{_tag: "Success", value: ...}` at the top level. Is this stable across versions?

## License

MIT
