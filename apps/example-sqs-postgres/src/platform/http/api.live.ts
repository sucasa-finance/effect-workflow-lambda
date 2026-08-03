import { Effect, Option } from 'effect';
import { DurableDeferred, Workflow } from 'effect/unstable/workflow';
import type * as WorkflowEngine from 'effect/unstable/workflow/WorkflowEngine';
import * as HttpApiBuilder from 'effect/unstable/httpapi/HttpApiBuilder';
import type { WorkflowModule } from '@effect-workflow-engine/workflows/module';

import { RootHttpApi } from './api.define.js';

const pollResult = (result: Workflow.Result<unknown, unknown>) => {
  if (result._tag === 'Complete' && result.exit._tag === 'Success') {
    return { status: 'complete' as const, value: result.exit.value };
  }
  if (result._tag === 'Complete' && result.exit._tag === 'Failure') {
    return { status: 'failed' as const };
  }
  return { status: 'suspended' as const };
};

export const makeWorkflowHandlers = (modules: ReadonlyArray<WorkflowModule>) => {
  const byName = new Map(modules.map((m) => [m.workflow.name, m]));
  const signals = new Map(
    modules.flatMap((m) => Object.entries(m.signals ?? {})),
  );

  return HttpApiBuilder.group(RootHttpApi, 'workflows', (handlers) =>
    handlers
      .handle('run', ({ payload }) =>
        Effect.gen(function* () {
          const mod = byName.get(payload.workflow);
          if (!mod) return yield* Effect.die(`unknown workflow: ${payload.workflow}`);
          yield* mod.workflow.execute(payload.payload, { discard: true });
          const executionId = yield* mod.workflow.executionId(payload.payload);
          return { executionId, status: 'accepted' as const };
        }) as Effect.Effect<{ executionId: string; status: 'accepted' }, never, WorkflowEngine.WorkflowEngine>,
      )
      .handle('poll', ({ params }) =>
        Effect.gen(function* () {
          for (const { workflow } of modules) {
            const result = yield* (workflow.poll(params.executionId) as Effect.Effect<Option.Option<Workflow.Result<unknown, unknown>>, never, WorkflowEngine.WorkflowEngine>).pipe(
              Effect.catch(() => Effect.succeed(Option.none<Workflow.Result<unknown, unknown>>())),
            );
            if (Option.isSome(result)) {
              return pollResult(result.value);
            }
          }
          return { status: 'pending' as const };
        }),
      )
      .handle('signal', ({ payload }) =>
        Effect.gen(function* () {
          const mod = byName.get(payload.workflow);
          if (!mod) return yield* Effect.die(`unknown workflow: ${payload.workflow}`);
          const sig = signals.get(payload.deferredName);
          if (!sig) return yield* Effect.die(`unknown signal: ${payload.deferredName}`);

          const token = DurableDeferred.tokenFromExecutionId(sig, {
            workflow: mod.workflow,
            executionId: payload.executionId,
          });
          yield* DurableDeferred.succeed(sig, { token, value: payload.value as never });
          return { status: 'signalled' as const };
        }) as Effect.Effect<{ status: 'signalled' }, never, WorkflowEngine.WorkflowEngine>,
      )
      .handle('interrupt', ({ params }) =>
        Effect.gen(function* () {
          for (const { workflow } of modules) {
            yield* workflow.interrupt(params.executionId).pipe(Effect.ignore);
          }
          return { status: 'interrupted' as const };
        }) as Effect.Effect<{ status: 'interrupted' }, never, WorkflowEngine.WorkflowEngine>,
      ),
  );
};
