import { Layer } from 'effect';
import * as HttpServer from 'effect/unstable/http/HttpServer';
import * as HttpRouter from 'effect/unstable/http/HttpRouter';
import * as HttpApiBuilder from 'effect/unstable/httpapi/HttpApiBuilder';
import { LambdaHandler } from '@effect-aws/lambda';

import { layer as sqsEngineLayer } from '@effect-workflow-engine/engine/handler/sqs/Layer';
import { EffectWorkflowStoragePgLive } from '@effect-workflow-engine/engine/PostgresWorkflowStorage.live';

import { DatabaseLive } from '../database/client.js';
import { SqsLive, queueUrl } from '../sqs/client.js';
import { RootHttpApi } from '../http/api.define.js';
import { makeWorkflowHandlers } from '../http/api.live.js';
import { modules } from '../modules.js';

const EngineLive = sqsEngineLayer({ queueUrl, modules }).pipe(
  Layer.provide(EffectWorkflowStoragePgLive.pipe(Layer.provide(DatabaseLive))),
  Layer.provide(SqsLive),
);

const HttpApiLive = HttpApiBuilder.layer(RootHttpApi).pipe(
  Layer.provide(makeWorkflowHandlers(modules)),
  Layer.provide(HttpServer.layerServices),
  HttpRouter.provideRequest(EngineLive),
);

export const handler = LambdaHandler.fromHttpApi(HttpApiLive);
