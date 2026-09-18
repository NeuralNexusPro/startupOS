/**
 * ProjectCollaborationContext + CollaborationPrompt — 单元测试
 *
 * 测试多 Agent 协作上下文加载和 7 层 prompt 构建
 */

import { loadProjectCollaborationContext } from '../project-collaboration-context';
import { loadProjectContext } from '../project-context';
import { buildCollaborationPrompt, assembleCollaborationPrompt, type CollaborativePromptLayers } from '../collaboration-prompt';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs';
import path from 'path';
import os from 'os';

let testDir: string;

beforeEach(() => {
  testDir = path.join(os.tmpdir(), `collab-context-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

// ============================================================================
// Helper: 快速创建 Agent.md
// ============================================================================

function createAgentMd(overrides?: Record<string, string>) {
  const name = overrides?.name ?? '测试Agent';
  const type = overrides?.type ?? 'demand-investigation';
  const body = overrides?.body ?? '负责需求调研分析';
  writeFileSync(path.join(testDir, 'Agent.md'), `---
name: ${name}
type: ${type}
---

# ${name}

${body}`);
}

// ============================================================================
// loadProjectCollaborationContext 测试
// ============================================================================

describe('loadProjectCollaborationContext', () => {
  it('Agent.md 不存在时返回 null', async () => {
    const ctx = await loadProjectCollaborationContext(testDir, 'proj-1', 'agent-1');
    expect(ctx).toBeNull();
  });

  it('仅 Agent.md 存在时，其他字段为空字符串或空数组', async () => {
    createAgentMd();
    const ctx = await loadProjectCollaborationContext(testDir, 'proj-1', 'agent-1');
    expect(ctx).not.toBeNull();
    expect(ctx!.agentMd).toContain('测试Agent');
    expect(ctx!.dataMd).toBe('');
    expect(ctx!.processMd).toBe('');
    expect(ctx!.toolMd).toBeNull();
    expect(ctx!.tasteMd).toBeNull();
    expect(ctx!.memoryMd).toBeNull();
    expect(ctx!.allowedTools).toEqual([]);
    expect(ctx!.installedSkills).toEqual([]);
    expect(ctx!.workingDirectory).toBe(testDir);
    expect(ctx!.projectId).toBe('proj-1');
    expect(ctx!.agentId).toBe('agent-1');
  });

  it('Data.md + Process.md 同时存在时正确加载', async () => {
    createAgentMd();
    writeFileSync(path.join(testDir, 'Data.md'), '## 本体对象\n- 园区\n- 客户');
    writeFileSync(path.join(testDir, 'Process.md'), '## 处理流程\n1. 接收需求\n2. 分析\n3. 输出');

    const ctx = await loadProjectCollaborationContext(testDir, 'proj-1', 'agent-1');
    expect(ctx).not.toBeNull();
    expect(ctx!.dataMd).toContain('本体对象');
    expect(ctx!.processMd).toContain('处理流程');
  });

  it('Tool.md 存在时提取 allowedTools', async () => {
    createAgentMd();
    writeFileSync(path.join(testDir, 'Tool.md'), `---
allowedTools: ['read_file', 'write_file', 'bash']
---

## 工具配置`);

    const ctx = await loadProjectCollaborationContext(testDir, 'proj-1', 'agent-1');
    expect(ctx).not.toBeNull();
    expect(ctx!.allowedTools).toEqual(['read_file', 'write_file', 'bash']);
  });

  it('Taste.md 和 Memory.md 存在时正确加载', async () => {
    createAgentMd();
    writeFileSync(path.join(testDir, 'Taste.md'), '沟通风格：简洁直接');
    writeFileSync(path.join(testDir, 'Memory.md'), '## 历史\n第一轮对话摘要');

    const ctx = await loadProjectCollaborationContext(testDir, 'proj-1', 'agent-1');
    expect(ctx).not.toBeNull();
    expect(ctx!.tasteMd).toContain('简洁直接');
    expect(ctx!.memoryMd).toContain('第一轮对话摘要');
  });

  it('Tool.md 不存在或无 allowedTools 时返回空数组', async () => {
    createAgentMd();
    const ctx = await loadProjectCollaborationContext(testDir, 'proj-1', 'agent-1');
    expect(ctx!.allowedTools).toEqual([]);
  });

  it('Tool.md 有 frontmatter 但无 allowedTools 时返回空数组', async () => {
    createAgentMd();
    writeFileSync(path.join(testDir, 'Tool.md'), `---
other: value
---

工具内容`);

    const ctx = await loadProjectCollaborationContext(testDir, 'proj-1', 'agent-1');
    expect(ctx!.allowedTools).toEqual([]);
  });
});

