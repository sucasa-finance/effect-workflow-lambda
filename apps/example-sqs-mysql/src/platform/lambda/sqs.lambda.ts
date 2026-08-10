import { Layer } from 'effect';
import { handler as sqsHandler } from 'effect-workflow-lambda/handler/sqs/Handler';
import { EffectWorkflowStorageSqlLive } from 'effect-workflow-lambda/MySqlWorkflowStorage.live';

import { DatabaseLive } from '../database/client.js';
import { SqsLive, queueUrl } from '../sqs/client.js';
import { modules } from '../modules.js';

export const handler = sqsHandler({
  queueUrl,
  modules,
  layer: Layer.mergeAll(
    EffectWorkflowStorageSqlLive.pipe(Layer.provide(DatabaseLive)),
    SqsLive,
  ),
});
