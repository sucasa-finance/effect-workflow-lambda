import { Effect, Layer } from 'effect';
import * as WorkflowEngine from 'effect/unstable/workflow/WorkflowEngine';
import * as HttpServer from 'effect/unstable/http/HttpServer';
import * as HttpRouter from 'effect/unstable/http/HttpRouter';
import * as HttpApiBuilder from 'effect/unstable/httpapi/HttpApiBuilder';
import { LambdaHandler } from '@effect-aws/lambda';

import { make } from '@effect-workflow-engine/engine/LambdaWorkflowEngine';
import { EffectWorkflowStorageSqlLive } from '@effect-workflow-engine/engine/MySqlWorkflowStorage.live';

import { DatabaseLive } from '../database/client.js';
import { SqsLive, makeSqsSend } from '../sqs/client.js';
import { RootHttpApi } from '../http/api.define.js';
import { makeWorkflowHandlers } from '../http/api.live.js';
import { modules, registerModules } from '../modules.js';

const makeEngine = Effect.gen(function* () {
  const send = yield* makeSqsSend;
  const { engine } = yield* make(send);
  yield* registerModules(engine, modules);
  return engine;
});

const EngineLive = Layer.effect(WorkflowEngine.WorkflowEngine, makeEngine);

const DependenciesLive = Layer.mergeAll(
  EffectWorkflowStorageSqlLive.pipe(Layer.provide(DatabaseLive)),
  SqsLive,
);

const HttpApiLive = HttpApiBuilder.layer(RootHttpApi).pipe(
  Layer.provide(makeWorkflowHandlers(modules)),
  Layer.provide(HttpServer.layerServices),
  HttpRouter.provideRequest(EngineLive),
  Layer.provide(DependenciesLive),
);

export const handler = LambdaHandler.fromHttpApi(HttpApiLive);
