import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentSessionService } from '../session-service';
import type { JsonStore } from '../../../storage/json-store';

let directory: string;

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-session-index-'));
  vi.stubEnv('DATA_ROOT', directory);
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(directory, { recursive: true, force: true });
});

/** 直接改写会话文件（绕过 saveSession，模拟外部写入/历史存量数据）。 */
function rewriteSessionFile(projectId: string, sessionId: string, mutate: (data: unknown) => unknown): void {
  const filePath = path.join(directory, 'projects', projectId, 'sessions', `${sessionId}.json`);
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  fs.writeFileSync(filePath, JSON.stringify(mutate(raw), null, 2), 'utf-8');
}

function indexFilePath(dataRoot: string, projectId: string | null): string {
  return projectId
    ? path.join(dataRoot, 'projects', projectId, 'sessions', '.sessions-index.json')
    : path.join(dataRoot, 'sessions', '.sessions-index.json');
}

describe('AgentSessionService sessions index sidecar', () => {
  it('rebuilds the index on first list, then serves subsequent lists without reading session files', async () => {
    const service = new AgentSessionService();
    const session = await service.createSession({
      sessionId: 'index-hit', projectId: 'project-a', projectName: 'Project A', agentType: 'role-agent',
      projectContext: { projectId: 'project-a', projectName: 'Project A' },
    });
    await service.addMessage(session.sessionId, { role: 'user', content: '帮我整理产品访谈结论' }, 'project-a');

    // 第一次 list：无索引 → 全量扫描 + 重建
    const first = await service.listSessions('project-a');
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ sessionId: 'index-hit', messageCount: 1 });
    expect(fs.existsSync(indexFilePath(directory, 'project-a'))).toBe(true);

    // 第二次 list：索引命中 —— spy store.read，会话文件本体不被读取
    const store = (service as unknown as { store: JsonStore }).store;
    const readSpy = vi.spyOn(store, 'read');
    const second = await service.listSessions('project-a');
    expect(second).toEqual(first);
    const readPaths = readSpy.mock.calls.map((call) => String(call[0]));
    expect(readPaths.some((p) => p.includes('index-hit.json'))).toBe(false);
    readSpy.mockRestore();

    // 索引命中时只有索引文件被读
    expect(readPaths.every((p) => p.includes('.sessions-index.json'))).toBe(true);
  });

  it('falls back to a full scan and rebuilds the index when a session file changes externally', async () => {
    const service = new AgentSessionService();
    await service.createSession({
      sessionId: 'drift-a', projectId: 'project-b', projectName: 'Project B',
      projectContext: { projectId: 'project-b', projectName: 'Project B' },
    });
    await service.listSessions('project-b');

    // 外部改动会话文件（mtime/size 变化）→ 索引失配 → 回退全量扫描
    rewriteSessionFile('project-b', 'drift-a', (raw: { data: { summary?: string } }) => ({
      ...raw,
      data: { ...raw.data, summary: '外部改写的摘要' },
    }));
    const items = await service.listSessions('project-b');
    expect(items[0]?.summary).toBe('外部改写的摘要');
  });

  it('falls back when a session file is deleted externally', async () => {
    const service = new AgentSessionService();
    const session = await service.createSession({
      sessionId: 'gone', projectId: 'project-c', projectName: 'Project C',
      projectContext: { projectId: 'project-c', projectName: 'Project C' },
    });
    await service.listSessions('project-c');

    fs.rmSync(path.join(directory, 'projects', 'project-c', 'sessions', `${session.sessionId}.json`));
    const items = await service.listSessions('project-c');
    expect(items).toHaveLength(0);
  });

  it('falls back when a new session file appears externally', async () => {
    const service = new AgentSessionService();
    await service.createSession({
      sessionId: 'existing', projectId: 'project-f', projectName: 'PF',
      projectContext: { projectId: 'project-f', projectName: 'PF' },
    });
    await service.listSessions('project-f');

    // 外部新增会话文件（条目集合失配）→ 回退全量扫描
    // 直接复制既有会话文件并改写内部 sessionId，绕过 saveSession 的索引维护
    const sourcePath = path.join(directory, 'projects', 'project-f', 'sessions', 'existing.json');
    const raw = JSON.parse(fs.readFileSync(sourcePath, 'utf-8'));
    raw.data.sessionId = 'hand-made';
    fs.writeFileSync(
      path.join(directory, 'projects', 'project-f', 'sessions', 'hand-made.json'),
      JSON.stringify(raw, null, 2),
      'utf-8',
    );
    const items = await service.listSessions('project-f');
    expect(items.map((item) => item.sessionId).sort()).toEqual(['existing', 'hand-made'].sort());
  });

  it('skips per-session user-config backfill in the fallback scan', async () => {
    const service = new AgentSessionService();
    for (let i = 0; i < 5; i += 1) {
      await service.createSession({
        sessionId: `perf-${i}`, projectId: 'project-d', projectName: 'PD',
        projectContext: { projectId: 'project-d', projectName: 'PD' },
      });
    }

    // 删除索引强制走 fallback 全量扫描
    fs.rmSync(indexFilePath(directory, 'project-d'));

    const spy = vi.spyOn(service, 'getSession');
    const items = await service.listSessions('project-d');
    expect(items).toHaveLength(5);
    // 每个会话恰好一次 getSession（skipLlmConfigBackfill=true），无循环内二次放大
    expect(spy).toHaveBeenCalledTimes(5);
    spy.mockRestore();
  });
});
