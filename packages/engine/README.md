# effect-workflow-lambda

Queue-driven, replay-based [`WorkflowEngine`](https://effect.website) for AWS Lambda + SQS.

Implements Effect's `effect/unstable/workflow` engine interface with durable storage (memory, Redis, MySQL, or Postgres) and SQS as the work queue.

## Install

```bash
npm install effect-workflow-lambda effect @effect-aws/client-sqs @effect-aws/lambda
```

Peer dependencies (required):

- `effect` ^4.0.0-beta.62
- `@effect-aws/client-sqs` ^2.0.0-beta.4
- `@effect-aws/lambda` ^2.0.0-beta.4

Storage drivers are provided by your app (e.g. `@effect/sql-pg`, `@effect/sql-mysql2`, or Effect Redis via `ioredis`).

## Quick start (SQS Lambda)

```ts
import { Layer } from "effect"
import { handler as sqsHandler } from "effect-workflow-lambda/handler/sqs/Handler"
import { EffectWorkflowStorageRedisLive } from "effect-workflow-lambda/RedisWorkflowStorage.live"
import type { WorkflowModule } from "effect-workflow-lambda/WorkflowModule"

const modules: ReadonlyArray<WorkflowModule> = [
  // your workflow handler layers
]

export const handler = sqsHandler({
  queueUrl: process.env.QUEUE_URL!,
  modules,
  layer: Layer.mergeAll(
    EffectWorkflowStorageRedisLive.pipe(Layer.provide(YourRedisLive)),
    YourSqsLive,
  ),
})
```

## Entry points

| Import | Purpose |
| --- | --- |
| `effect-workflow-lambda/handler/sqs/Handler` | Lambda handler for SQS events |
| `effect-workflow-lambda/handler/sqs/Layer` | Engine layer wired to SQS send |
| `effect-workflow-lambda/handler/sqs/Send` | Encode/send workflow messages |
| `effect-workflow-lambda/LambdaWorkflowEngine` | Core engine (`make`) |
| `effect-workflow-lambda/LambdaWorkflowEngine.local` | Local/in-process engine for tests |
| `effect-workflow-lambda/WorkflowStorage` | Storage service interface |
| `effect-workflow-lambda/MemoryWorkflowStorage.live` | In-memory / KV storage |
| `effect-workflow-lambda/RedisWorkflowStorage.live` | Redis storage |
| `effect-workflow-lambda/MySqlWorkflowStorage.live` | MySQL storage (`SqlClient`) |
| `effect-workflow-lambda/PostgresWorkflowStorage.live` | Postgres storage (`SqlClient`) |
| `effect-workflow-lambda/WorkflowModule` | Workflow module type |

## Status

Built against Effect v4 beta (`effect/unstable/workflow`). APIs may change as Effect stabilizes the workflow module.

## Releases

See [RELEASING.md](../../RELEASING.md). Pushing a `v*` tag publishes this package via GitHub Actions.

## License

MIT
