// contract-bound WorkItem 的 artifact 执行运行时——目标目录解析、worker prompt 构建与 AgentManager 派发落盘。

import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import {
  assertCollaborationArtifactIdentifier,
  collaborationArtifactPath,
  createCollaborationArtifactRef,
  parseCollaborationArtifactRef,
} from '../../../../modules/collaboration-runtime/facade';

import {
  buildRoleSystemPrompt,
  loadRoleContext,
  parseStateMachine,
} from '../../../integrations/pi-agent/role-agent';

import type {
  ContractArtifactEnvelope,
  ProjectContractRuntimeHostCapabilities,
} from './contract-runtime-types';
import type {
  ContractBoundAgentSkillRuntimePort,
  ContractBoundRuntimeRequest,
  ContractBoundRuntimeResult,
} from '../../agent/server/contract-bound-worker';


export function assertIdentifier(value: string, field: string): void {
  assertCollaborationArtifactIdentifier(value, field);
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {return value.map(stableValue);}
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
}

export function sha256(value: unknown): string {
  return `sha256:${createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(stableValue(value)))
    .digest('hex')}`;
}

function artifactPath(
  dataRoot: string,
  projectId: string,
  runId: string,
  workItemId: string,
  attemptId: string,
): string {
  return collaborationArtifactPath(dataRoot, projectId, runId, workItemId, attemptId);
}

function artifactRef(
  projectId: string,
  runId: string,
  workItemId: string,
  attemptId: string,
): string {
  return createCollaborationArtifactRef(projectId, runId, workItemId, attemptId);
}

export function parseArtifactRef(dataRoot: string, ref: string): string {
  return parseCollaborationArtifactRef(dataRoot, ref);
}

function messageText(message: { readonly content?: unknown } | undefined): string {
  const content = message?.content;
  if (typeof content === 'string') {return content.trim();}
  if (!Array.isArray(content)) {return '';}
  return content
    .filter((block): block is { readonly type: 'text'; readonly text: string } =>
      Boolean(block)
      && typeof block === 'object'
      && (block as Record<string, unknown>)['type'] === 'text'
      && typeof (block as Record<string, unknown>)['text'] === 'string'
    )
    .map(({ text }) => text)
    .join('\n')
    .trim();
}


export function extractJsonObject(content: string): Record<string, unknown> {
  const trimmed = content.trim();
  const unwrapped = trimmed.startsWith('```')
    ? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    : trimmed;
  const candidates = [unwrapped];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < unwrapped.length; index += 1) {
    const char = unwrapped[index]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') {
      if (depth === 0) start = index;
      depth += 1;
    } else if (char === '}' && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        candidates.push(unwrapped.slice(start, index + 1));
        start = -1;
      }
    }
  }
  let lastError: unknown;
  for (const candidate of [...new Set(candidates)].reverse()) {
    try {
      const value: unknown = JSON.parse(candidate);
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>;
      }
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new TypeError('Worker result must contain a JSON object');
}

function latestAssistantContent(messages: readonly { readonly role: string; readonly content?: unknown }[]): string {
  return messageText([...messages].reverse().find(({ role }) => role === 'assistant'));
}

function buildWorkerPrompt(request: ContractBoundRuntimeRequest): string {
  const readOnly = request.target.contract.actions.length === 0
    && request.expectedOutputRefs.length === 0;
  const resultContract = readOnly
    ? [
        'This is a read-only WorkItem with no bound Action and no ontology output.',
        'Return exactly one JSON object shaped as {"result":"success","summary":"<actual findings>"}.',
        'Do not fabricate an outcome, actionId, or ontology output.',
      ]
    : [
        'The final object MUST match: {"outcome":{"actionId":"<one bound action id>","inputFactRefs":[],"outputs":[{"factId":"<stable business fact id>","factTypeId":"<one expected output fact type id>","value":{"<business field>":"<actual value>"},"source":{"sourceType":"runtime","sourceId":"<work item id>"}}],"expectedRevision":0},"result":"success"}.',
        'Omit currentStateId when there is no state. Never return currentStateId:null.',
        'Each outputs entry is a canonical fact draft. Do not return factType wrappers, instanceIds, operation summaries, or placeholder values.',
        'Do not mutate ontology instances or facts with tools. The runtime commits the returned outcome through the Action Gate after verification.',
      ];
  return JSON.stringify({
    instruction: [
      'Execute this frozen WorkItem and return exactly one JSON object without markdown fences.',
      ...resultContract,
    ].join(' '),
    request: {
      requestId: request.requestId,
      projectId: request.projectId,
      runId: request.runId,
      workItemId: request.workItemId,
      attemptId: request.attemptId,
      leaseEpoch: request.leaseEpoch,
      contractId: request.contractId,
      contractHash: request.contractHash,
      designNodeId: request.designNodeId,
      target: request.target,
      objective: request.objective,
      taskTemplate: request.taskTemplate,
      semanticContext: request.semanticContext,
      requiredPermissions: request.requiredPermissions,
      inputRefs: request.inputRefs,
      expectedOutputRefs: request.expectedOutputRefs,
      checkpointRef: request.checkpointRef,
    },
  });
}

