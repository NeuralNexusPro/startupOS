/**
 * Skill Launcher
 *
 * 启动流程（data/skills/{code}/）：
 * 1. 读取 SKILL.md → 解析 frontmatter + body
 * 2. 提取依赖声明（dependencies / prerequisites），注入系统提示词
 * 3. 构建系统提示词（含依赖安装指引）
 * 4. 创建会话（projectId = `skill-${code}`, agentType = 'skill'）
 * 5. 注册 Agent 到 AgentManager
 * 6. 返回 LaunchResult
 */

import path from 'path';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { Launcher, type LaunchContext, type LaunchResult } from './base';
import { getToolRegistry } from '../../../../lib/integrations/pi-agent/tools/registry';
import { buildPromptMemorySections } from '../../../../lib/integrations/pi-agent/memory-consumption';
import { appendGlobalUserPreferencesPrompt } from '../../../../lib/integrations/pi-agent/user-preferences';
import { getDataRoot } from '../../../paths';
import { getBundledSkillDirs, materializeBundledSkill } from '../../../../lib/integrations/pi-agent/core/skills';
import { ObservationPolicyResolver, readGlobalUserProfileSnapshot } from '../../../../modules/memory-core';

const MAX_TOOL_DESC_CHARS = 120;

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
 * 构建全部系统工具列表（注入 Skill 系统提示词）
 *
 * 所有系统层工具都应该注入 Skill 的 system prompt，不做 agent type scope 过滤。
 */
function buildSkillToolsSection(): string {
  const categoryLabels: Record<string, string> = {
    file: '文件操作',
    system: '系统命令',
    skill: '技能管理',
    ontology: '本体管理',
    graph: '图谱操作',
    url: '网络工具',
    coding: '代码工具',
    document: '文档读取',
  };

  const tools = getToolRegistry().getEnabled();
  const grouped: Record<string, typeof tools> = {};
  for (const tool of tools) {
    const category = tool.category || 'other';
    if (!grouped[category]) grouped[category] = [];
    grouped[category].push(tool);
  }

  const groupBlocks = (Object.entries(grouped) as [string, typeof tools][])
    .filter(([, tools]) => tools.length > 0)
    .map(([category, tools]) => {
      const label = categoryLabels[category] ?? category;
      const toolLines = [...tools]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(t => `- \`${t.name}\`: ${t.description.length > MAX_TOOL_DESC_CHARS ? t.description.slice(0, MAX_TOOL_DESC_CHARS) + '...' : t.description}`)
        .join('\n');
      return `**${label}：**\n${toolLines}`;
    })
    .join('\n\n');

  return `## Available Tools

You have access to the following system tools:

${groupBlocks}`;
}

/**
 * 解析 SKILL.md frontmatter，提取依赖声明
 */
function parseSkillFrontmatter(content: string): {
  dependencies: string[];
  prerequisites: string[];
  name?: string;
  description?: string;
  outputDir?: string;
} {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) return { dependencies: [], prerequisites: [] };

  const yaml = frontmatterMatch[1]!;
  const result: Record<string, unknown> = {};

  // 解析简单的 key: value 对
  for (const match of Array.from(yaml.matchAll(/^(\w+):\s*(.+)$/gm))) {
    const key = match[1]!;
    const rawValue = match[2]!;
    try {
      result[key] = JSON.parse(rawValue);
    } catch {
      result[key] = rawValue;
    }
  }

  // 解析多行 YAML 数组（如 tags:\n  - search\n  - web）
  const arrayPattern = /^(\w+):\s*\n((?:\s+- .+\n?)+)/gm;
  let arrMatch: RegExpExecArray | null;
  while ((arrMatch = arrayPattern.exec(yaml)) !== null) {
    const key = arrMatch[1]!;
    const arrayBlock = arrMatch[2]!;
    result[key] = arrayBlock
      .split('\n')
      .filter(Boolean)
      .map((line) => line.replace(/^\s+-\s+/, '').trim());
  }

  return {
    dependencies: Array.isArray(result['dependencies']) ? result['dependencies'] as string[] : [],
    prerequisites: Array.isArray(result['prerequisites']) ? result['prerequisites'] as string[] : [],
    name: typeof result['name'] === 'string' ? result['name'] : undefined,
    description: typeof result['description'] === 'string' ? result['description'] : undefined,
    outputDir: typeof result['outputDir'] === 'string' ? result['outputDir'] : undefined,
  };
}