describe('loadProjectContext', () => {
  it('prefers Memory.md and falls back to MEMORY.md', async () => {
    createAgentMd();
    writeFileSync(path.join(testDir, 'Memory.md'), '## 历史\n来自 Memory.md');
    writeFileSync(path.join(testDir, 'MEMORY.md'), '## 历史\n来自 MEMORY.md');

    const ctx = await loadProjectContext(testDir, 'proj-1', 'agent-1');
    expect(ctx).not.toBeNull();
    expect(ctx!.memoryMd).toContain('来自 Memory.md');
  });

  it('loads legacy MEMORY.md when Memory.md is missing', async () => {
    createAgentMd();
    writeFileSync(path.join(testDir, 'MEMORY.md'), '## 历史\n来自旧文件名');

    const ctx = await loadProjectContext(testDir, 'proj-1', 'agent-1');
    expect(ctx).not.toBeNull();
    expect(ctx!.memoryMd).toContain('来自旧文件名');
  });
});

// ============================================================================
// buildCollaborationPrompt 测试
// ============================================================================

describe('buildCollaborationPrompt', () => {
  function makeCtx(overrides?: Partial<Parameters<typeof loadProjectCollaborationContext>[0] extends never ? never : never>): Parameters<typeof buildCollaborationPrompt>[0] {
    return {
      agentMd: '# Agent\n\n核心职责：测试',
      dataMd: '## Data Contract\n\n本体对象：园区',
      processMd: '## Process\n\n步骤1: 接收',
      toolMd: `---\nallowedTools: ['read_file']\n---\n## Tools`,
      tasteMd: '风格：简洁',
      memoryMd: '历史：已完成调研',
      knowledgeMd: '## 园区调研方法\n\n知识正文不应注入',
      patternsMd: '## 先核对数据再执行\n\n模式正文不应注入',
      installedSkills: [],
      allowedTools: ['read_file'],
      workingDirectory: '/test/dir',
      projectId: 'proj-1',
      agentId: 'agent-1',
    };
  }

  it('生成包含 7 层的完整 prompt', () => {
    const ctx = makeCtx();
    const prompt = buildCollaborationPrompt(ctx);

    expect(prompt).toContain('Role Identity');
    expect(prompt).toContain('Data Contract');
    expect(prompt).toContain('Process Flow');
    expect(prompt).toContain('Collaboration Protocol');
    expect(prompt).toContain('Toolbox');
    expect(prompt).toContain('Working Directory');
    expect(prompt).toContain('数据约束（强制）');
  });

  it('Layer 1 包含 Agent.md 全文', () => {
    const ctx = makeCtx();
    const prompt = buildCollaborationPrompt(ctx);
    expect(prompt).toContain('# Agent');
    expect(prompt).toContain('核心职责：测试');
  });

  it('Layer 2 包含 Data.md 数据契约', () => {
    const ctx = makeCtx();
    const prompt = buildCollaborationPrompt(ctx);
    expect(prompt).toContain('本体对象：园区');
  });

  it('Layer 2 包含统一稳定记忆与快照', () => {
    const ctx = makeCtx();
    const prompt = buildCollaborationPrompt(ctx);
    expect(prompt).toContain('Long-term Stable Memory');
    expect(prompt).toContain('历史：已完成调研');
    expect(prompt).toContain('Knowledge Base Snapshot');
    expect(prompt).toContain('## 园区调研方法');
    expect(prompt).not.toContain('知识正文不应注入');
    expect(prompt).toContain('Experience Patterns Snapshot');
    expect(prompt).toContain('## 先核对数据再执行');
    expect(prompt).not.toContain('模式正文不应注入');
  });

  it('Layer 3 包含 Process.md 处理流程', () => {
    const ctx = makeCtx();
    const prompt = buildCollaborationPrompt(ctx);
    expect(prompt).toContain('步骤1: 接收');
  });

  it('Layer 5 包含 allowedTools 白名单', () => {
    const ctx = makeCtx();
    const prompt = buildCollaborationPrompt(ctx);
    expect(prompt).toContain('read_file');
  });

  it('Layer 6 在 tasteMd 为空时跳过', () => {
    const ctx = makeCtx();
    (ctx as any).tasteMd = null;
    const prompt = buildCollaborationPrompt(ctx);
    expect(prompt).not.toContain('风格：简洁');
  });

  it('Layer 7 包含工作目录', () => {
    const ctx = makeCtx();
    const prompt = buildCollaborationPrompt(ctx);
    expect(prompt).toContain('/test/dir');
  });

  it('Layer 7 包含强制数据约束指令', () => {
    const ctx = makeCtx();
    const prompt = buildCollaborationPrompt(ctx);
    expect(prompt).toContain('执行任何操作前，必须先检查所需数据实例是否存在');
    expect(prompt).toContain('禁止臆造，必须向用户确认');
    expect(prompt).toContain('绝对禁止编造不存在的数据');
  });

  it('extraInstructions 注入到 Layer 7', () => {
    const ctx = makeCtx();
    const prompt = buildCollaborationPrompt(ctx, '额外指令：必须遵守安全规范');
    expect(prompt).toContain('额外指令：必须遵守安全规范');
  });

  it('已安装技能注入到 Layer 5', () => {
    const ctx = makeCtx();
    ctx.installedSkills = [
      {
        name: '需求分析技能',
        description: '分析用户需求并生成结构化报告',
        code: 'demand-analysis',
        path: '/test/.skills/demand-analysis',
        frontmatter: {},
      },
    ];
    const prompt = buildCollaborationPrompt(ctx);
    expect(prompt).toContain('需求分析技能');
    expect(prompt).toContain('分析用户需求并生成结构化报告');
  });

  it('dataMd 为空时 Layer 2 为空', () => {
    const ctx = makeCtx();
    (ctx as any).dataMd = '';
    const prompt = buildCollaborationPrompt(ctx);
    // 空 Layer 被 filter(Boolean) 过滤，不出现标题
    expect(prompt).not.toContain('Data Contract');
  });

  it('processMd 为空时 Layer 3 和 Layer 4 都为空', () => {
    const ctx = makeCtx();
    (ctx as any).processMd = '';
    const prompt = buildCollaborationPrompt(ctx);
    expect(prompt).not.toContain('Process Flow');
    expect(prompt).not.toContain('Collaboration Protocol');
  });
});

