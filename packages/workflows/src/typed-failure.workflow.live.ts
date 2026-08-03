import {Effect, Schema} from 'effect';
import {Activity} from 'effect/unstable/workflow';

import {PaymentDeclinedError, TypedFailureWorkflow} from './typed-failure.workflow.define.js';
import type {WorkflowModule} from './module.js';

export const TypedFailureWorkflowHandler = TypedFailureWorkflow.toLayer(
  Effect.fnUntraced(function* ({id, shouldFail}) {
    yield* Effect.logInfo('typed-failure workflow started').pipe(Effect.annotateLogs({id, shouldFail}));

    const result = yield* Activity.make({
      name: 'validate-payment',
      success: Schema.String,
      error: PaymentDeclinedError,
      execute: Effect.fn('validate-payment')(function* () {
        if (shouldFail) {
          return yield* Effect.fail(new PaymentDeclinedError({reason: 'insufficient funds'}));
        }
        return 'payment-ok';
      })(),
    });

    yield* Effect.logInfo('typed-failure workflow finished').pipe(Effect.annotateLogs({id, result}));
    return result;
  }),
);

export const TypedFailureModule: WorkflowModule = {
  workflow: TypedFailureWorkflow,
  handler: TypedFailureWorkflowHandler,
};