/**
 * 构建 Skill 系统提示词（复用 SkillDialog 中的 buildSkillSystemPrompt 逻辑）
 */
function buildSkillSystemPrompt(
  skillName: string,
  skillContent: string,
  agentWorkingDir: string,
  skillSourceDir: string,
  dependencies: string[],
  prerequisites: string[],
  outputDir?: string,
): string {
  const lines: string[] = [];

  // Working directory for bash/file/cognitive writes.
  lines.push(`Working directory for this skill: ${agentWorkingDir}`);
  lines.push('');
  lines.push('All relative paths for bash commands, file tools, and cognitive files are resolved from this writable working directory.');
  lines.push(`Skill source directory: ${skillSourceDir}`);
  lines.push('Use `${CLAUDE_SKILL_DIR}` only when you need to read bundled skill reference files or assets.');
  lines.push('');

  // Output directory (for creating artifacts like agents)
  if (outputDir && outputDir !== agentWorkingDir) {
    lines.push(`Output directory for artifacts: ${outputDir}`);
    lines.push('');
    lines.push('Use `${OUTPUT_DIR}` in shell commands only when you need the native absolute artifact directory.');
    lines.push('When calling file tools, do NOT pass absolute paths. Use runtime data-root paths instead: `data/agents/{agent-id}/...` for Agents and `data/skills/{skill-code}/...` for Skills.');
    lines.push('Legacy short paths `agents/...` and `skills/...` are also mapped to the runtime data root when this skill runs from `data/skills/{skill}`.');
    lines.push('');
  }

  // Skill identity
  const frontmatterMatch = skillContent.match(/^---\n([\s\S]*?)\n---/);
  let displayName = skillName;
  if (frontmatterMatch?.[1]) {
    const nameMatch = frontmatterMatch[1].match(/^name:\s*(.+)$/m);
    if (nameMatch?.[1]) displayName = nameMatch[1].trim();
  }

  const bodyWithoutFrontmatter = frontmatterMatch
    ? skillContent.slice(frontmatterMatch[0].length).trim()
    : skillContent;

  lines.push(`You are ${displayName}.`);
  lines.push('');
  lines.push('## Skill Instructions');
  lines.push(bodyWithoutFrontmatter);

  // === Dependency management section ===
  const allDeps = [...dependencies, ...prerequisites];
  if (allDeps.length > 0) {
    lines.push('');
    lines.push('## Required Dependencies');
    lines.push('This skill requires the following dependencies to be installed before it can function:');
    lines.push('');
    for (const dep of allDeps) {
      lines.push(`- ${dep}`);
    }
    lines.push('');
    lines.push('**IMPORTANT: You MUST check and install these dependencies before executing any skill functionality.**');
    lines.push('');
    lines.push('Follow this process:');
    lines.push('');
    lines.push('### Step 1: Determine dependency type');
    lines.push('For each dependency, determine what type it is:');
    lines.push('- **Python package**: Listed as `pip install xxx`, `import xxx`, or a Python package name (e.g., `duckduckgo-search`, `requests>=2.28`)');
    lines.push('- **npm package**: Listed as `npm install xxx` or a Node.js package name (e.g., `axios`, `lodash`)');
    lines.push('- **System command**: A command-line tool or binary that should be available on the system (e.g., `ffmpeg`, `curl`, `jq`, `python3`)');
    lines.push('');
    lines.push('### Step 2: Check if already installed');
    lines.push('Before installing, always check if the dependency is already available:');
    lines.push('');
    lines.push('- **Python packages**: Use `python3 -c "import package_name"` (replace `-` with `_` in package names)');
    lines.push('- **npm packages**: Check if the package exists in `node_modules/` or use `node -e "require(\'package\')"` (only works if installed locally)');
    lines.push('- **System commands**: Use `command -v command_name` to check if a command is available');
    lines.push('- **npm packages in skill directory**: Use `cd <skill_dir> && ls node_modules/package_name`');
    lines.push('');
    lines.push('### Step 3: Install missing dependencies');
    lines.push('Install only the missing dependencies:');
    lines.push('- **Python packages**: `pip install package-name`');
    lines.push('- **npm packages**: `cd <skill_dir> && npm install package-name`');
    lines.push('- **System commands**: Inform the user that they need to install the system command manually (e.g., `brew install ffmpeg` on macOS, `apt install ffmpeg` on Linux)');
    lines.push('');
    lines.push('### Step 4: Verify installation');
    lines.push('After installation, verify that the dependency is now available using the same check from Step 2.');
  }

  lines.push('');
  lines.push('## How to Execute');
  lines.push('When the user gives a request:');
  lines.push('1. Understand their intent from natural language');
  lines.push('2. Determine the operation type (create, update, query, delete, etc.)');
  lines.push('3. Provide clear, step-by-step progress updates');
  lines.push('4. Deliver the final result in a clear format');
  lines.push('');
  lines.push('Be conversational and helpful! Show progress as you work.');

  lines.push('');
  lines.push('## Available Tools');
  lines.push(buildSkillToolsSection());
  lines.push('');
  lines.push('## Tool Execution Rules');
  lines.push('You have access to the system tools listed above. When a tool name appears in instructions, use that exact tool name to invoke it.');
  lines.push('');
  lines.push('IMPORTANT: When you decide to use a tool, call it directly without asking the user for confirmation.');
  lines.push('The system automatically handles tool execution. Do NOT pause to ask "Do you want me to..." or "Should I..." before calling a tool.');
  lines.push('When you need to inspect files, directories, or command output, prefer calling the relevant tool immediately instead of writing a long explanation first.');
  lines.push('Before a tool call, use at most one short transition sentence. Do NOT restate the same plan, observation, or next step multiple times.');
  lines.push('If the next action is obvious from the current evidence, go straight to the tool call.');
  lines.push('');
  lines.push('Examples:');
  lines.push('- GOOD: User says "save the model" → Immediately call write_file to save it.');
  lines.push('- BAD: User says "save the model" → Ask "Would you like me to save it?" → Wait for confirmation → Then save.');
  lines.push('- GOOD: "I found `manifest.json`; I will read it now." → Immediately call read_file.');
  lines.push('- BAD: Repeat "I found manifest.json, let me read it" several times before calling read_file.');
  lines.push('');
  lines.push('Only ask the user for input when you need information you don\'t already have, not for tool execution approval.');

  lines.push('');
  lines.push('## Network Access');
  lines.push('You are explicitly authorized to make HTTP/HTTPS requests to external services using the execute_command tool.');
  lines.push('Network access to any external service is allowed for fulfilling skill requirements, including:');
  lines.push('- Fetching data from external APIs (e.g., skill market, search services)');
  lines.push('- Downloading files from URLs (e.g., GitHub ZIP, ClawHub packages)');
  lines.push('- Web scraping and content extraction from any domain');
  lines.push('');
  lines.push('## User Communication Rules');
  lines.push('Never expose internal implementation details to the user.');
  lines.push('Do NOT mention file paths, directory paths, or internal technical concepts in your responses.');
  lines.push('Focus on what you are doing and the results, not how it is implemented internally.');

  return appendGlobalUserPreferencesPrompt(lines.join('\n'));
}

