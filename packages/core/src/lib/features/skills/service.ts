import type {
  SkillListRequest,
  SkillListItem,
  SkillListResponse,
  SkillContentRequest,
  SkillContentResponse,
  SkillDetailRequest,
  SkillDetailResponse,
  SkillSessionsRequest,
  SkillSessionsResponse,
  SkillExecutionStartRequest,
  SkillExecutionStartResponse,
  SkillExecutionCompleteRequest,
  SkillExecutionCompleteResponse,
  SkillExecutionTimelineRequest,
  SkillExecutionTimelineItem,
  SkillExecutionTimelineResponse,
  SkillExecutionMessageRequest,
  SkillExecutionMessageResponse,
  SkillExecutionStreamEvent,
  SkillExecutionStreamRequest,
} from '../../../types/skill-service';
export type {
  SkillSource,
  SkillListRequest,
  SkillListItem,
  SkillListResponse,
  SkillContentRequest,
  SkillContentResponse,
  SkillDetailRequest,
  SkillDetailResponse,
  SkillSessionsRequest,
  SkillSessionsResponse,
  SkillExecutionStartRequest,
  SkillExecutionStartResponse,
  SkillExecutionCompleteRequest,
  SkillExecutionCompleteResponse,
  SkillExecutionTimelineRequest,
  SkillExecutionTimelineItem,
  SkillExecutionTimelineResponse,
  SkillExecutionMessageRequest,
  SkillExecutionMessageResponse,
  SkillExecutionStreamEventType,
  SkillExecutionStreamEvent,
  SkillExecutionStreamRequest,
} from '../../../types/skill-service';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { getDataRoot, getSkillsDataDir } from '../../paths';
import { agentSessionService } from '../agent/session-service';
import { ontologyStorage } from '../ontology/storage';
import type { AgentMessage, AgentSession } from '../../../types/agent';
import type { SkillContext, SkillResult, SkillTools } from '../../../types/skill';
import { agentManager } from '../../integrations/pi-agent/agent-manager';
import { handle as taskManagerHandler } from './bundled/task-manager/handler';
import { handle as infoQueryHandler } from './bundled/info-query/handler';
import { handle as ontologyEditorHandler } from './bundled/ontology-editor/handler';
import {
  loadSkillContent,
  loadSkillFromDirectory,
  loadSkills,
  materializeBundledSkill,
  parseFrontmatter,
  type Skill,
} from '../../integrations/pi-agent/core/skills';
import { extractDisplayContent } from '../../integrations/pi-agent/display-content';
import { getVisibleStreamDelta, reconcileFinalStreamContent } from '../../integrations/pi-agent/stream-dedupe';

