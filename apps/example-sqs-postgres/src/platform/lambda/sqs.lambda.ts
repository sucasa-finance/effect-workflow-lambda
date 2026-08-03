import { Layer } from 'effect';
import { handler as sqsHandler } from '@effect-workflow-engine/engine/handler/sqs/Handler';
import { EffectWorkflowStoragePgLive } from '@effect-workflow-engine/engine/PostgresWorkflowStorage.live';

import { DatabaseLive } from '../database/client.js';
import { SqsLive, queueUrl } from '../sqs/client.js';
import { modules } from '../modules.js';

export const handler = sqsHandler({
  queueUrl,
  modules,
  layer: Layer.mergeAll(
    EffectWorkflowStoragePgLive.pipe(Layer.provide(DatabaseLive)),
    SqsLive,
  ),
});
