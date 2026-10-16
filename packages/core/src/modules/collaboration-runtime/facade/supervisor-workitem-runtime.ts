/**
 * 自然语言 Supervisor 与正式父 Task / Collaboration Run 之间的注入边界。
 *
 * collaboration-runtime 只依赖这个端口，不反向依赖 project feature。
 */

import type { CollaborationRunSnapshot } from './contract-execution-types';

export interface SupervisorWorkItemDesignGap {
  readonly code: string;
  readonly message: string;
  readonly remediation: string;
  readonly path?: string;
  readonly refId?: string;
}

export interface BindSupervisorWorkItemInput {
  readonly projectId: string;
  readonly collaborationSessionId: string;
  readonly requestId: string;
  readonly objective: string;
}

export interface SupervisorWorkItemBindingReceipt {
  readonly projectId: string;
  readonly collaborationSessionId: string;
  readonly requestId: string;
  readonly parentTaskId: string;
  readonly parentStepId: string;
  readonly parentSessionId?: string;
  readonly runId: string;
  readonly solutionId: string;
  readonly solutionVersion: string;
  readonly contractId: string;
  readonly contractHash: string;
  readonly taskTemplateId: string;
  readonly snapshot: CollaborationRunSnapshot;
}

export type BindSupervisorWorkItemResult =
  | { readonly ok: true; readonly receipt: SupervisorWorkItemBindingReceipt }
  | { readonly ok: false; readonly gaps: readonly SupervisorWorkItemDesignGap[] };

export interface AdvanceSupervisorWorkItemsInput {
  readonly binding: SupervisorWorkItemBindingReceipt;
  readonly requestId: string;
}

export interface SupervisorWorkItemRuntimePort {
  bind(input: BindSupervisorWorkItemInput): Promise<BindSupervisorWorkItemResult>;
  advance(input: AdvanceSupervisorWorkItemsInput): Promise<CollaborationRunSnapshot>;
}

declare global {
  // eslint-disable-next-line no-var
  var __originosSupervisorWorkItemRuntimePort: SupervisorWorkItemRuntimePort | undefined;
}

/**
 * Production composition installs the project-owned adapter here. Returning a
 * disposer keeps tests and hot reload from clearing a newer registration.
 */
export function registerSupervisorWorkItemRuntimePort(
  port: SupervisorWorkItemRuntimePort,
): () => void {
  globalThis.__originosSupervisorWorkItemRuntimePort = port;
  return () => {
    if (globalThis.__originosSupervisorWorkItemRuntimePort === port) {
      globalThis.__originosSupervisorWorkItemRuntimePort = undefined;
    }
  };
}

export function getSupervisorWorkItemRuntimePort(): SupervisorWorkItemRuntimePort | null {
  return globalThis.__originosSupervisorWorkItemRuntimePort ?? null;
}
