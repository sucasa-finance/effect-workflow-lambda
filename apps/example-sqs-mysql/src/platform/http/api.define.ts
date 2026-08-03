import { Schema } from 'effect';
import * as HttpApi from 'effect/unstable/httpapi/HttpApi';
import * as HttpApiEndpoint from 'effect/unstable/httpapi/HttpApiEndpoint';
import * as HttpApiGroup from 'effect/unstable/httpapi/HttpApiGroup';

const RunRequest = Schema.Struct({
  workflow: Schema.String,
  payload: Schema.Unknown,
});

const RunResponse = Schema.Struct({
  executionId: Schema.String,
  status: Schema.Literal('accepted'),
});

const PollResponse = Schema.Union([
  Schema.Struct({ status: Schema.Literal('pending') }),
  Schema.Struct({ status: Schema.Literal('complete'), value: Schema.Unknown }),
  Schema.Struct({ status: Schema.Literal('failed') }),
  Schema.Struct({ status: Schema.Literal('suspended') }),
]);

const SignalRequest = Schema.Struct({
  workflow: Schema.String,
  executionId: Schema.String,
  deferredName: Schema.String,
  value: Schema.Unknown,
});

const SignalResponse = Schema.Struct({
  status: Schema.Literal('signalled'),
});

const InterruptResponse = Schema.Struct({
  status: Schema.Literal('interrupted'),
});

const run = HttpApiEndpoint.post('run', '/run', {
  payload: RunRequest,
  success: RunResponse,
});

const poll = HttpApiEndpoint.get('poll', '/poll/:executionId', {
  params: { executionId: Schema.String },
  success: PollResponse,
});

const signal = HttpApiEndpoint.post('signal', '/signal', {
  payload: SignalRequest,
  success: SignalResponse,
});

const interrupt = HttpApiEndpoint.post('interrupt', '/interrupt/:executionId', {
  params: { executionId: Schema.String },
  success: InterruptResponse,
});

const workflowGroup = HttpApiGroup.make('workflows').add(run, poll).add(signal, interrupt);

export class RootHttpApi extends HttpApi.make('RootHttpApi').add(workflowGroup) {}