function resolveSkillWorkingDirectory(skill: Skill): string {
  const skillCode = skill.code ?? skill.name;
  const dir = skill.source === 'bundled'
    ? path.join(getDataRoot(), 'skills', skillCode)
    : skill.baseDir;
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function resolveOutputDirFromFrontmatter(outputDir: string): string {
  if (path.isAbsolute(outputDir)) {
    return outputDir;
  }

  const normalized = outputDir.replace(/\\/g, '/').replace(/^\.?\//, '').replace(/\/+$/, '');
  if (normalized === 'data') {
    return getDataRoot();
  }
  if (normalized.startsWith('data/')) {
    return path.join(getDataRoot(), normalized.slice('data/'.length));
  }
  return path.join(getDataRoot(), normalized);
}

/**
 * 解析技能的产物输出目录
 * - 有 frontmatter outputDir → 基于数据根目录解析相对路径
 *   - outputDir: data/ → getDataRoot()
 *   - outputDir: data/agents → getDataRoot()/agents
 * - 无 outputDir → 默认等于 workingDirectory
 */
function resolveSkillOutputDir(skill: Skill): string {
  const workingDir = resolveSkillWorkingDirectory(skill);
  if (skill.outputDir) {
    return resolveOutputDirFromFrontmatter(skill.outputDir);
  }
  return workingDir;
}

type AgentStreamEvent = {
  type?: string;
  delta?: { text?: string };
  message?: { content?: unknown };
  error?: { message?: string };
};

export class SkillServiceError extends Error {
  constructor(
    public readonly code: 'INVALID_REQUEST' | 'NOT_FOUND' | 'DISABLED' | 'INTERNAL_ERROR',
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'SkillServiceError';
  }
}

function toListItem(skill: Skill): SkillListItem {
  return {
    name: skill.name,
    code: skill.code,
    description: skill.description,
    source: skill.source,
    filePath: skill.filePath,
    baseDir: skill.baseDir,
    disableModelInvocation: skill.disableModelInvocation,
    systemManaged: skill.systemManaged,
  };
}

function findSkill(name: string): Skill | undefined {
  const result = loadSkills({ includeDefaults: true });
  return result.skills.find((skill) => skill.code === name || skill.name === name);
}

function findSkillForContent(name: string): Skill | undefined {
  const dataSkill = loadSkillFromDirectory(path.join(getSkillsDataDir(), name), 'user').skill;
  if (dataSkill) {
    return dataSkill;
  }

  const skill = findSkill(name);
  if (skill?.systemManaged) {
    return materializeBundledSkill(skill.code ?? skill.name) ?? skill;
  }
  return skill ?? materializeBundledSkill(name) ?? undefined;
}

function generateExecutionId(skillName: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `skill-${skillName}-${timestamp}-${random}`;
}

function generateEntityId(type: string): string {
  const prefix = type.toLowerCase().substring(0, 4);
  const suffix = Math.random().toString(36).substring(2, 10);
  return `${prefix}_${suffix}`;
}

function getTimestamp(): string {
  return new Date().toISOString();
}

function extractMessage(data: unknown): string {
  if (typeof data === 'string') {
    return data;
  }
  if (typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>;
    if (typeof obj['message'] === 'string') {
      return obj['message'];
    }
    if (typeof obj['content'] === 'string') {
      return obj['content'];
    }
    return JSON.stringify(data);
  }
  return String(data);
}

export function extractTextContent(content: unknown): string {
  return extractDisplayContent(content);
}

function createSkillContextTools(): SkillTools {
  return {
    createEntity: async (type: string, properties: Record<string, unknown>) => {
      const entityId = generateEntityId(type);
      const timestamp = getTimestamp();

      return ontologyStorage.createEntity({
        id: entityId,
        type,
        properties,
        created: timestamp,
        updated: timestamp,
      });
    },
    updateEntity: async (entityId: string, properties: Record<string, unknown>) => {
      return ontologyStorage.updateEntity(entityId, properties);
    },
    queryEntities: async (type: string, where: Record<string, unknown>) => {
      return ontologyStorage.queryEntities(type, where);
    },
  };
}

function loadSkillHandler(skillName: string): {
  handler: (context: SkillContext) => Promise<SkillResult>;
  displayName: string;
} | null {
  switch (skillName) {
    case 'task-manager':
      return {
        handler: taskManagerHandler,
        displayName: '任务助手',
      };
    case 'info-query':
      return {
        handler: infoQueryHandler,
        displayName: '信息查询',
      };
    case 'ontology-editor':
      return {
        handler: ontologyEditorHandler,
        displayName: '知识图谱编辑',
      };
    default:
      return null;
  }
}

function resolveExecutionInput(request: SkillExecutionStartRequest): unknown {
  const { data, args, input } = request;
  if (typeof data === 'string' || typeof data === 'object') {
    return data;
  }
  if (typeof args === 'string' || typeof args === 'object') {
    return args;
  }
  if (typeof input === 'string') {
    return input;
  }
  if (input && typeof input === 'object') {
    if ('data' in input) {
      return (input as { data: unknown }).data;
    }
    if ('input' in input) {
      return (input as { input: unknown }).input;
    }
    return input;
  }
  return undefined;
}

function getMessageSkillName(session: AgentSession): string {
  return String(
    session.messages.find((message) => message.metadata?.['skillName'])?.metadata?.['skillName'] ?? 'unknown'
  );
}

function messagesToTimeline(messages: AgentMessage[]): SkillExecutionTimelineItem[] {
  const timeline: SkillExecutionTimelineItem[] = [];

  if (messages.length > 0) {
    timeline.push({
      type: 'start',
      timestamp: new Date(messages[0]?.timestamp ?? Date.now()).toISOString(),
      data: {
        status: 'running',
      },
    });
  }

  for (const message of messages) {
    if (message.toolResults && message.toolResults.length > 0) {
      for (const tool of message.toolResults) {
        timeline.push({
          type: 'tool',
          timestamp: new Date(message.timestamp).toISOString(),
          data: {
            toolName: tool.toolCallId || 'unknown',
            toolResult: tool.result,
          },
        });
      }
    }

    if (message.role === 'user' || message.role === 'assistant') {
      timeline.push({
        type: 'message',
        timestamp: new Date(message.timestamp).toISOString(),
        data: {
          role: message.role,
          content: typeof message.content === 'string' && message.content.length > 500
            ? `${message.content.substring(0, 500)}...`
            : message.content,
        },
      });
    }

    if (message.metadata?.['error']) {
      timeline.push({
        type: 'error',
        timestamp: new Date(message.timestamp).toISOString(),
        data: {
          error: String(message.metadata['error']),
        },
      });
    }

    if (message.metadata?.['status'] === 'completed' || message.metadata?.['status'] === 'cancelled') {
      timeline.push({
        type: 'end',
        timestamp: new Date(message.timestamp).toISOString(),
        data: {
          status: message.metadata['status'],
        },
      });
    }
  }

  return timeline;
}

export function listSkills(request: SkillListRequest = {}): SkillListResponse {
  const {
    source,
    includeInvisible = false,
    includeDiagnostics = true,
  } = request;

  const result = loadSkills({ includeDefaults: true });
  let skills = result.skills;

  if (source) {
    skills = skills.filter((skill) => skill.source === source);
  }

  if (!includeInvisible) {
    skills = skills.filter((skill) => !skill.disableModelInvocation);
  }

  return {
    skills: skills.map(toListItem),
    diagnostics: includeDiagnostics ? result.diagnostics : [],
  };
}

export function refreshSkills(): SkillListResponse {
  const result = loadSkills({ includeDefaults: true });

  return {
    skills: result.skills.map(toListItem),
    diagnostics: result.diagnostics,
  };
}

export function getSkillContent(request: SkillContentRequest): SkillContentResponse {
  const skill = findSkillForContent(request.name);

  if (!skill) {
    throw new SkillServiceError('NOT_FOUND', `Skill "${request.name}" not found`, 404);
  }

  const content = readFileSync(skill.filePath, 'utf-8');
  const workingDir = resolveSkillWorkingDirectory(skill);
  const outputDir = resolveSkillOutputDir(skill);
  const response: SkillContentResponse = {
    content,
    baseDir: skill.baseDir,
    workingDir,
    outputDir,
    systemManaged: skill.systemManaged === true,
  };

  if (request.includeFrontmatter) {
    response.frontmatter = parseFrontmatter(content).frontmatter;
  }

  return response;
}

export function getSkillDetail(request: SkillDetailRequest): SkillDetailResponse {
  const skill = findSkill(request.name);

  if (!skill) {
    throw new SkillServiceError('NOT_FOUND', `Skill "${request.name}" not found`, 404);
  }

  if (skill.disableModelInvocation && request.includeInvisible === false) {
    throw new SkillServiceError(
      'DISABLED',
      `Skill "${request.name}" has disableModelInvocation enabled`,
      403
    );
  }

  const { frontmatter, body } = loadSkillContent(skill);

  return {
    name: skill.name,
    description: skill.description,
    source: skill.source,
    filePath: skill.filePath,
    baseDir: skill.baseDir,
    disableModelInvocation: skill.disableModelInvocation,
    content: body,
    frontmatter,
  };
}

export async function listSkillSessions(
  request: SkillSessionsRequest
): Promise<SkillSessionsResponse> {
  if (!request.skillName) {
    throw new SkillServiceError(
      'INVALID_REQUEST',
      'skillName is required',
      400
    );
  }

  const sessions = await agentSessionService.listSessions(`skill-${request.skillName}`);

  return {
    sessions,
    count: sessions.length,
  };
}

export async function startSkillExecution(
  request: SkillExecutionStartRequest
): Promise<{ status: number; data: SkillExecutionStartResponse }> {
  const skillName = request.skillName;
  if (!skillName) {
    throw new SkillServiceError('INVALID_REQUEST', 'skillName is required', 400);
  }

  const skill = findSkill(skillName);
  if (!skill) {
    throw new SkillServiceError('NOT_FOUND', `Skill "${skillName}" not found`, 404);
  }

  const loadedSkill = loadSkillHandler(skillName);
  if (!loadedSkill) {
    throw new SkillServiceError('NOT_FOUND', `Skill "${skillName}" not found`, 404);
  }

  const inputData = resolveExecutionInput(request);
  let sessionId = request.sessionId;

  if (sessionId) {
    const existing = await agentSessionService.getSession(sessionId);
    if (!existing) {
      throw new SkillServiceError('INVALID_REQUEST', `Session "${sessionId}" not found`, 404);
    }
  } else {
    const workingDirectory = resolveSkillWorkingDirectory(skill);
    const outputDirectory = resolveSkillOutputDir(skill);
    const newSession = await agentSessionService.createSession({
      projectId: `skill-${skillName}`,
      projectName: `Skill: ${loadedSkill.displayName || skillName}`,
      systemPrompt: `You are executing skill: ${loadedSkill.displayName || skillName}`,
      agentType: 'skill',
      projectContext: {
        currentPath: workingDirectory,
        outputDir: outputDirectory,
      },
    });
    sessionId = newSession.sessionId;
  }

  const executionId = generateExecutionId(skillName);
  const session = await agentSessionService.getSession(sessionId);
  if (!session) {
    throw new SkillServiceError('INTERNAL_ERROR', 'Failed to get session', 500);
  }

  const skillContext: SkillContext = {
    sessionId,
    session: {
      projectContext: {
        projectId: session.projectContext.projectId || `skill-${skillName}`,
        projectName: session.projectContext.projectName || `Skill: ${skillName}`,
        ontologyId: session.projectContext.ontologyId,
        currentPath: session.projectContext.currentPath,
        userId: session.projectContext.userId,
      },
      messages: session.messages,
    },
    input: {
      message: typeof inputData === 'string' ? inputData : undefined,
      data: typeof inputData === 'object' && inputData !== null
        ? inputData as Record<string, unknown>
        : undefined,
    },
    tools: createSkillContextTools(),
    config: typeof request.config === 'object' && request.config !== null
      ? request.config as Record<string, unknown>
      : undefined,
  };

  await agentSessionService.addMessage(sessionId, {
    role: 'system',
    content: `[Skill] Starting skill: ${skillName}`,
    metadata: {
      skillName,
      executionId,
      args: inputData,
    },
  });

  if (inputData) {
    try {
      const result = await loadedSkill.handler(skillContext);

      await agentSessionService.addMessage(sessionId, {
        role: 'assistant',
        content: result.message || (result.data ? JSON.stringify(result.data) : 'Skill executed successfully'),
        metadata: {
          skillName,
          executionId,
          success: result.success,
          complete: result.complete ?? true,
        },
      });

      if (result.complete !== false) {
        return {
          status: 200,
          data: {
            executionId,
            skillName,
            status: 'completed',
            startedAt: new Date().toISOString(),
            sessionId,
            message: result.message || (result.data ? extractMessage(result.data) : 'Skill executed successfully'),
            data: result.data,
          },
        };
      }
    } catch (error) {
      console.error('Skill execution error:', error);
      await agentSessionService.addMessage(sessionId, {
        role: 'system',
        content: `[Error] Skill execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        metadata: {
          skillName,
          executionId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });
    }
  }

  return {
    status: 201,
    data: {
      executionId,
      skillName,
      status: 'running',
      startedAt: new Date().toISOString(),
      sessionId,
    },
  };
}

export async function completeSkillExecution(
  request: SkillExecutionCompleteRequest
): Promise<SkillExecutionCompleteResponse> {
  if (!request.sessionId) {
    throw new SkillServiceError('INVALID_REQUEST', 'sessionId is required', 400);
  }

  const session = await agentSessionService.getSession(request.sessionId);
  if (!session) {
    throw new SkillServiceError('NOT_FOUND', 'Session not found', 404);
  }

  const skillName = getMessageSkillName(session);
  const startedAt = new Date(session.createdAt);
  const endedAt = new Date();
  const duration = endedAt.getTime() - startedAt.getTime();
  const status: 'completed' | 'cancelled' = request.cancelled ? 'cancelled' : 'completed';

  await agentSessionService.updateSession(request.sessionId, {
    status,
  });

  await agentSessionService.addMessage(request.sessionId, {
    role: 'system',
    content: `[Skill] Execution ${status}: ${skillName}`,
    metadata: {
      skillName,
      executionId: request.executionId,
      status,
      endedAt: endedAt.toISOString(),
    },
  });

  return {
    success: !request.cancelled,
    status,
    endedAt: endedAt.toISOString(),
    summary: {
      totalMessages: session.messages.length,
      duration,
    },
  };
}

export async function getSkillExecutionTimeline(
  request: SkillExecutionTimelineRequest
): Promise<SkillExecutionTimelineResponse> {
  if (!request.sessionId) {
    throw new SkillServiceError('INVALID_REQUEST', 'sessionId is required', 400);
  }

  const session = await agentSessionService.getSession(request.sessionId);
  if (!session) {
    throw new SkillServiceError('NOT_FOUND', 'Session not found', 404);
  }

  const status: SkillExecutionTimelineResponse['status'] =
    session.status === 'completed'
      ? 'completed'
      : session.status === 'cancelled'
        ? 'failed'
        : 'running';

  return {
    executionId: request.executionId,
    skillName: getMessageSkillName(session),
    startedAt: new Date(session.createdAt).toISOString(),
    status,
    endedAt: session.status !== 'active' ? new Date(session.updatedAt).toISOString() : undefined,
    timeline: messagesToTimeline(session.messages),
  };
}

export async function sendSkillExecutionMessage(
  request: SkillExecutionMessageRequest
): Promise<{ status: number; data: SkillExecutionMessageResponse; error?: { code: string; message: string } }> {
  if (!request.sessionId) {
    throw new SkillServiceError('INVALID_REQUEST', 'sessionId is required', 400);
  }

  if (!request.content) {
    throw new SkillServiceError('INVALID_REQUEST', 'content is required', 400);
  }

  const session = await agentSessionService.getSession(request.sessionId);
  if (!session) {
    throw new SkillServiceError('NOT_FOUND', 'Session not found', 404);
  }

  const updatedSession = await agentSessionService.addMessage(request.sessionId, {
    role: request.role || 'user',
    content: request.content,
    metadata: {
      ...request.metadata,
      executionId: request.executionId,
    },
  });

  if (!updatedSession) {
    throw new SkillServiceError('INTERNAL_ERROR', 'Failed to add message to session', 500);
  }

  const skillName = getMessageSkillName(session);
  const agent = await agentManager.getOrCreateAgent(
    request.sessionId,
    session.projectContext.projectId,
    {
      systemPrompt: `You are executing skill: ${skillName}\n\nProcess user input and respond appropriately for the skill context.`,
      agentType: 'skill',
      agentBaseDir: session.projectContext.currentPath,
      outputDir: session.projectContext.outputDir,
    },
  );

  try {
    let assistantContent = '';
    let hasError = false;
    let errorMessage = '';

    const unsubscribe = agent.subscribe((event: unknown) => {
      const eventData = event as {
        type?: string;
        delta?: { text?: string };
        message?: { content?: unknown };
        error?: { message?: string };
      };

      switch (eventData?.type) {
        case 'message_delta':
          if (eventData.delta?.text) {
            assistantContent = getVisibleStreamDelta(assistantContent, eventData.delta.text).content;
          }
          break;
        case 'message_end': {
          if (eventData.message?.content) {
            const content = extractTextContent(eventData.message.content);
            if (content) {
              assistantContent = reconcileFinalStreamContent(assistantContent, content);
            }
          }
          break;
        }
        case 'agent_error':
          hasError = true;
          errorMessage = eventData.error?.message || 'Unknown error';
          break;
      }
    });

    try {
      await agent.prompt(request.content);
    } catch (promptError) {
      hasError = true;
      errorMessage = promptError instanceof Error ? promptError.message : 'Failed to call LLM';
    } finally {
      unsubscribe();
    }

    let assistantMessage: AgentMessage | undefined;
    if (assistantContent) {
      const finalSession = await agentSessionService.addMessage(request.sessionId, {
        role: 'assistant',
        content: assistantContent,
        metadata: { skillName, executionId: request.executionId },
      });
      assistantMessage = finalSession?.messages[finalSession.messages.length - 1];
    }

    const data: SkillExecutionMessageResponse = {
      message: {
        role: request.role || 'user',
        content: request.content,
        timestamp: new Date().toISOString(),
      },
      executionStatus: assistantMessage ? {
        status: hasError ? 'failed' : 'running',
        progress: undefined,
      } : undefined,
    };

    if (assistantMessage) {
      data.assistantMessage = {
        role: 'assistant',
        content: assistantMessage.content,
        timestamp: new Date(assistantMessage.timestamp).toISOString(),
      };
    }

    return {
      status: hasError ? 500 : 201,
      data,
      error: hasError ? { code: 'LLM_ERROR', message: errorMessage } : undefined,
    };
  } catch (llmError) {
    console.error('LLM processing error:', llmError);

    return {
      status: 500,
      data: {
        message: {
          role: request.role || 'user',
          content: request.content,
          timestamp: new Date().toISOString(),
        },
      },
      error: {
        code: 'LLM_ERROR',
        message: llmError instanceof Error ? llmError.message : 'LLM processing failed',
      },
    };
  }
}

export async function streamSkillExecutionMessage(
  request: SkillExecutionStreamRequest,
  emit: (event: SkillExecutionStreamEvent) => void | Promise<void>
): Promise<void> {
  if (!request.sessionId) {
    throw new SkillServiceError('INVALID_REQUEST', 'sessionId is required', 400);
  }

  if (!request.content) {
    throw new SkillServiceError('INVALID_REQUEST', 'content is required', 400);
  }

  const session = await agentSessionService.getSession(request.sessionId);
  if (!session) {
    throw new SkillServiceError('NOT_FOUND', 'Session not found', 404);
  }

  const updatedSession = await agentSessionService.addMessage(request.sessionId, {
    role: request.role || 'user',
    content: request.content,
    metadata: {
      ...request.metadata,
      executionId: request.executionId,
    },
  });

  if (!updatedSession) {
    throw new SkillServiceError('INTERNAL_ERROR', 'Failed to add message to session', 500);
  }

  const userMessage = updatedSession.messages[updatedSession.messages.length - 1];
  await emit({
    executionId: request.executionId,
    type: 'user_message',
    data: userMessage,
  });

  const skillName = getMessageSkillName(session);
  const agent = await agentManager.getOrCreateAgent(
    request.sessionId,
    session.projectContext.projectId,
    {
      systemPrompt: `You are executing skill: ${skillName}\n\nProcess user input and respond appropriately for the skill context.`,
      agentType: 'skill',
      agentBaseDir: session.projectContext.currentPath,
      outputDir: session.projectContext.outputDir,
    },
  );

  let assistantContent = '';
  const pendingEmits: Array<Promise<void>> = [];
  const queueEmit = (event: SkillExecutionStreamEvent): void => {
    pendingEmits.push(Promise.resolve(emit(event)));
  };

  const unsubscribe = agent.subscribe((event: unknown) => {
    const eventData = event as AgentStreamEvent;

    switch (eventData?.type) {
      case 'message_delta':
        if (eventData.delta?.text) {
          const merged = getVisibleStreamDelta(assistantContent, eventData.delta.text);
          assistantContent = merged.content;
          if (!merged.delta) {
            break;
          }
          queueEmit({
            executionId: request.executionId,
            type: 'assistant_message',
            data: {
              content: merged.delta,
              isStreaming: true,
            },
          });
        }
        break;

      case 'message_end': {
        if (eventData.message?.content) {
          const content = extractTextContent(eventData.message.content);
          if (content) {
            assistantContent = reconcileFinalStreamContent(assistantContent, content);
          }
        }

        if (assistantContent) {
          pendingEmits.push(
            agentSessionService
              .addMessage(request.sessionId as string, {
                role: 'assistant',
                content: assistantContent,
                metadata: { skillName, executionId: request.executionId },
              })
              .then(() => emit({
                executionId: request.executionId,
                type: 'assistant_message',
                data: {
                  content: assistantContent,
                  fullContent: assistantContent,
                  isStreaming: false,
                },
              }))
          );
        }
        break;
      }

      case 'agent_error':
        queueEmit({
          executionId: request.executionId,
          type: 'error',
          data: { message: eventData.error?.message || 'Unknown error' },
        });
        break;
    }
  });

  try {
    await agent.prompt(request.content);
    await Promise.all(pendingEmits);
    await emit({
      executionId: request.executionId,
      type: 'done',
      data: null,
    });
  } catch (error) {
    await Promise.all(pendingEmits);
    await emit({
      executionId: request.executionId,
      type: 'error',
      data: { message: error instanceof Error ? error.message : 'Unknown error' },
    });
  } finally {
    unsubscribe();
  }
}
