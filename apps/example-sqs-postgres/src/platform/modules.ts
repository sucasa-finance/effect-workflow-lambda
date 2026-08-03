import type { WorkflowModule } from '@effect-workflow-engine/engine/WorkflowModule';
import { GreetModule } from '@effect-workflow-engine/workflows/greet.workflow.live';
import { DuplicateExecuteModule } from '@effect-workflow-engine/workflows/duplicate-execute.workflow.live';
import { InterruptActivityModule } from '@effect-workflow-engine/workflows/interrupt-activity.workflow.live';
import { MultiSignalModule } from '@effect-workflow-engine/workflows/multi-signal.workflow.live';
import { FanOutModule } from '@effect-workflow-engine/workflows/fan-out.workflow.live';
import { LargePayloadModule } from '@effect-workflow-engine/workflows/large-payload.workflow.live';
import { TypedFailureModule } from '@effect-workflow-engine/workflows/typed-failure.workflow.live';
import { InterruptibleModule } from '@effect-workflow-engine/workflows/interruptible.workflow.live';
import { IdempotentRunModule } from '@effect-workflow-engine/workflows/idempotent-run.workflow.live';

export const modules: ReadonlyArray<WorkflowModule> = [
  GreetModule,
  DuplicateExecuteModule,
  InterruptActivityModule,
  MultiSignalModule,
  FanOutModule,
  LargePayloadModule,
  TypedFailureModule,
  InterruptibleModule,
  IdempotentRunModule,
];
