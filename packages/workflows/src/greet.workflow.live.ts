import {Effect, Schema} from 'effect';
import {Activity, DurableClock} from 'effect/unstable/workflow';

import {SalutationLookupError, GreetBlankNameError, GreetWorkflow} from './greet.workflow.define.js';
import type {WorkflowModule} from './module.js';

export const GreetWorkflowHandler = GreetWorkflow.toLayer(
  Effect.fnUntraced(function* ({name}) {
    yield* Effect.logInfo('greet workflow started').pipe(Effect.annotateLogs({name}));

    if (name.trim() === '') {
      return yield* Effect.fail(new GreetBlankNameError({name}));
    }

    const [salutation, decoratedName] = yield* Effect.all(
      [
        Activity.make({
          name: 'fetch-salutation',
          success: Schema.String,
          error: SalutationLookupError,
          execute: Effect.fn('fetch-salutation')(function* () {
            yield* Effect.logInfo('fetch-salutation activity executing').pipe(Effect.annotateLogs({name}));
            yield* Effect.sleep('200 millis');

            if (!/^[\p{L} '-]+$/u.test(name)) {
              return yield* Effect.fail(new SalutationLookupError({name}));
            }

            return 'hello';
          })(),
        }),
        Activity.make({
          name: 'decorate-name',
          success: Schema.String,
          execute: Effect.fn('decorate-name')(function* () {
            yield* Effect.logInfo('decorate-name activity executing').pipe(Effect.annotateLogs({name}));
            return `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
          })(),
        }),
      ],
      {concurrency: 'unbounded'},
    );
    const greeting = `${salutation}, ${decoratedName}`;

    yield* Effect.logInfo('greeting composed — sleeping before farewell').pipe(Effect.annotateLogs({greeting}));

    yield* DurableClock.sleep({
      name: 'pause-before-farewell',
      duration: '5 seconds',
      inMemoryThreshold: '1 millis',
    });

    const farewell = yield* Activity.make({
      name: 'farewell',
      success: Schema.String,
      execute: Effect.fn('farewell')(function* () {
        yield* Effect.logInfo('farewell activity executing').pipe(Effect.annotateLogs({name: decoratedName}));
        return `goodbye, ${decoratedName}`;
      })(),
    });

    yield* Effect.logInfo('greet workflow finished').pipe(Effect.annotateLogs({greeting, farewell}));

    return {greeting, farewell};
  }),
);

export const GreetModule: WorkflowModule = {
  workflow: GreetWorkflow,
  handler: GreetWorkflowHandler,
};
