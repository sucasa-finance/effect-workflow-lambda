import { Effect, Layer } from 'effect';
import * as Redis from 'effect/unstable/persistence/Redis';
import { Redis as RedisClient } from 'ioredis';

const host = process.env.REDIS_HOST ?? 'localhost';
const port = Number(process.env.REDIS_PORT ?? '6380');

const makeRedis = Effect.gen(function* () {
  const client = new RedisClient({ host, port, lazyConnect: true });
  yield* Effect.tryPromise(() => client.connect());
  yield* Effect.addFinalizer(() => Effect.sync(() => client.disconnect()));

  return yield* Redis.make({
    send: <A = unknown>(command: string, ...args: ReadonlyArray<string>) =>
      Effect.tryPromise({
        try: () => client.call(command, ...args) as Promise<A>,
        catch: (cause) => new Redis.RedisError({ cause }),
      }),
  });
});

export const DatabaseLive = Layer.effect(Redis.Redis)(makeRedis);
