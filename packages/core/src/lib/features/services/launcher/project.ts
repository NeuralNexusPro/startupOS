/**
 * Project Launcher
 *
 * 启动流程（data/projects/{id}/）：
 * 1. 读取项目 Agent.md / 本体文件
 * 2. 经 ProjectOntologyEntryService 读取 canonical ontology 状态 → 注入本体上下文
 * 3. 读取 Tool.md → 注册本体工具集
 * 4. 读取 Memory.md / Taste.md
 * 5. 创建会话（projectId = entryId, agentType = 'project'）
 * 6. 返回 LaunchResult
 */

import path from 'path';
import { Launcher, type LaunchContext, type LaunchResult, buildAgentPromptBoundary } from './base';
import { buildProjectLauncherSessionContext, createAgentPromptBoundary } from '../../../../lib/integrations/pi-agent/prompt-boundary';
import { getDataRoot } from '../../../paths';
import { ObservationPolicyResolver } from '../../../../modules/memory-core';
import { ProjectOntologyEntryService } from '../../project';

const PROJECTS_DIR = path.join(getDataRoot(), 'projects');

export class ProjectLauncher extends Launcher {
  readonly entryType = 'project' as const;

  async launch(ctx: LaunchContext): Promise<LaunchResult> {
    try {
      const projectBaseDir = path.join(PROJECTS_DIR, ctx.entryId);

      // 1. 读取入口内容
      const content = await this.loadEntryContent(ctx.entryId);
      const agentMd = content['Agent.md'] || '';
      const ontologyContext = await new ProjectOntologyEntryService(getDataRoot()).resolveProject(ctx.entryId);

      // 2. 构建稳定 prompt 与会话快照
      const stableBoundary = buildAgentPromptBoundary(agentMd, {
        taste: content['Taste.md'],
      });
      const promptBoundary = createAgentPromptBoundary(
        stableBoundary.systemPrompt,
        buildProjectLauncherSessionContext({
          memory: content['Memory.md'],
          baseDir: projectBaseDir,
          ontologyContext,
        }),
      );

      // 3. 创建/恢复会话
      const { sessionId } = await this.createOrRestoreSession({
        projectId: ctx.entryId,
        projectName: ctx.entryId,
        systemPrompt: promptBoundary.systemPrompt,
        agentType: 'project',
        agentBaseDir: projectBaseDir,
        sessionId: ctx.restoreSessionId || ctx.sessionId,
      });
      const observationContext = new ObservationPolicyResolver().resolve({
        entryType: 'project',
        sessionId,
        projectId: ctx.entryId,
      });

      // 4. 注册 Agent 到 AgentManager
      const tools = await this.registerAgent(sessionId, ctx.entryId, {
        systemPrompt: promptBoundary.systemPrompt,
        sessionContext: promptBoundary.sessionContext,
        agentType: 'project',
        agentBaseDir: projectBaseDir,
        isWindowBound: ctx.isWindowBound,
        memoryOwnership: {
          ownerScope: 'project',
          ownerId: ctx.entryId,
          userId: ctx.userId ?? 'default',
          dataRoot: getDataRoot(),
          ownerDirectory: projectBaseDir,
        },
        observationContext,
      });

      return {
        success: true,
        sessionId,
        systemPrompt: promptBoundary.systemPrompt,
        sessionContext: promptBoundary.sessionContext,
        agentType: 'project',
        baseDir: projectBaseDir,
        tools,
      };
    } catch (error) {
      return {
        success: false,
        sessionId: '',
        systemPrompt: '',
        agentType: 'project',
        baseDir: '',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async loadEntryContent(id: string): Promise<Record<string, string>> {
    const projectBaseDir = path.join(PROJECTS_DIR, id);
    const result: Record<string, string> = {};

    for (const file of ['Agent.md', 'Tool.md', 'Memory.md', 'Taste.md']) {
      const content = this.readMdFile(projectBaseDir, file);
      if (content !== null) {
        result[file] = content;
      }
    }

    return result;
  }
}