function resolveInheritedMemory(agentWorkingDir: string): {
  memory?: string;
  knowledge?: string;
  patterns?: string;
} {
  const readOptional = (fileName: string): string | undefined => {
    const filePath = path.join(agentWorkingDir, fileName);
    if (!existsSync(filePath)) {
      return undefined;
    }
    try {
      const content = readFileSync(filePath, 'utf-8').trim();
      return content.length > 0 ? content : undefined;
    } catch {
      return undefined;
    }
  };

  return {
    memory: readOptional('Memory.md'),
    knowledge: readOptional('Knowledge.md'),
    patterns: readOptional('Patterns.md'),
  };
}

function injectInheritedMemory(
  prompt: string,
  inheritedMemory: { memory?: string; knowledge?: string; patterns?: string },
): string {
  const memorySections = buildPromptMemorySections({
    memoryMd: inheritedMemory.memory,
    knowledgeMd: inheritedMemory.knowledge,
    patternsMd: inheritedMemory.patterns,
    stableMemoryHeading: 'Long-term Stable Memory',
    knowledgeHeading: 'Knowledge Base Snapshot',
    patternsHeading: 'Experience Patterns Snapshot',
  });

  const appendedSections = [
    memorySections.coreMemorySection,
    memorySections.stableMemorySection,
    memorySections.knowledgeSection,
    memorySections.patternsSection,
  ].filter(Boolean).join('\n');

  if (!appendedSections) {
    return prompt;
  }

  return `${prompt}\n\n## Context Memory\n${appendedSections}`;
}

