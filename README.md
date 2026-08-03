# Effect Workflow Engine

A queue-driven, replay-based implementation of Effect's [`WorkflowEngine`](https://github.com/Effect-TS/effect/blob/main/packages/effect/src/unstable/workflow/WorkflowEngine.ts) interface. Achieves Temporal-like semantics — replay-based execution, activity persistence, durable timers, typed failures, external signals, interruption — using commodity infrastructure: **SQS** for message dispatch, **SQL or Redis** for durable state, and **Lambda** as the compute layer.

> `effect@4.0.0-beta.62` · `effect/unstable/workflow`

## Where to look first

1. **[`packages/engine/src/LambdaWorkflowEngine.ts`](packages/engine/src/LambdaWorkflowEngine.ts)** — the core engine. `make(send)` returns `{engine, processMessage}`. This is the `WorkflowEngine.makeUnsafe` implementation — replay orchestration, activity dispatch, durable clock scheduling, and the full message processing loop in ~330 lines.

2. **[`packages/workflows/src/`](packages/workflows/src/)** — all the workflow definitions and handlers. Start with [`greet.workflow.define.ts`](packages/workflows/src/greet.workflow.define.ts) (schema contract) and [`greet.workflow.live.ts`](packages/workflows/src/greet.workflow.live.ts) (inline activities, durable sleep, typed failures). Then browse `approval`, `fan-out`, `crash`, `typed-failure`, `interruptible`, `idempotent-run` for the edge cases.

3. **[`apps/`](apps/)** — three self-contained example deployments, one per storage backend. Each has Docker Compose, Pulumi infra, and Lambda handlers. They're identical except for the storage layer wiring — compare [`example-sqs-mysql`](apps/example-sqs-mysql), [`example-sqs-postgres`](apps/example-sqs-postgres), and [`example-sqs-redis`](apps/example-sqs-redis) to see how the same engine runs against different backends.

## Why not Temporal?

Temporal requires a dedicated cluster (self-hosted or cloud). This engine delivers the same programming model using infrastructure you already run. Workflow authors write stock Effect workflow code — the engine is a swappable `WorkflowEngine` implementation. The same workflow runs against `WorkflowEngine.layerMemory` in tests and this engine in production.

## Quick start

```bash
# Clone and install
pnpm install

# Pick a storage backend and spin it up
cd apps/example-sqs-mysql    # or example-sqs-postgres, example-sqs-redis
pnpm run deploy              # starts Docker infra + creates SQS queue via Pulumi

# Run the unit tests (in-memory engine, no infra needed)
cd packages/engine && pnpm test
```

## Repo structure

```
packages/
  engine/                              # Core engine + storage adapters
    src/
      LambdaWorkflowEngine.ts          # make(send) → {engine, processMessage}
      LambdaWorkflowEngine.live.ts     # Production layer (SQS + SQL)
      LambdaWorkflowEngine.local.ts    # In-process layer (tests — PersistedQueue pump)
      WorkflowStorage.ts               # Storage service interface
      MySqlWorkflowStorage.live.ts     # MySQL adapter (@effect/sql-mysql2)
      PostgresWorkflowStorage.live.ts  # Postgres adapter (@effect/sql-pg)
      RedisWorkflowStorage.live.ts     # Redis adapter (effect/unstable/persistence/Redis)
      MemoryWorkflowStorage.live.ts    # In-memory adapter (KeyValueStore — tests)
    test/                              # Vitest specs (in-memory engine)

  workflows/                           # Workflow definitions + handlers
    src/
      greet.workflow.define.ts         # Schema contract (payload, success, error, idempotencyKey)
      greet.workflow.live.ts           # Handler — activities, durable sleep, typed failures
      approval.workflow.*.ts           # DurableDeferred — human-in-the-loop signal
      fan-out.workflow.*.ts            # Parallel activities (Effect.all + concurrency)
      crash.workflow.*.ts              # Defect simulation — SQS redelivery
      typed-failure.workflow.*.ts      # Business error persisted as Failure exit
      interruptible.workflow.*.ts      # Interrupt endpoint — kill a blocked workflow
      idempotent-run.workflow.*.ts     # Duplicate execute → same executionId, no re-run
      ...

apps/
  example-sqs-mysql/                   # MySQL 8.4 + Floci (SQS emulator) + Lambda
  example-sqs-postgres/                # Postgres 17 + Floci + Lambda
  example-sqs-redis/                   # Redis 7 + Floci + Lambda
```

