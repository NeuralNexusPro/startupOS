/**
 * Skill Eval 自进化模块
 *
 * 轻量级机制：记录技能执行信号，累积到阈值后启动临时 agent session 分析执行历史，
 * 生成 SKILL.md 改进建议，应用后销毁 session。
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { agentManager } from './runtime';
import type { ApiResponse } from '../../../types/api';

// ─── Types ───────────────────────────────────────────────────────────────────

import type { EvolutionRun, EvolutionState, EvolutionResult, SkillEvolutionRequest } from '../../../types/skill-evolution';
export type { EvolutionRun, EvolutionState, EvolutionResult, SkillEvolutionRequest } from '../../../types/skill-evolution';

// ─── Constants ───────────────────────────────────────────────────────────────

const EVOLUTION_FILE = 'evolution.json';
const MIN_RUNS = 10;
const SUCCESS_RATE_THRESHOLD = 0.8; // 低于此值触发进化
const COOLDOWN_HOURS = 24; // 距上次进化至少 24 小时
const EVOLUTION_SESSION_PREFIX = 'skill-evolution';
const MAX_EVOLUTION_DURATION_MS = 60_000; // 60s 超时

// ─── Helpers ─────────────────────────────────────────────────────────────────

export async function readEvolutionState(skillDir: string): Promise<EvolutionState> {
  const filePath = join(skillDir, EVOLUTION_FILE);
  try {
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return { runs: [], version: 1 };
  }
}

async function writeEvolutionState(skillDir: string, state: EvolutionState): Promise<void> {
  const filePath = join(skillDir, EVOLUTION_FILE);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(state, null, 2), 'utf-8');
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * 记录一次技能执行信号
 */
export async function recordRun(skillDir: string, run: EvolutionRun): Promise<void> {
  const state = await readEvolutionState(skillDir);
  state.runs.push(run);
  // 只保留最近 100 条记录
  if (state.runs.length > 100) {
    state.runs = state.runs.slice(-100);
  }
  await writeEvolutionState(skillDir, state);
}

/**
 * 判断是否应该触发进化
 */
export function shouldEvolve(state: EvolutionState): boolean {
  if (state.runs.length < MIN_RUNS) {
    return false;
  }

  // 计算成功率
  const recentRuns = state.runs.slice(-MIN_RUNS);
  const successCount = recentRuns.filter(r => r.success).length;
  const successRate = successCount / recentRuns.length;

  if (successRate >= SUCCESS_RATE_THRESHOLD) {
    return false;
  }

  // 检查冷却时间
  if (state.lastEvolution) {
    const lastEvolutionTime = new Date(state.lastEvolution).getTime();
    const hoursSinceLastEvolution = (Date.now() - lastEvolutionTime) / (1000 * 60 * 60);
    if (hoursSinceLastEvolution < COOLDOWN_HOURS) {
      return false;
    }
  }

  return true;
}

/**
 * 执行进化分析：启动临时 agent session，分析执行历史，生成改进建议
 * 完成后销毁 agent session
 */