async function firstExisting(candidates: readonly string[]): Promise<string | null> {
  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isDirectory()) {return candidate;}
    } catch {
      // Continue to the next explicit asset location.
    }
  }
  return null;
}

async function loadTargetSystemPrompt(
  workingDirectory: string,
  request: Pick<ContractBoundRuntimeRequest, 'target'>,
): Promise<string> {
  if (request.target.kind === 'agent') {
    const context = await loadRoleContext(workingDirectory);
    if (context) {
      const stateMachine = parseStateMachine(context.roleMd);
      context.currentPhase = stateMachine.currentPhase;
      return buildRoleSystemPrompt(context, stateMachine);
    }
    const agentMd = await fs.readFile(
      path.join(workingDirectory, 'Agent.md'),
      'utf8',
    ).catch(() => '');
    return [
      `# Contract-bound Agent: ${request.target.targetId}`,
      agentMd,
    ].filter(Boolean).join('\n\n');
  }
  const skillMd = await fs.readFile(
    path.join(workingDirectory, 'SKILL.md'),
    'utf8',
  ).catch(() => '');
  return [
    `# Contract-bound Skill: ${request.target.targetId}`,
    skillMd,
  ].filter(Boolean).join('\n\n');
}

export async function resolveTargetDirectory(
  dataRoot: string,
  request: Pick<ContractBoundRuntimeRequest, 'projectId' | 'target' | 'taskTemplate'>,
): Promise<string> {
  const targetId = request.target.targetId;
  assertIdentifier(request.projectId, 'projectId');
  assertIdentifier(targetId, 'targetId');
  const projectRoot = path.join(dataRoot, 'projects', request.projectId);
  const candidates = request.target.kind === 'agent'
    ? [
        path.join(projectRoot, 'agents', targetId),
        path.join(dataRoot, 'agents', targetId),
      ]
    : [
        path.join(projectRoot, 'skills', targetId),
        ...(request.taskTemplate?.candidateAgentIds ?? []).map((agentId) => {
          assertIdentifier(agentId, 'candidateAgentId');
          return path.join(projectRoot, 'agents', agentId, 'skills', targetId);
        }),
        path.join(dataRoot, 'skills', targetId),
      ];
  const resolved = await firstExisting(candidates);
  if (!resolved) {throw new Error('CONTRACT_TARGET_UNAVAILABLE');}
  return resolved;
}

export class AgentManagerContractRuntime implements ContractBoundAgentSkillRuntimePort {
  constructor(
    private readonly dataRoot: string,
    private readonly agents: ProjectContractRuntimeHostCapabilities['agents'],
  ) {}

