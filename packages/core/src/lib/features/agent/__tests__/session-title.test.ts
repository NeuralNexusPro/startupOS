import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentSessionService } from '../session-service';
import type { AgentTaskRuntimePersistenceV1 } from '../../../integrations/pi-agent/task-runtime';

let directory: string;

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-session-title-'));
  vi.stubEnv('DATA_ROOT', directory);
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(directory, { recursive: true, force: true });
});

describe('AgentSessionService conversation titles', () => {
  it('lists only persisted task runtime sessions for one project', async () => {
    const service = new AgentSessionService();
    const session = await service.createSession({
      sessionId: 'task-runtime-session', projectId: 'project-a', projectName: 'Project A',
    });
    await service.updateSession(session.sessionId, {
      taskRuntime: {
        schemaVersion: 1,
        branchEntries: [],
        execution: {
          schemaVersion: 1,
          mode: 'task_running',
          status: 'running',
          bridgeEpoch: 1,
          expectedRevision: 1,
          expectedCursor: null,
          continuationCount: 0,
          noProgressCount: 0,
          updatedAt: '2026-09-24T00:00:00.000Z',
        },
      } as AgentTaskRuntimePersistenceV1,
    }, 'project-a');

    await expect(service.listTaskRuntimeSessions('project-a')).resolves.toMatchObject([
      { sessionId: 'task-runtime-session', projectId: 'project-a' },
    ]);
    await expect(service.listTaskRuntimeSessions('project-b')).resolves.toEqual([]);
  });

  it('derives distinct titles from the most informative history content', async () => {
    const service = new AgentSessionService();
    const skill = await service.createSession({
      sessionId: 'skill-title', projectId: 'skill-writer', projectName: 'Writer', agentType: 'skill',
    });
    await service.addMessage(skill.sessionId, {
      role: 'user', content: '你好！请根据你的人设做一段简短有趣的自我介绍。',
    }, 'skill-writer');
    const updated = await service.addMessage(skill.sessionId, {
      role: 'user', content: '  帮我\n整理这次产品访谈的关键结论和后续行动  ',
    }, 'skill-writer');
    expect(updated?.summary).toBe('整理这次产品访谈的关键结论和后续行动');
    await service.addMessage(skill.sessionId, { role: 'user', content: '继续' }, 'skill-writer');

    const role = await service.createSession({
      sessionId: 'role-title', projectId: 'agent-researcher', projectName: 'Researcher', agentType: 'role-agent',
    });
    await service.updateSession(role.sessionId, { summary: '你好', messages: [
      { id: 'message-1', role: 'user', content: '你好', timestamp: 1 },
      { id: 'message-2', role: 'user', content: 'Perception event: event-1\nRule: rule-1\n\n@Yonda 分析企业微信文件接收失败的原因', timestamp: 2 },
    ] }, 'agent-researcher');
    const sessions = await service.listSessions('agent-researcher');
    expect(sessions[0]?.summary).toBe('分析企业微信文件接收失败的原因');

    const folder = await service.createSession({
      sessionId: 'folder-title', projectId: 'agent-secretary', projectName: 'Secretary', agentType: 'role-agent',
    });
    await service.updateSession(folder.sessionId, { messages: [
      { id: 'folder-1', role: 'user', content: '在帮我创建一个文件夹', timestamp: 1 },
      { id: 'folder-2', role: 'user', content: '9月工作计划', timestamp: 2 },
      { id: 'folder-3', role: 'user', content: '帮我打开', timestamp: 3 },
    ] }, 'agent-secretary');
    expect((await service.listSessions('agent-secretary'))[0]?.summary).toBe('9月工作计划');
  });
});