/**
 * 查找 SKILL.md 文件的路径
 */
function findSkillFile(skillCode: string): { skillMdPath: string; baseDir: string } | null {
  const skillDirs = [
    path.join(getDataRoot(), 'skills'),
    path.join(getDataRoot(), '.originos', 'skills'),
    ...getBundledSkillDirs(),
  ];

  // 先尝试精确路径：data/skills/{code}/SKILL.md 或 templates/skills/{code}/SKILL.md
  for (const base of skillDirs) {
    const dir = path.join(base, skillCode);
    const skillMd = path.join(dir, 'SKILL.md');
    if (existsSync(skillMd)) {
      return { skillMdPath: skillMd, baseDir: dir };
    }
  }

  // 再尝试模糊匹配：在所有 skill 目录中搜索
  for (const base of skillDirs) {
    if (!existsSync(base)) continue;
    try {
      const entries = readdirSync(base, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillMd = path.join(base, entry.name, 'SKILL.md');
          if (existsSync(skillMd)) {
            const content = readFileSync(skillMd, 'utf-8');
            const codeMatch = content.match(/^code:\s*(.+)$/m);
            const nameMatch = content.match(/^name:\s*(.+)$/m);
            const code = codeMatch?.[1]?.trim() || entry.name;
            const name = nameMatch?.[1]?.trim() || entry.name;
            if (code === skillCode || name === skillCode) {
              return { skillMdPath: skillMd, baseDir: path.join(base, entry.name) };
            }
          }
        }
      }
    } catch {
      // skip
    }
  }

  return null;
}

export class SkillLauncher extends Launcher {
  readonly entryType = 'skill' as const;