  async execute(
    request: ContractBoundRuntimeRequest,
    signal: AbortSignal,
  ): Promise<ContractBoundRuntimeResult> {
    const startedAt = Date.now();
    const persisted = await this.recoverPersistedArtifact(request);
    if (persisted) {return persisted;}
    const workingDirectory = await resolveTargetDirectory(this.dataRoot, request);
    const agentType = request.target.kind === 'agent' ? 'role-agent' : 'skill';
    const systemPrompt = await loadTargetSystemPrompt(workingDirectory, request);
    const agent = await this.agents.getOrCreateAgent(
      request.executionKey,
      request.projectId,
      {
        agentType,
        systemPrompt,
        agentBaseDir: workingDirectory,
        isWindowBound: false,
      },
    );
    const abort = (): void => agent.abort();
    signal.addEventListener('abort', abort, { once: true });
    try {
      if (signal.aborted) {throw new Error('WORKER_ABORTED');}
      await agent.prompt(buildWorkerPrompt(request), undefined, {
        completionPolicy: 'task_runtime',
      });
      if (signal.aborted) {throw new Error('WORKER_ABORTED');}
      const state = await agent.getSessionState();
      let assistant = [...state.messages]
        .reverse()
        .find((message) => message.role === 'assistant');
      let content = messageText(assistant);
      if (!content) {throw new Error('WORKER_RESULT_EMPTY');}
      try {
        extractJsonObject(content);
      } catch {
        await agent.prompt(JSON.stringify({
          instruction: 'Your previous response did not contain the required final JSON object. Do not call tools or repeat the work. Using the result already present in this conversation, return only the corrected JSON object required by the frozen WorkItem contract.',
          expectedOutputRefs: request.expectedOutputRefs,
          boundActionIds: request.target.contract.actions.map(({ actionId }) => actionId),
          workItemId: request.workItemId,
        }), undefined, { completionPolicy: 'task_runtime' });
        const repaired = await agent.getSessionState();
        content = latestAssistantContent(repaired.messages);
        if (!content) {throw new Error('WORKER_RESULT_EMPTY');}
        extractJsonObject(content);
        assistant = [...repaired.messages]
          .reverse()
          .find((message) => message.role === 'assistant');
      }

      const envelope: ContractArtifactEnvelope = {
        schemaVersion: '1.0.0',
        requestId: request.requestId,
        runId: request.runId,
        workItemId: request.workItemId,
        attemptId: request.attemptId,
        targetId: request.target.targetId,
        content,
        createdAt: new Date().toISOString(),
      };
      const filePath = artifactPath(
        this.dataRoot,
        request.projectId,
        request.runId,
        request.workItemId,
        request.attemptId,
      );
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      const temporary = `${filePath}.${randomUUID()}.tmp`;
      await fs.writeFile(temporary, JSON.stringify(envelope, null, 2), 'utf8');
      await fs.rename(temporary, filePath);
      const ref = artifactRef(
        request.projectId,
        request.runId,
        request.workItemId,
        request.attemptId,
      );
      const usage = assistant?.usage;
      return {
        receiptId: `${request.idempotencyKey}:worker`,
        outputRefs: [ref],
        outputHash: sha256(envelope),
        usage: {
          durationMs: Date.now() - startedAt,
          tokens: usage?.totalTokens ?? 0,
        },
        checkpointRef: ref,
      };
    } finally {
      signal.removeEventListener('abort', abort);
      this.agents.removeAgent(request.executionKey);
    }
  }

  private async recoverPersistedArtifact(
    request: ContractBoundRuntimeRequest,
  ): Promise<ContractBoundRuntimeResult | null> {
    const filePath = artifactPath(
      this.dataRoot,
      request.projectId,
      request.runId,
      request.workItemId,
      request.attemptId,
    );
    let raw: string;
    try {
      raw = await fs.readFile(filePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {return null;}
      throw error;
    }
    const envelope = JSON.parse(raw) as ContractArtifactEnvelope;
    if (
      envelope.schemaVersion !== '1.0.0'
      || envelope.requestId !== request.requestId
      || envelope.runId !== request.runId
      || envelope.workItemId !== request.workItemId
      || envelope.attemptId !== request.attemptId
      || envelope.targetId !== request.target.targetId
    ) {
      throw new Error('PERSISTED_WORKER_ARTIFACT_SCOPE_MISMATCH');
    }
    extractJsonObject(envelope.content);
    return {
      receiptId: `${request.idempotencyKey}:worker`,
      outputRefs: [artifactRef(
        request.projectId,
        request.runId,
        request.workItemId,
        request.attemptId,
      )],
      outputHash: sha256(envelope),
      usage: { durationMs: 0, tokens: 0 },
      checkpointRef: artifactRef(
        request.projectId,
        request.runId,
        request.workItemId,
        request.attemptId,
      ),
    };
  }
}
