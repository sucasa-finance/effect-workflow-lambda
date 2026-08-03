import { Context, Duration, Effect, Layer } from 'effect';
import * as KeyValueStore from 'effect/unstable/persistence/KeyValueStore';
import * as PersistedQueue from 'effect/unstable/persistence/PersistedQueue';
import * as WorkflowEngine from 'effect/unstable/workflow/WorkflowEngine';

import { EffectWorkflowMessageSchema, type EffectWorkflowMessage, make } from './LambdaWorkflowEngine.js';
import { EffectWorkflowStorage } from './WorkflowStorage.js';
import { EffectWorkflowStorageKvLive } from './MemoryWorkflowStorage.live.js';

export { EffectWorkflowMessageSchema } from './LambdaWorkflowEngine.js';
export type { EffectWorkflowMessage } from './LambdaWorkflowEngine.js';

const makeLocal = Effect.gen(function* () {
  const scope = yield* Effect.scope;
  const storage = yield* EffectWorkflowStorage;

  const factory = yield* PersistedQueue.PersistedQueueFactory;
  const queue = yield* factory.make({
    name: 'effect-workflow-messages',
    schema: EffectWorkflowMessageSchema,
  });

  let processMessageRef: (message: EffectWorkflowMessage) => Effect.Effect<void>;

  const send = (message: EffectWorkflowMessage, options?: { readonly delay?: Duration.Duration }) => {
    const enqueue = queue.offer(message).pipe(Effect.asVoid, Effect.orDie);
    if (options?.delay === undefined || !Duration.isPositive(options.delay)) {
      return enqueue;
    }
    return Effect.sleep(options.delay).pipe(Effect.andThen(enqueue), Effect.forkIn(scope), Effect.asVoid);
  };

  const { engine, processMessage } = yield* make(send);
  processMessageRef = processMessage;

  yield* queue
    .take(message =>
      Effect.suspend(() => processMessageRef(message)).pipe(
        Effect.catchCause(cause => Effect.logError('LambdaWorkflowEngine pump failure', cause)),
      ),
    )
    .pipe(Effect.forever, Effect.forkIn(scope));

  return { engine, storage };
});

const PersistedQueueMemoryLive = PersistedQueue.layer.pipe(Layer.provide(PersistedQueue.layerStoreMemory));

export const layer: Layer.Layer<
  WorkflowEngine.WorkflowEngine | EffectWorkflowStorage
> = Layer.effectContext(
  Effect.map(makeLocal, ({ engine, storage }) =>
    Context.make(WorkflowEngine.WorkflowEngine, engine).pipe(Context.add(EffectWorkflowStorage, storage)),
  ),
).pipe(
  Layer.provide(EffectWorkflowStorageKvLive),
  Layer.provide(KeyValueStore.layerMemory),
  Layer.provide(PersistedQueueMemoryLive),
);