// ============================================================================
// extractCollaborationSection 测试（通过 buildCollaborationPrompt 间接测试）
// ============================================================================

describe('Collaboration Protocol 提取', () => {
  it('Process.md 中有协作协议章节时提取该章节', () => {
    const ctx = {
      agentMd: '# Agent',
      dataMd: '',
      processMd: `## 处理流程

步骤1: 接收需求

## 协作协议

### 被触发
- 触发方：用户
- 触发类型：手动

### 触发其他
- 触发目标：项目管理Agent
- 传递数据：调研报告`,
      toolMd: null,
      tasteMd: null,
      memoryMd: null,
      knowledgeMd: null,
      patternsMd: null,
      installedSkills: [],
      allowedTools: [],
      workingDirectory: '/test',
      projectId: 'p1',
      agentId: 'a1',
    };
    const prompt = buildCollaborationPrompt(ctx);
    expect(prompt).toContain('Collaboration Protocol');
    expect(prompt).toContain('触发方：用户');
    expect(prompt).toContain('触发目标：项目管理Agent');
  });

  it('Process.md 中有中文协作章节时能正确提取', () => {
    const ctx = {
      agentMd: '# Agent',
      dataMd: '',
      processMd: `## 处理步骤

正常处理流程...

### 被触发方信息

- 谁触发我：用户点击
- 传递数据：需求文档`,
      toolMd: null,
      tasteMd: null,
      memoryMd: null,
      knowledgeMd: null,
      patternsMd: null,
      installedSkills: [],
      allowedTools: [],
      workingDirectory: '/test',
      projectId: 'p1',
      agentId: 'a1',
    };
    const prompt = buildCollaborationPrompt(ctx);
    expect(prompt).toContain('Collaboration Protocol');
    expect(prompt).toContain('谁触发我');
  });
});

// ============================================================================
// assembleCollaborationPrompt 测试
// ============================================================================