Each app under `apps/` is a self-contained deployment with:
- `docker-compose.yml` — database + [Floci](https://github.com/floci/floci) (AWS SQS/Lambda emulator)
- `infra/` — Pulumi stack for the SQS queue
- `src/platform/` — database client, SQS client, HTTP + SQS Lambda handlers

## Writing a workflow

### 1. Define the contract

```ts
// greet.workflow.define.ts
import { Schema } from 'effect'
import { Workflow } from 'effect/unstable/workflow'

export class SalutationLookupError extends Schema.TaggedErrorClass<SalutationLookupError>()(
  'SalutationLookupError', { name: Schema.String }
) {
  get message() { return `no salutation found for ${this.name}` }
}

export const GreetWorkflow = Workflow.make({
  name: 'Greet',
  payload: { name: Schema.String },
  success: Schema.Struct({ greeting: Schema.String, farewell: Schema.String }),
  error: Schema.Union([SalutationLookupError]),
  idempotencyKey: ({ name }) => name,
})
```

### 2. Implement the handler

Activities are inlined with `Activity.make` — the `execute` field takes an Effect (use `Effect.fn("span")()` for tracing):

```ts
// greet.workflow.live.ts
import { Effect, Schema } from 'effect'
import { Activity, DurableClock } from 'effect/unstable/workflow'
import { GreetWorkflow, SalutationLookupError } from './greet.workflow.define.js'

export const GreetWorkflowHandler = GreetWorkflow.toLayer(
  Effect.fnUntraced(function* ({ name }) {
    const [salutation, decorated] = yield* Effect.all([
      Activity.make({
        name: 'fetch-salutation',
        success: Schema.String,
        error: SalutationLookupError,
        execute: Effect.fn('fetch-salutation')(function* () {
          // This runs exactly once — replays skip it and return the persisted result
          yield* Effect.sleep('200 millis')
          return 'hello'
        })(),
      }),
      Activity.make({
        name: 'decorate-name',
        success: Schema.String,
        execute: Effect.fn('decorate-name')(function* () {
          return `${name.charAt(0).toUpperCase()}${name.slice(1)}`
        })(),
      }),
    ], { concurrency: 'unbounded' })

    // Durable sleep — suspends the Lambda, enqueues a delayed RunClock message,
    // and resumes in a fresh invocation when the timer fires
    yield* DurableClock.sleep({
      name: 'pause-before-farewell',
      duration: '5 seconds',
      inMemoryThreshold: '1 millis',
    })

    const farewell = yield* Activity.make({
      name: 'farewell',
      success: Schema.String,
      execute: Effect.fn('farewell')(function* () {
        return `goodbye, ${decorated}`
      })(),
    })

    return { greeting: `${salutation}, ${decorated}`, farewell }
  }),
)
```

### 3. Register as a module

```ts
import type { WorkflowModule } from './module.js'

export const GreetModule: WorkflowModule = {
  workflow: GreetWorkflow,
  handler: GreetWorkflowHandler,
}
```

### 4. External signals (human-in-the-loop)

```ts
// Define a durable deferred
export const ApprovalSignal = DurableDeferred.make('approval-decision', {
  success: Schema.Struct({ approvedBy: Schema.String }),
})

// In the workflow handler — suspends until the signal arrives
const decision = yield* DurableDeferred.await(ApprovalSignal)

// From outside (e.g. an HTTP endpoint)
const token = DurableDeferred.tokenFromExecutionId(ApprovalSignal, {
  workflow: ApprovalWorkflow,
  executionId,
})
yield* DurableDeferred.succeed(ApprovalSignal, { token, value: { approvedBy: 'alice' } })
```

## Testing (in-memory)

The in-memory engine uses `PersistedQueue` + `KeyValueStore` — no Docker, no network:

```ts
import { it } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import * as LambdaWorkflowEngine from '@effect-workflow-engine/engine/LambdaWorkflowEngine.local'
import { GreetWorkflow } from '@effect-workflow-engine/workflows/greet.workflow.define'
import { GreetWorkflowHandler } from '@effect-workflow-engine/workflows/greet.workflow.live'

const TestLayer = GreetWorkflowHandler.pipe(
  Layer.provideMerge(LambdaWorkflowEngine.layer),
)

it.live('greets the world', () =>
  Effect.gen(function* () {
    const result = yield* GreetWorkflow.execute({ name: 'world' })
    expect(result).toEqual({ greeting: 'hello, World', farewell: 'goodbye, World' })
  }).pipe(Effect.provide(TestLayer)),
  15_000,
)
```

## Running an example app

All three apps follow the same workflow. Using `example-sqs-mysql` as an example:

```bash
cd apps/example-sqs-mysql

# 1. Start infrastructure (MySQL + Floci SQS/Lambda emulator)
pnpm run infra:up

# 2. Create the SQS queue
pnpm run deploy

# 3. Bundle and deploy Lambda handlers to Floci
#    (see the esbuild commands in the test validation below)

# 4. Invoke via the HTTP Lambda
aws --endpoint-url http://localhost:4570 --region ap-southeast-2 lambda invoke \
  --function-name ewf-http-handler \
  --payload "$(echo '{"version":"2.0","rawPath":"/run",...}' | base64)" \
  /tmp/response.json

# 5. Verify in the database
mysql -h 127.0.0.1 -P 3307 -u workflow -pworkflow ewf_sqs_mysql \
  -e "SELECT execution_id, workflow_name, result->'$.exit._tag' FROM effect_workflow_executions"

# 6. Tear down
pnpm run infra:down
```

For Postgres, swap to `example-sqs-postgres` (port 5433). For Redis, swap to `example-sqs-redis` (port 6380).

## Architecture

### The `send` abstraction

The engine takes a single function — the only transport contract:

```ts
type Send = (
  message: EffectWorkflowMessage,
  options?: { readonly delay?: Duration.Duration },
) => Effect.Effect<void>
```

In production, `send` wraps SQS `sendMessage`. In tests, it writes to a `PersistedQueue` with a self-looping pump. This is the Lambda-side equivalent of what sharding provides for free in `ClusterWorkflowEngine`.

### Message flow

```
Workflow.execute  →  INSERT execution row  +  send(RunWorkflow)
RunWorkflow       →  replay body  →  send(RunActivity) × N  +  suspend
RunActivity       →  replay with target  →  persist exit  →  send(RunWorkflow)
RunClock          →  check wakeUpAt  →  complete deferred  →  send(RunWorkflow)
```

### Storage contract

The engine depends on `EffectWorkflowStorage` — 10 methods covering executions, activities, and deferreds. Four adapters are provided:

| Adapter | Dependency | Use case |
|---|---|---|
| `MySqlWorkflowStorage` | `@effect/sql-mysql2` | Production |
| `PostgresWorkflowStorage` | `@effect/sql-pg` | Production |
| `RedisWorkflowStorage` | `effect/unstable/persistence/Redis` | Production |
| `MemoryWorkflowStorage` | `KeyValueStore` (in-memory) | Tests |

### Database tables

Three tables (migrations provided for MySQL and Postgres):

| Table | Key | Purpose |
|---|---|---|
| `effect_workflow_executions` | `execution_id` | Payload, result, interrupted flag |
| `effect_workflow_activities` | `activity_id` | Activity exit values (replay cache) |
| `effect_workflow_deferreds` | `(execution_id, deferred_name)` | Signal/timer completion values |

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
| **Defect** (crash) | No | Yes — redelivers up to maxReceiveCount | Redrive DLQ |
| **Typed failure** | Yes | No — business logic decided this is final | `resetExecution` → redrive |

### Idempotent by construction

All storage writes are first-writer-wins:

- **Execution creation** — unique key + duplicate-key no-op
- **Execution result** — `WHERE result IS NULL` guard
- **Activity exits** — `ON CONFLICT ... COALESCE` (only writes if NULL)
- **Deferreds** — unique key + duplicate-key no-op

## Validated edge cases

All scenarios verified end-to-end across **MySQL, Postgres, and Redis** via [Floci](https://github.com/floci/floci) (local SQS + Lambda emulator). Each workflow was invoked via the HTTP Lambda handler, processed by the SQS Lambda handler, and verified directly in the database.

| Scenario | Behaviour | MySQL | Postgres | Redis |
|---|---|:---:|:---:|:---:|
| Happy path (Greet) | Activities + durable sleep + farewell | ✅ | ✅ | ✅ |
| Concurrent activities (FanOut) | `Effect.all` with `concurrency: 'unbounded'` | ✅ | ✅ | ✅ |
| Typed failure (PaymentDeclined) | Persisted as `Failure` exit, not retried by SQS | ✅ | ✅ | ✅ |
| Typed success (PaymentOk) | Persisted as `Success` exit | ✅ | ✅ | ✅ |
| External signal (DurableDeferred) | Workflow suspends, signal resumes it | ✅ | ✅ | ✅ |
| Interrupt endpoint | Sets `interrupted=true`, replays to `Failure` | ✅ | ✅ | ✅ |
| Idempotent duplicate execute | Same idempotency key → same executionId, 1 activity row | ✅ | ✅ | ✅ |
| Defect → SQS redelivery | Engine rethrows, Lambda fails, SQS redelivers | ✅ | ✅ | ✅ |
| Durable sleep (no Lambda hold) | Suspend → delayed RunClock → fresh invocation | ✅ | ✅ | ✅ |
| Redrive (reset + replay) | NULLs result, deletes failed exits, re-enqueues | ✅ | ✅ | ✅ |
| Long sleep > 15 min | RunClock hop chain, re-enqueues with remaining delay | ✅ | ✅ | ✅ |

<details>
<summary>MySQL verification output</summary>

```
+----------------------------------+------------------+----------+----------+-------------+
| execution_id                     | workflow_name    | status   | exit_tag | interrupted |
+----------------------------------+------------------+----------+----------+-------------+
| 4d14f835d802e7fd2e908ceeb0e07be8 | Greet            | Complete | Success  |           0 |
| 8de636777aaf97fef953c98cc44f7367 | DuplicateExecute | Complete | Success  |           0 |
| 99a6cab5cf4e1c310eb82f5d80047f03 | FanOut           | Complete | Success  |           0 |
| e037174fa33b7fa504ccc33d464a50f8 | TypedFailure     | Complete | Failure  |           0 |
| 6ac23b589ac2ea3028241a5a8ccab90c | TypedFailure     | Complete | Success  |           0 |
| 0647d8b3a5a7cbe87d67cbc3a27bbe3a | Interruptible    | Complete | Failure  |           1 |
| 444b2fc92a238dab28c6f1312392fdce | IdempotentRun    | Complete | Success  |           0 |
+----------------------------------+------------------+----------+----------+-------------+
```
</details>

<details>
<summary>Postgres verification output</summary>

```
           execution_id           |  workflow_name   |  status  | exit_tag | interrupted
----------------------------------+------------------+----------+----------+-------------
 4d14f835d802e7fd2e908ceeb0e07be8 | Greet            | Complete | Success  | f
 8de636777aaf97fef953c98cc44f7367 | DuplicateExecute | Complete | Success  | f
 99a6cab5cf4e1c310eb82f5d80047f03 | FanOut           | Complete | Success  | f
 e037174fa33b7fa504ccc33d464a50f8 | TypedFailure     | Complete | Failure  | f
 6ac23b589ac2ea3028241a5a8ccab90c | TypedFailure     | Complete | Success  | f
 0647d8b3a5a7cbe87d67cbc3a27bbe3a | Interruptible    | Complete | Failure  | t
 444b2fc92a238dab28c6f1312392fdce | IdempotentRun    | Complete | Success  | f
```
</details>

<details>
<summary>Redis verification output</summary>

```
Greet            | hasResult=True  | exit=Success | interrupted=False
DuplicateExecute | hasResult=True  | exit=Success | interrupted=False
FanOut           | hasResult=True  | exit=Success | interrupted=False
TypedFailure     | hasResult=True  | exit=Failure | interrupted=False  (shouldFail=true)
TypedFailure     | hasResult=True  | exit=Success | interrupted=False  (shouldFail=false)
IdempotentRun    | hasResult=True  | exit=Success | interrupted=False
Interruptible    | hasResult=True  | interrupted=True                  (after /interrupt)
```
</details>

## Bringing your own storage

Implement `EffectWorkflowStorageService` and provide it as a Layer:

```ts
import { EffectWorkflowStorage } from '@effect-workflow-engine/engine/WorkflowStorage'

const MyStorageLive = Layer.effect(EffectWorkflowStorage)(
  Effect.gen(function* () {
    return EffectWorkflowStorage.of({
      getExecution: (executionId) => ...,
      createExecution: (input) => ...,
      setExecutionResult: (executionId, result) => ...,
      setExecutionInterrupted: (executionId) => ...,
      getActivityExit: (activityId) => ...,
      setActivityExit: (activityId, exit) => ...,
      markActivityEnqueued: (activityId) => ...,
      getDeferred: (executionId, deferredName) => ...,
      setDeferred: (executionId, deferredName, exit) => ...,
      resetExecution: (executionId) => ...,
    })
  }),
)
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
