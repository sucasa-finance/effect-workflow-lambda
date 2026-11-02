import { Effect, Layer } from 'effect';
import * as Redis from 'effect/persistence/Redis';
import { Redis as RedisClient } from 'ioredis';

const host = process.env.REDIS_HOST ?? 'localhost';
const port = Number(process.env.REDIS_PORT ?? '6380');

const makeRedis = Effect.gen(function* () {
  const client = new RedisClient({ host, port, lazyConnect: true });
  yield* Effect.orDie(Effect.tryPromise(() => client.connect()));
  yield* Effect.addFinalizer(() => Effect.sync(() => client.disconnect()));

  return yield* Redis.make({
    send: <A = unknown>(command: string, ...args: ReadonlyArray<string>) =>
      Effect.tryPromise({
        try: () => client.call(command, ...args) as Promise<A>,
        catch: (cause) => new Redis.RedisError({ cause }),
      }),
    // Pub/sub needs its own connection: a subscribed ioredis client cannot send other commands.
    subscribe: (channel, onMessage) =>
      Effect.gen(function* () {
        const subscriber = yield* Effect.acquireRelease(
          Effect.sync(() => client.duplicate()),
          (connection) => Effect.sync(() => connection.disconnect()),
        );
        subscriber.on('message', (from: string, message: string) => onMessage({ channel: from, message }));
        yield* Effect.tryPromise({
          try: () => subscriber.subscribe(channel),
          catch: (cause) => new Redis.RedisError({ cause }),
        });
        // Completes with a failure when the subscriber connection closes, so Redis.subscribe fails its queue.
        return Effect.callback<void, Redis.RedisError>((resume) => {
          subscriber.once('end', () => resume(Effect.fail(new Redis.RedisError({ cause: 'subscriber connection closed' }))));
        });
      }),
  });
});

export const DatabaseLive = Layer.effect(Redis.Redis)(makeRedis);
