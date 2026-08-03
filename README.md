# Effect Workflow Engine

A queue-driven, replay-based implementation of Effect's [`WorkflowEngine`](https://github.com/Effect-TS/effect/blob/main/packages/effect/src/unstable/workflow/WorkflowEngine.ts) interface. Achieves Temporal-like semantics — replay-based execution, activity persistence, durable timers, typed failures, external signals, interruption — using commodity infrastructure: **SQS** for message dispatch, **SQL or Redis** for durable state, and **Lambda** as the compute layer.

> `effect@4.0.0-beta.62` · `effect/unstable/workflow`

## Where to look first

1. **[`packages/engine/src/LambdaWorkflowEngine.ts`](packages/engine/src/LambdaWorkflowEngine.ts)** — the core engine. `make(send)` returns `{engine, processMessage}`. This is the `WorkflowEngine.makeUnsafe` implementation — replay orchestration, activity dispatch, durable clock scheduling, and the full message processing loop in ~330 lines.

2. **[`packages/workflows/src/`](packages/workflows/src/)** — all the workflow definitions and handlers. Start with [`greet.workflow.define.ts`](packages/workflows/src/greet.workflow.define.ts) (schema contract) and [`greet.workflow.live.ts`](packages/workflows/src/greet.workflow.live.ts) (inline activities, durable sleep, typed failures). Then browse `approval`, `fan-out`, `crash`, `typed-failure`, `interruptible`, `idempotent-run` for the edge cases.

3. **[`apps/`](apps/)** — three self-contained example deployments, one per storage backend. Each has Docker Compose, Pulumi infra, and Lambda handlers. They're identical except for the storage layer wiring — compare [`example-sqs-mysql`](apps/example-sqs-mysql), [`example-sqs-postgres`](apps/example-sqs-postgres), and [`example-sqs-redis`](apps/example-sqs-redis) to see how the same engine runs against different backends.

## Repo structure

```
packages/
  engine/                              # Core engine + storage adapters
    src/
      LambdaWorkflowEngine.ts          # make(send) → {engine, processMessage}
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

apps/
  example-sqs-mysql/                   # MySQL 8.4 + Floci (SQS emulator) + Lambda
  example-sqs-postgres/                # Postgres 17 + Floci + Lambda
  example-sqs-redis/                   # Redis 7 + Floci + Lambda
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