describe('assembleCollaborationPrompt', () => {
  it('按顺序拼接 7 层并用分隔符连接', () => {
    const layers: CollaborativePromptLayers = {
      identity: 'L1',
      stateAndData: 'L2',
      processFlow: 'L3',
      collaborationProtocol: 'L4',
      toolbox: 'L5',
      style: 'L6',
      permissions: 'L7',
    };
    const prompt = assembleCollaborationPrompt(layers);
    expect(prompt).toContain('L1');
    expect(prompt).toContain('L2');
    expect(prompt).toContain('L3');
    expect(prompt).toContain('L4');
    expect(prompt).toContain('L5');
    expect(prompt).toContain('L6');
    expect(prompt).toContain('L7');
    expect(prompt).toContain('---');
  });

  it('空层被过滤掉', () => {
    const layers: CollaborativePromptLayers = {
      identity: 'L1',
      stateAndData: '',
      processFlow: '',
      collaborationProtocol: '',
      toolbox: 'L5',
      style: '',
      permissions: 'L7',
    };
    const prompt = assembleCollaborationPrompt(layers);
    expect(prompt).not.toContain('L2');
    expect(prompt).not.toContain('L3');
    expect(prompt).not.toContain('L4');
    expect(prompt).not.toContain('L6');
  });
});

// ============================================================================
// 完整集成测试：创建临时目录 → 加载上下文 → 构建 prompt
// ============================================================================

describe('集成测试：完整协作 Agent 启动流程', () => {
  it('从文件系统加载并构建完整 prompt', async () => {
    createAgentMd({
      name: '需求调研Agent',
      type: 'demand-investigation',
      body: '负责园区需求调研，包括客户访谈和业务流程分析。',
    });
    writeFileSync(path.join(testDir, 'Data.md'), `## 数据契约

### 可操作本体
- **园区** (name: string, description: string)
  - 操作: read, create
- **客户** (name: string, contact: string)
  - 操作: read, create, update

### Agent 间数据边界
- 需求调研Agent: 独占写入园区、客户
- 项目管理Agent: 只读访问`);

    writeFileSync(path.join(testDir, 'Process.md'), `## 处理流程

### 触发条件
收到用户新的需求调研任务

### 输入数据
- 园区基本信息
- 客户联系方式

### 处理步骤
1. 读取 Data.md 确认数据权限
2. 调用技能进行需求分析
3. 输出调研报告

### 输出数据
- 需求调研报告

## 异常处理
| 异常场景 | 处理策略 |
|---------|---------|
| 数据缺失 | 向用户确认 |
| 权限不足 | 报告错误 |

## 协作协议

### 被触发
- 触发方：用户
- 触发类型：手动启动
- 传递数据：需求描述

### 触发其他
- 触发目标：项目管理Agent
- 触发类型：完成通知
- 传递数据：调研报告`);

    writeFileSync(path.join(testDir, 'Tool.md'), `---
allowedTools: ['read_file', 'write_file', 'bash', 'create_ontology_entity']
---

## 工具

Agent 可使用以下工具完成工作。`);

    writeFileSync(path.join(testDir, 'Taste.md'), `## 沟通风格

- 使用业务语言，避免技术术语
- 一次只问一个问题
- 使用中文`);

    const ctx = await loadProjectCollaborationContext(testDir, 'proj-1', 'demand-agent');
    expect(ctx).not.toBeNull();
    expect(ctx!.agentMd).toContain('需求调研Agent');
    expect(ctx!.dataMd).toContain('数据契约');
    expect(ctx!.processMd).toContain('处理流程');
    expect(ctx!.allowedTools).toEqual(['read_file', 'write_file', 'bash', 'create_ontology_entity']);
    expect(ctx!.tasteMd).toContain('沟通风格');

    const prompt = buildCollaborationPrompt(ctx!);

    // 验证 prompt 结构完整性
    expect(prompt).toContain('Role Identity');
    expect(prompt).toContain('需求调研Agent');
    expect(prompt).toContain('Data Contract');
    expect(prompt).toContain('可操作本体');
    expect(prompt).toContain('Process Flow');
    expect(prompt).toContain('处理步骤');
    expect(prompt).toContain('Collaboration Protocol');
    expect(prompt).toContain('触发方：用户');
    expect(prompt).toContain('触发目标：项目管理Agent');
    expect(prompt).toContain('Toolbox');
    expect(prompt).toContain('read_file');
    expect(prompt).toContain('数据约束（强制）');
    expect(prompt).toContain('禁止臆造');

    // 验证 prompt 长度（确保内容充足）
    expect(prompt.length).toBeGreaterThan(500);
  });
});