  async launch(ctx: LaunchContext): Promise<LaunchResult> {
    try {
      materializeBundledSkill(ctx.entryId);

      // 1. 查找并读取 SKILL.md
      const skillInfo = findSkillFile(ctx.entryId);
      if (!skillInfo) {
        return {
          success: false,
          sessionId: '',
          systemPrompt: '',
          agentType: 'skill',
          baseDir: '',
          error: `Skill "${ctx.entryId}" not found`,
        };
      }

      const skillMd = readFileSync(skillInfo.skillMdPath, 'utf-8');

      // 2. 解析 frontmatter 提取依赖声明和 outputDir
      const { dependencies, prerequisites, outputDir: frontmatterOutputDir } = parseSkillFrontmatter(skillMd);
      if (dependencies.length > 0 || prerequisites.length > 0) {
        console.log(
          `[SkillLauncher] Skill "${ctx.entryId}" has dependencies:`,
          [...dependencies, ...prerequisites],
        );
      }

      // 3. 构建系统提示词（含依赖安装指引）
      // agentWorkingDir: agent 的工作目录（用于文件操作的相对路径解析）
      // - 有 agentBaseDir 覆盖时（如项目上下文），用它
      // - 独立启动时，用数据目录下的 skill 子目录（可写），
      //   打包后 getMonorepoRoot() 指向只读的 Resources 目录，不能用于写入
      const dataSkillsDir = path.join(getDataRoot(), 'skills', ctx.entryId);
      const agentWorkingDir = ctx.agentBaseDir || dataSkillsDir;
      // outputDir 未声明时默认等于 agentWorkingDir，避免 Windows 打包态
      // ${OUTPUT_DIR} 被替换为空字符串。
      const resolvedOutputDir = frontmatterOutputDir
        ? resolveOutputDirFromFrontmatter(frontmatterOutputDir)
        : agentWorkingDir;
      console.log('[SkillLauncher] resolved paths:', {
        dataRoot: getDataRoot(),
        agentWorkingDir,
        frontmatterOutputDir,
        resolvedOutputDir,
      });

      const systemPrompt = buildSkillSystemPrompt(
        ctx.entryId,
        skillMd,
        agentWorkingDir,
        skillInfo.baseDir,
        dependencies,
        prerequisites,
        resolvedOutputDir,
      );
      const inheritedMemory = resolveInheritedMemory(agentWorkingDir);
      const userProfile = readGlobalUserProfileSnapshot(getDataRoot(), ctx.userId ?? 'default');
      const promptWithUserProfile = userProfile
        ? `${systemPrompt}\n\n<global_user_profile readonly="true">\n${userProfile}\n</global_user_profile>`
        : systemPrompt;
      const resolvedPrompt = injectInheritedMemory(promptWithUserProfile, inheritedMemory)
        .replace(/\$\{CLAUDE_SKILL_DIR\}/g, skillInfo.baseDir)
        .replace(/\$\{OUTPUT_DIR\}/g, resolvedOutputDir ?? '');

      // 4. 创建/恢复会话
      // 如果传入了 projectId 覆盖（如 skill 运行在项目上下文中），用它作为 projectId
      const projectId = ctx.projectId || `skill-${ctx.entryId}`;
      const { sessionId } = await this.createOrRestoreSession({
        projectId,
        projectName: `Skill: ${ctx.entryId}`,
        systemPrompt: resolvedPrompt,
        agentType: 'skill',
        agentBaseDir: agentWorkingDir,
        sessionId: ctx.restoreSessionId || ctx.sessionId,
        llmConfig: ctx.llmConfig,
      });

      const inheritedOwner = ctx.cognitionOwner
        ? {
            scope: ctx.cognitionOwner.kind === 'project' ? 'project' as const : 'agent' as const,
            ownerId: ctx.cognitionOwner.id,
          }
        : undefined;
      const observationContext = new ObservationPolicyResolver().resolve({
        entryType: 'skill',
        sessionId,
        skillId: ctx.entryId,
        callerOwner: inheritedOwner,
        callerMode: ctx.cognitionOwner?.kind === 'project' ? 'project' : ctx.cognitionOwner ? 'role-agent' : undefined,
      });
      const ownerDirectory = ctx.cognitionOwner
        ? path.join(
            getDataRoot(),
            ctx.cognitionOwner.kind === 'project' ? 'projects' : 'agents',
            ctx.cognitionOwner.id,
          )
        : undefined;

      // 5. 注册 Agent 到 AgentManager
      const tools = await this.registerAgent(sessionId, projectId, {
        systemPrompt: resolvedPrompt,
        agentType: 'skill',
        agentBaseDir: agentWorkingDir,
        llmConfig: ctx.llmConfig,
        memoryOwnership: inheritedOwner && ownerDirectory
          ? {
              ownerScope: inheritedOwner.scope,
              ownerId: inheritedOwner.ownerId,
              userId: ctx.userId ?? 'default',
              dataRoot: getDataRoot(),
              ownerDirectory,
            }
          : undefined,
        observationContext: inheritedOwner ? observationContext : undefined,
      });

      return {
        success: true,
        sessionId,
        systemPrompt: resolvedPrompt,
        agentType: 'skill',
        baseDir: agentWorkingDir,
        tools,
      };
    } catch (error) {
      return {
        success: false,
        sessionId: '',
        systemPrompt: '',
        agentType: 'skill',
        baseDir: '',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async loadEntryContent(id: string): Promise<Record<string, string>> {
    materializeBundledSkill(id);

    const skillInfo = findSkillFile(id);
    if (!skillInfo) return {};

    const result: Record<string, string> = {};
    const skillMd = this.readMdFile(skillInfo.baseDir, 'SKILL.md');
    if (skillMd !== null) {
      result['SKILL.md'] = skillMd;
    }

    const toolMd = this.readMdFile(skillInfo.baseDir, 'Tool.md');
    if (toolMd !== null) {
      result['Tool.md'] = toolMd;
    }

    return result;
  }
}
