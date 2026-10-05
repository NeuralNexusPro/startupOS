/** Supervisor DAG 共享类型与运行时 helper：manifest 适配类型、执行配置、runtime config 摘要 */

import type { RuntimeLLMConfig } from '../../../lib/integrations/pi-agent/llm-config';
import type { RuntimeEvent } from '../../../modules/collaboration-runtime/session/types';

export interface AgentCollaboration {
  targetAgentId: string;
  targetAgentName: string;
  type: string;
  description: string;
}

export interface AgentsJsonAgent {
  id: string;
  name: string;
  type: string;
  responsibility: string;
  businessDomain: string;
  skills?: string[];
  dataOperations?: Record<string, string[]>;
  ontologyOperations?: Array<{ objectType: string; operations: string[] }>;
  collaborations?: AgentCollaboration[];
}

export interface AgentsJson {
  agents: AgentsJsonAgent[];
}

export function summarizeRuntimeConfig(config?: RuntimeLLMConfig): Record<string, unknown> {
  if (!config) return { provided: false };
  const credentialSource = config.anthropicCredentialSource
    ?? (config.anthropicAuthToken ? "anthropicAuthToken" : undefined)
    ?? (config.anthropicApiKey ? "anthropicApiKey" : undefined)
    ?? (config.authToken ? "authToken" : undefined)
    ?? (config.apiKey ? "apiKey" : undefined);
  return {
    provided: true,
    provider: config.provider ?? "default",
    model: config.model ?? "default",
    baseUrl: config.anthropicBaseUrl ?? config.baseUrl ?? "default",
    hasCredential: Boolean(config.anthropicAuthToken || config.anthropicApiKey || config.authToken || config.apiKey),
    credentialSource: credentialSource ?? "none",
    maxTokens: config.maxTokens ?? "default",
  };
}

export function logRuntime(phase: string, data: Record<string, unknown>): void {
  console.error(`[MultiAgentRuntime] ${phase} ${JSON.stringify(data)}`);
}

export interface UpstreamArtifactRef {
  name: string;
  ref: string;
  writer: string;
  sourceTaskId?: string;
}

export interface UpstreamOutput {
  text: string;
  artifacts: UpstreamArtifactRef[];
}

export interface ManifestAgent {
  id: string;
  name: string;
  domain: string;
  responsibility: string;
  dataOperations: Record<string, string[]>;
  skills: string[];
}

export interface SolutionManifest {
  agents: ManifestAgent[];
  collaboration: { edges: Array<{ from: string; to: string; type: string; description: string }> };
}

export interface MultiAgentExecutionResult {
  status: "completed" | "failed" | "aborted" | "timed_out";
  completedAgents: string[];
  failedAgents: string[];
  events: RuntimeEvent[];
}

export interface MultiAgentExecutorConfig {
  projectId: string;
  globalGoal: string;
  sessionId?: string;
  timeoutMs?: number;
  maxIterations?: number;
  /** Story 9.35: 检测到首个 WORKER_BLOCK 时懒加载 supervisor-lite。默认 true。设为 false 则 WORKER_BLOCK → failed。 */
  enableLightweightSupervisor?: boolean;
  /** AG.2: 模型工厂，通过 DI 注入，避免直接 import lib/integrations */
  modelFactory?: { createAutoModel(): unknown };
  llmConfig?: RuntimeLLMConfig;
}
