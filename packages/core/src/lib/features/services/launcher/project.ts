/**
 * Project Launcher
 *
 * 启动流程（data/projects/{id}/）：
 * 1. 读取项目 Agent.md / 本体文件
 * 2. 读取 ontology/business-model.json → 注入本体上下文
 * 3. 读取 Tool.md → 注册本体工具集
 * 4. 读取 Memory.md / Taste.md
 * 5. 创建会话（projectId = entryId, agentType = 'project'）
 * 6. 返回 LaunchResult
 */

import path from 'path';
import { Launcher, type LaunchContext, type LaunchResult } from './base';
import { appendGlobalUserPreferencesPrompt } from '../../../../lib/integrations/pi-agent/user-preferences';
import { getDataRoot } from '../../../paths';
import { ObservationPolicyResolver } from '../../../../modules/memory-core';

const PROJECTS_DIR = path.join(getDataRoot(), 'projects');

export class ProjectLauncher extends Launcher {
  readonly entryType = 'project' as const;

  async launch(ctx: LaunchContext): Promise<LaunchResult> {
    try {
      const projectBaseDir = path.join(PROJECTS_DIR, ctx.entryId);

      // 1. 读取入口内容
      const content = await this.loadEntryContent(ctx.entryId);
      const agentMd = content['Agent.md'] || '';

      // 2. 构建系统提示词
      let systemPrompt = agentMd;

      // 注入本体上下文
      if (content['business-model.json']) {
        systemPrompt += '\n\n## 本体上下文\n\n';
        systemPrompt += 'The following business model ontology is loaded:\n\n';
        systemPrompt += '```json\n' + content['business-model.json'] + '\n```\n';
      }

      // 注入 Memory.md
      if (content['Memory.md']) {
        systemPrompt += '\n\n## 历史记忆\n\n' + content['Memory.md'];
      }

      // 注入 Taste.md
      if (content['Taste.md']) {
        systemPrompt += '\n\n## 风格偏好\n\n' + content['Taste.md'];
      }
      systemPrompt = appendGlobalUserPreferencesPrompt(systemPrompt);

      // 3. 创建/恢复会话
      const { sessionId } = await this.createOrRestoreSession({
        projectId: ctx.entryId,
        projectName: ctx.entryId,
        systemPrompt,
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
        systemPrompt,
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
        systemPrompt,
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

    // 读取本体文件
    const ontologyContent = this.readMdFile(
      path.join(projectBaseDir, 'ontology'),
      'business-model.json',
    );
    if (ontologyContent !== null) {
      result['business-model.json'] = ontologyContent;
    }

    return result;
  }
}