export async function runEvolution(skillDir: string, skillName: string): Promise<EvolutionResult> {
  const sessionId = `${EVOLUTION_SESSION_PREFIX}-${skillName}-${Date.now()}`;

  try {
    // 读取技能文件
    const skillMdPath = join(skillDir, 'SKILL.md');
    if (!existsSync(skillMdPath)) {
      return { evolved: false, error: 'SKILL.md not found' };
    }

    const [skillContent, state] = await Promise.all([
      readFile(skillMdPath, 'utf-8'),
      readEvolutionState(skillDir),
    ]);

    // 构建执行历史摘要
    const recentRuns = state.runs.slice(-20);
    const successCount = recentRuns.filter(r => r.success).length;
    const failureRuns = recentRuns.filter(r => !r.success);
    const avgDuration = recentRuns.reduce((sum, r) => sum + r.duration, 0) / recentRuns.length;

    const historySummary = [
      `总执行次数: ${state.runs.length}`,
      `最近 ${recentRuns.length} 次成功率: ${((successCount / recentRuns.length) * 100).toFixed(1)}%`,
      `平均响应时间: ${(avgDuration / 1000).toFixed(1)}s`,
      `失败次数: ${failureRuns.length}`,
      failureRuns.length > 0
        ? `最近失败原因: ${failureRuns.slice(-3).map(r => r.error || 'unknown').join('; ')}`
        : '',
    ].filter(Boolean).join('\n');

    // 构建进化分析 prompt
    const analysisPrompt = `你是一个技能优化专家。请分析以下技能的执行历史和当前定义，给出改进建议。

## 当前技能定义 (SKILL.md)

${skillContent}

## 执行历史摘要

${historySummary}

## 你的任务

1. 分析失败模式：哪些步骤容易出错？参数类型问题？触发条件不清晰？
2. 优化触发场景：description 是否准确描述了技能用途？是否会被误触发？
3. 改进执行步骤：哪些步骤需要更明确的指令？哪些可以简化？

## 输出格式

请用以下 JSON 格式输出改进建议（不要输出其他内容）：

\`\`\`json
{
  "shouldImprove": true,
  "changes": [
    {
      "type": "description",
      "content": "改进后的 description 文本"
    },
    {
      "type": "step",
      "target": "Step N 标题",
      "content": "改进后的步骤内容"
    },
    {
      "type": "add_step",
      "after": "Step N 标题",
      "content": "新增步骤的完整内容"
    }
  ],
  "reason": "改进原因说明"
}

\`\`\`

如果不需要改进，输出：
\`\`\`json
{
  "shouldImprove": false,
  "reason": "无需改进的原因"
}
\`\`\``;

    // 创建临时 agent session（后台、无 UI）
    const agent = await agentManager.getOrCreateAgent(
      sessionId,
      `skill-evolution-${skillName}`,
      {
        systemPrompt: '你是一个技能优化分析助手。根据用户提供的技能执行历史和定义，分析问题并给出具体的改进建议。只输出 JSON 格式的结果，不要输出其他内容。',
        agentType: 'skill',
      }
    );

    // 发送分析请求并收集响应
    let responseContent = '';

    const unsubscribe = agent.subscribe((event: { type: string; [key: string]: unknown }) => {
      if (event.type === 'message_end') {
        const msg = event['message'] as { role?: string; content?: unknown } | undefined;
        if (msg?.role === 'assistant' && msg.content) {
          if (typeof msg.content === 'string') {
            responseContent = msg.content;
          } else if (Array.isArray(msg.content)) {
            const textBlock = msg.content.find(
              (b: unknown) => b && typeof b === 'object' && (b as { type?: string }).type === 'text'
            );
            if (textBlock) {
              responseContent = (textBlock as { text: string }).text;
            }
          }
        }
      }
    });

    // 设置超时
    const timeoutPromise = new Promise<void>((_, reject) => {
      setTimeout(() => reject(new Error('Evolution analysis timeout')), MAX_EVOLUTION_DURATION_MS);
    });

    try {
      await Promise.race([
        agent.prompt(analysisPrompt),
        timeoutPromise,
      ]);
    } catch (err) {
      unsubscribe();
      agentManager.removeAgent(sessionId);
      return {
        evolved: false,
        error: err instanceof Error ? err.message : 'Evolution analysis failed',
      };
    }

    unsubscribe();

    // 解析 LLM 响应
    if (!responseContent) {
      agentManager.removeAgent(sessionId);
      return { evolved: false, error: 'No response from evolution agent' };
    }

    let improvements: {
      shouldImprove: boolean;
      changes?: Array<{ type: string; target?: string; after?: string; content: string }>;
      reason?: string;
    };

    try {
      // 从响应中提取 JSON
      const jsonMatch = responseContent.match(/```json\s*([\s\S]*?)```/);
      const jsonStr = (jsonMatch?.[1] ?? responseContent).trim();
      improvements = JSON.parse(jsonStr);
    } catch {
      agentManager.removeAgent(sessionId);
      return { evolved: false, error: 'Failed to parse evolution response' };
    }

    // 销毁临时 agent session
    agentManager.removeAgent(sessionId);

    if (!improvements.shouldImprove || !improvements.changes || improvements.changes.length === 0) {
      // 更新 lastEvolution 时间戳
      state.lastEvolution = new Date().toISOString();
      await writeEvolutionState(skillDir, state);
      return { evolved: false };
    }

    // 应用改进到 SKILL.md
    const appliedChanges = await applyImprovements(skillMdPath, skillContent, improvements.changes);

    // 更新进化状态
    state.lastEvolution = new Date().toISOString();
    await writeEvolutionState(skillDir, state);

    return {
      evolved: appliedChanges.length > 0,
      changes: appliedChanges,
    };
  } catch (err) {
    // 确保清理临时 session
    try { agentManager.removeAgent(sessionId); } catch { /* ignore */ }
    return {
      evolved: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Shared transport-agnostic handler for HTTP routes and Electron IPC handlers.
 */
export async function handleSkillEvolution(
  request: SkillEvolutionRequest
): Promise<{ status: number; response: ApiResponse<EvolutionResult> }> {
  const { skillDir, skillName, run } = request;
  const timestamp = new Date().toISOString();

  if (!skillDir || !skillName || !run) {
    return {
      status: 400,
      response: {
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'skillDir, skillName, and run are required',
        },
        timestamp,
      },
    };
  }

  await recordRun(skillDir, run);

  const state = await readEvolutionState(skillDir);
  if (!shouldEvolve(state)) {
    return {
      status: 200,
      response: {
        success: true,
        data: { evolved: false },
        timestamp,
      },
    };
  }

  console.log(`[SkillEvolution] Triggering evolution for skill: ${skillName}`);
  const result = await runEvolution(skillDir, skillName);

  if (result.evolved) {
    console.log(`[SkillEvolution] Skill "${skillName}" evolved. Changes:`, result.changes);
  } else if (result.error) {
    console.warn(`[SkillEvolution] Evolution failed for "${skillName}":`, result.error);
  }

  return {
    status: 200,
    response: {
      success: true,
      data: result,
      timestamp,
    },
  };
}

// ─── Improvement Application ─────────────────────────────────────────────────

/**
 * 将 LLM 生成的改进应用到 SKILL.md
 */
async function applyImprovements(
  skillMdPath: string,
  currentContent: string,
  changes: Array<{ type: string; target?: string; after?: string; content: string }>
): Promise<string[]> {
  let updatedContent = currentContent;
  const appliedChanges: string[] = [];

  for (const change of changes) {
    switch (change.type) {
      case 'description': {
        // 替换 frontmatter 中的 description 字段
        const descRegex = /(^description:\s*)(.+)$/m;
        if (descRegex.test(updatedContent)) {
          updatedContent = updatedContent.replace(descRegex, `$1${change.content}`);
          appliedChanges.push(`Updated description`);
        }
        break;
      }
      case 'step': {
        // 替换指定步骤的内容
        if (change.target) {
          const stepHeaderRegex = new RegExp(
            `(###\\s*${escapeRegex(change.target)}\\s*\\n)([\\s\\S]*?)(?=###\\s|$)`,
            'm'
          );
          const match = updatedContent.match(stepHeaderRegex);
          if (match) {
            updatedContent = updatedContent.replace(
              stepHeaderRegex,
              `$1${change.content}\n\n`
            );
            appliedChanges.push(`Updated step: ${change.target}`);
          }
        }
        break;
      }
      case 'add_step': {
        // 在指定步骤后添加新步骤
        if (change.after) {
          const afterStepRegex = new RegExp(
            `(###\\s*${escapeRegex(change.after)}\\s*\\n[\\s\\S]*?)(?=###\\s|$)`,
            'm'
          );
          const match = updatedContent.match(afterStepRegex);
          if (match) {
            updatedContent = updatedContent.replace(
              afterStepRegex,
              `${match[0].trimEnd()}\n\n${change.content}\n\n`
            );
            appliedChanges.push(`Added step after: ${change.after}`);
          }
        }
        break;
      }
    }
  }

  // 只有实际发生了变更才写文件
  if (appliedChanges.length > 0 && updatedContent !== currentContent) {
    await writeFile(skillMdPath, updatedContent, 'utf-8');
  }

  return appliedChanges;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
