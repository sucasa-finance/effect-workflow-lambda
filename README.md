# Effect Workflow Engine

A queue-driven, replay-based implementation of Effect's [`WorkflowEngine`](https://github.com/Effect-TS/effect/blob/main/packages/effect/src/unstable/workflow/WorkflowEngine.ts) interface. Temporal-like semantics — replay-based execution, activity persistence, durable timers, typed failures, external signals, interruption — using **SQS**, **SQL or Redis**, and **Lambda**.

> `effect@4.0.0-beta.62` · `effect/unstable/workflow`

## Define a workflow

```ts
import { Schema } from 'effect'
import { Workflow } from 'effect/unstable/workflow'

export const GreetWorkflow = Workflow.make({
  name: 'Greet',
  payload: { name: Schema.String },
  success: Schema.Struct({ greeting: Schema.String }),
  error: Schema.Never,
  idempotencyKey: ({ name }) => name,
})
```

## Implement the handler

Activities run exactly once — replays skip them and return the persisted result:

```ts
import { Effect, Schema } from 'effect'
import { Activity } from 'effect/unstable/workflow'
import { GreetWorkflow } from './greet.workflow.define.js'

export const GreetWorkflowHandler = GreetWorkflow.toLayer(
  Effect.fnUntraced(function* ({ name }) {
    const salutation = yield* Activity.make({
      name: 'fetch-salutation',
      success: Schema.String,
      execute: Effect.fn('fetch-salutation')(function* () {
        return 'hello'
      })(),
    })

    return { greeting: `${salutation}, ${name}` }
  }),
)
```

## Wire it up

### SQS Lambda (message processor)

Uses `handler/sqs/Handler` — complete handler in one call:

```ts
import { Layer } from 'effect'
import { handler as sqsHandler } from '@effect-workflow-engine/engine/handler/sqs/Handler'
import { EffectWorkflowStorageSqlLive } from '@effect-workflow-engine/engine/MySqlWorkflowStorage.live'

export const handler = sqsHandler({
  queueUrl,
  modules: [{ workflow: GreetWorkflow, handler: GreetWorkflowHandler }],
  layer: Layer.mergeAll(
    EffectWorkflowStorageSqlLive.pipe(Layer.provide(DatabaseLive)),
    SqsLive,
  ),
})
```

### HTTP Lambda (workflow trigger)

Uses `handler/sqs/Layer` — provides `WorkflowEngine` as a Layer for composition:

```ts
import { Layer } from 'effect'
import * as HttpApiBuilder from 'effect/unstable/httpapi/HttpApiBuilder'
import { LambdaHandler } from '@effect-aws/lambda'
import { layer as sqsEngineLayer } from '@effect-workflow-engine/engine/handler/sqs/Layer'

const EngineLive = sqsEngineLayer({ queueUrl, modules }).pipe(
  Layer.provide(StorageLive),
  Layer.provide(SqsLive),
)

const HttpApiLive = HttpApiBuilder.layer(RootHttpApi).pipe(
  Layer.provide(workflowHandlers),
  Layer.provide(HttpServer.layerServices),
  HttpRouter.provideRequest(EngineLive),
)

export const handler = LambdaHandler.fromHttpApi(HttpApiLive)
```

### Alternative: just the send adapter

If you want full control, `handler/sqs/Send` gives you only the SQS send function with delay clamping and JSON encoding handled:

```ts
import { makeSqsSend } from '@effect-workflow-engine/engine/handler/sqs/Send'

const send = yield* makeSqsSend(queueUrl)
const { engine, processMessage } = yield* make(send)
```

### Examples

See `apps/` for three self-contained deployments — one per storage backend:

- [`apps/example-sqs-mysql`](apps/example-sqs-mysql) — MySQL 8.4
- [`apps/example-sqs-postgres`](apps/example-sqs-postgres) — Postgres 17
- [`apps/example-sqs-redis`](apps/example-sqs-redis) — Redis 7

Each has Docker Compose, Pulumi infra, and Lambda handlers. They're identical except for the storage layer wiring.

## License

MIT
