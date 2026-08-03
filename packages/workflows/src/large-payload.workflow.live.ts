import {Effect} from 'effect';

import {LargePayloadWorkflow} from './large-payload.workflow.define.js';
import type {WorkflowModule} from './module.js';

export const LargePayloadWorkflowHandler = LargePayloadWorkflow.toLayer(
  Effect.fnUntraced(function* ({id, unicodeText, nested, largeString}) {
    yield* Effect.logInfo('large-payload workflow started').pipe(
      Effect.annotateLogs({id, unicodeLength: unicodeText.length, itemCount: nested.items.length, largeStringLength: largeString.length}),
    );

    return {
      echoId: id,
      unicodeLength: unicodeText.length,
      itemCount: nested.items.length,
      largeStringLength: largeString.length,
    };
  }),
);

export const LargePayloadModule: WorkflowModule = {
  workflow: LargePayloadWorkflow,
  handler: LargePayloadWorkflowHandler,
};
