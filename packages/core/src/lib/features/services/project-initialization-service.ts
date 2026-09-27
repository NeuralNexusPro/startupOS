/**
 * Project Initialization Service
 *
 * 负责创建完整的项目文件系统结构，包括：
 * - 标准目录结构（reference/, skills/, output/, sessions/）
 * - AGENT.md 配置文件
 * - 业务模型保存
 * - 技能文件复制
 * - Agent 会话初始化
 */

import { mkdir, writeFile, copyFile, cp } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { agentSessionService } from '../../../lib/features/agent';
import type { Project } from '../../../types/project';
import { type CanonicalOntology, type CanonicalSourceReference } from '../ontology';
import { ProjectOntologyEntryService } from '../project';

// ============================================================================
// Types
// ============================================================================

export interface BusinessModel {
  projectName: string;
  industry: string;
  background: string;
  scenarios?: Array<{
    name: string;
    description: string;
  }>;
  entities: Array<{
    name: string;
    definition: string;
    properties?: Record<string, unknown>;
    lifecycle?: {
      states: string[];
      transitions: Record<string, string>;
    };
  }>;
  relationships: Array<{
    from: string;
    to: string;
    type: string;
    cardinality: string;
    required?: boolean;
  }>;
  businessRules: Array<{
    name: string;
    description: string;
    condition?: string;
    action?: string;
    exception?: string;
  }>;
  constraints?: Array<{
    target: string;
    type: string;
    rule: string;
  }>;
}

export interface InitializeProjectParams {
  businessModel: BusinessModel;
  skillsToInclude?: string[];
  userId?: string;
}

export interface InitializeProjectResult {
  project: Project;
  agentSessionId: string;
  projectPath: string;
}

// ============================================================================
// Configuration
// ============================================================================

import { getDataRoot } from '../../paths';

const DATA_DIR = path.join(getDataRoot(), 'projects');
const SKILLS_SOURCE_DIR = path.join(getDataRoot(), 'skills');

// ============================================================================
// Helper Functions
// ============================================================================

function getProjectPath(projectId: string): string {
  return path.join(DATA_DIR, projectId);
}

function generateProjectId(): string {
  return `proj-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function generateRandomColor(): string {
  const colors = [
    'from-blue-500', 'from-purple-500', 'from-teal-500',
    'from-yellow-500', 'from-pink-500', 'from-indigo-500',
    'from-red-500', 'from-orange-500',
  ];
  return colors[Math.floor(Math.random() * colors.length)] || 'from-blue-500';
}

/**
 * 生成项目标题
 */
function generateProjectTitle(businessModel: BusinessModel): string {
  if (businessModel.projectName) {
    return businessModel.projectName;
  }

  const mainEntity = businessModel.entities[0]?.name || '业务';
  return `${businessModel.industry} - ${mainEntity}管理系统`;
}

/**
 * 生成 AGENT.md 内容
 */
function generateAgentMd(businessModel: BusinessModel, projectId: string): string {
  const projectName = generateProjectTitle(businessModel);

  // 格式化实体列表
  const entitiesList = businessModel.entities
    .map(e => `- **${e.name}**: ${e.definition}`)
    .join('\n');

  // 格式化业务规则列表
  const rulesList = businessModel.businessRules
    .map((r, i) => `${i + 1}. **${r.name}**: ${r.description}`)
    .join('\n');

  return `# ${projectName} - Agent 行为规则

## 项目概述

**项目ID**: ${projectId}
**行业**: ${businessModel.industry}
**背景**: ${businessModel.background}

## 项目目录结构

- \`reference/\` - 参考文件和知识库，包含业务模型、领域知识
- \`skills/\` - 项目技能，定义 Agent 可执行的操作
- \`output/\` - Agent 输出文件，所有生成的内容都应放在这里
- \`sessions/\` - 会话历史记录

## Agent 行为规则

### 文件生成规则

1. **输出位置** - 所有生成的文件必须放在 \`output/\` 目录下
   - 文档 → \`output/documents/\`
   - 图表 → \`output/diagrams/\`
   - 代码 → \`output/code/\`

2. **文件命名** - 使用描述性名称，包含日期时间戳
   - 格式: \`{type}-{description}-{timestamp}.{ext}\`
   - 示例: \`doc-user-journey-20260408.md\`

3. **引用规则** - 引用项目文件时使用相对路径
   - canonical ontology：使用 \`query_ontology\` 按项目绑定的 ID/version 查询
   - 技能文档: \`../skills/{skill-name}/SKILL.md\`

### 知识库使用

1. **canonical ontology**
   - 包含完整的业务实体、关系、规则
   - 生成内容时必须通过本体工具按项目绑定的精确 ID/version 查询

2. **领域知识** (\`reference/domain-knowledge.md\`)
   - 行业特定的术语、概念、最佳实践
   - 确保生成内容符合行业规范

### 技能执行

1. **可用技能** - 查看 \`skills/\` 目录了解可用技能
2. **技能调用** - 按照 SKILL.md 中的指示执行
3. **技能扩展** - 可以建议添加新技能到项目

## 业务实体

${entitiesList}

## 业务规则

${rulesList}

## 注意事项

- 始终保持输出文件的组织性
- 生成内容前检查 reference/ 中的业务模型
- 遵循项目的命名和结构约定
- 记录重要决策和变更

---

**创建时间**: ${new Date().toISOString()}
**项目类型**: ${businessModel.industry}
`;
}

/**
 * 生成领域知识文档
 */
function generateDomainKnowledge(businessModel: BusinessModel): string {
  return `# ${businessModel.industry} - 领域知识

## 行业背景

${businessModel.background}

## 核心概念

${businessModel.entities.map(e => `### ${e.name}\n\n${e.definition}\n`).join('\n')}

## 业务场景

${businessModel.scenarios?.map(s => `### ${s.name}\n\n${s.description}\n`).join('\n') || '暂无场景描述'}

## 业务规则

${businessModel.businessRules.map(r => `### ${r.name}\n\n${r.description}\n\n${r.condition ? `**触发条件**: ${r.condition}\n` : ''}${r.action ? `**执行动作**: ${r.action}\n` : ''}${r.exception ? `**例外处理**: ${r.exception}\n` : ''}`).join('\n')}

---

**生成时间**: ${new Date().toISOString()}
`;
}

/**
 * 生成 Taste.md（风格指南）
 */
function generateTasteMd(businessModel: BusinessModel): string {
  return `# ${generateProjectTitle(businessModel)} - 风格指南

## 专业语言

- 使用 ${businessModel.industry} 领域的专业术语
- 保持表达准确、简洁
- 避免模糊或歧义的表述

## 沟通风格

- 结构化表达，使用标题和列表
- 先总结后展开
- 重要信息用 **粗体** 标注

## 输出规范

- 文档使用 Markdown 格式
- 包含必要的上下文和背景信息
- 保持一致的命名约定

---

**创建时间**: ${new Date().toISOString()}
`;
}

function canonicalOntologyFromBusinessModel(projectId: string, businessModel: BusinessModel): CanonicalOntology {
  const now = new Date();
  const sourceRef: CanonicalSourceReference = {
    sourceType: 'interview',
    sourceId: `project-initialization:${projectId}`,
    sourceVersion: '1.0.0',
  };
  const domainId = 'domain_primary';
  const concepts = businessModel.entities.map((entity, index) => ({
    id: `concept_${index + 1}`,
    domainId,
    name: entity.name,
    type: 'entity',
    attributes: entity.properties ?? {},
    description: entity.definition,
    sourceRefs: [sourceRef],
    createdAt: now,
    updatedAt: now,
  }));
  const conceptIdByName = new Map(businessModel.entities.map((entity, index) => [entity.name, `concept_${index + 1}`]));
  const relations: CanonicalOntology['relations'] = [];
  for (const [index, relation] of businessModel.relationships.entries()) {
    const sourceConceptId = conceptIdByName.get(relation.from);
    const targetConceptId = conceptIdByName.get(relation.to);
    if (!sourceConceptId || !targetConceptId) continue;
    relations.push({
      id: `relation_${index + 1}`,
      name: relation.type,
      sourceConceptId,
      targetConceptId,
      cardinality: relation.cardinality === 'one-to-one'
        || relation.cardinality === 'one-to-many'
        || relation.cardinality === 'many-to-one'
        || relation.cardinality === 'many-to-many'
        ? relation.cardinality
        : 'many-to-many',
      description: relation.required ? 'required' : undefined,
    });
  }

  return {
    id: `ontology_${projectId}`,
    projectId,
    name: generateProjectTitle(businessModel),
    schemaVersion: '1.0.0',
    version: '1.0.0',
    domains: [{
      id: domainId,
      name: businessModel.industry || 'general',
      description: businessModel.background,
      createdAt: now,
      updatedAt: now,
    }],
    concepts,
    instances: [],
    properties: [],
    relations,
    businessStates: [],
    transitions: [],
    factTypes: [],
    rules: [],
    actions: [],
    events: [],
    projections: [],
    sourceRefs: [sourceRef],
    metadata: { source: 'project-initialization' },
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 生成 Tool.md（工具配置）
 */
function generateToolMd(): string {
  return `---
toolsVersion: 1.0.0
allowedTools: ["read_file", "write_file", "edit_file", "list_files", "delete_file", "read_document", "read_spreadsheet", "list_document_structure", "extract_document_tables", "execute_command", "query_ontology", "create_domain", "create_concept", "search_ontology", "get_current_time"]
---

# Tool 使用指南

## 可用工具

### 文件操作
- **read_file** - 读取文件内容
- **write_file** - 创建或写入文件
- **edit_file** - 编辑现有文件
- **list_files** - 列出目录内容
- **delete_file** - 删除文件

### 文档读取
- **read_document** - 读取 Word/Markdown/Text 文档，支持分页
- **read_spreadsheet** - 读取 Excel/CSV 表格，支持工作表和行分页
- **list_document_structure** - 查看文档章节、表格、sheet、行列规模
- **extract_document_tables** - 提取 Word/Excel/CSV 中的表格

### 本体操作
- **query_ontology** - 查询本体数据
- **create_domain** - 创建领域
- **create_concept** - 创建概念
- **search_ontology** - 搜索本体

### 系统工具
- **execute_command** - 执行命令
- **get_current_time** - 获取当前时间

## 工作流技能

项目初始化时会自动把三个访谈阶段技能复制到当前项目的 \`skills/\` 目录。每次回复前根据当前阶段读取对应技能文件，按其指引推进对话和文件写入。

- **Phase 1 领域发现** - \`skills/domain-discovery/SKILL.md\`
- **Phase 2 业务精炼** - \`skills/business-refinement/SKILL.md\`
- **Phase 3 模型审阅** - \`skills/model-review/SKILL.md\`

---

**创建时间**: ${new Date().toISOString()}
`;
}

// ============================================================================
// Project Initialization Service
// ============================================================================

export const projectInitializationService = {
  /**
   * 初始化项目
   */
  async initializeProject(params: InitializeProjectParams): Promise<InitializeProjectResult> {
    const { businessModel, skillsToInclude = ['project-initialization'], userId = 'current-user' } = params;

    // 1. 生成项目 ID 和基本信息
    const projectId = generateProjectId();
    const projectName = generateProjectTitle(businessModel);
    const projectPath = getProjectPath(projectId);

    console.log('[ProjectInit] Starting initialization:', { projectId, projectName, projectPath });

    try {
      // 2. 创建项目目录结构
      await this.createProjectStructure(projectId);
      console.log('[ProjectInit] Directory structure created');

      const ontologyEntry = new ProjectOntologyEntryService(getDataRoot());
      const canonicalOntology = canonicalOntologyFromBusinessModel(projectId, businessModel);
      const ontologyRef = await ontologyEntry.initializeCanonicalOntology(projectId, canonicalOntology);
      console.log('[ProjectInit] Canonical ontology initialized');

      // 3. 生成并保存 Agent.md
      const agentMdContent = generateAgentMd(businessModel, projectId);
      await writeFile(
        path.join(projectPath, 'Agent.md'),
        agentMdContent,
        'utf-8'
      );
      console.log('[ProjectInit] Agent.md generated');

      // 3.1 生成 Taste.md（风格指南）
      const tasteMdContent = generateTasteMd(businessModel);
      await writeFile(
        path.join(projectPath, 'Taste.md'),
        tasteMdContent,
        'utf-8'
      );
      console.log('[ProjectInit] Taste.md generated');

      // 3.2 生成 Tool.md（工具配置）
      const toolMdContent = generateToolMd();
      await writeFile(
        path.join(projectPath, 'Tool.md'),
        toolMdContent,
        'utf-8'
      );
      console.log('[ProjectInit] Tool.md generated');

      // 4. 生成领域知识文档
      const domainKnowledge = generateDomainKnowledge(businessModel);
      await writeFile(
        path.join(projectPath, 'reference', 'domain-knowledge.md'),
        domainKnowledge,
        'utf-8'
      );
      console.log('[ProjectInit] Domain knowledge generated');

      // 5. 复制技能文件
      await this.copySkillsToProject(projectId, skillsToInclude);
      console.log('[ProjectInit] Skills copied');

      // 6. 初始化 Agent 会话（在保存项目元数据之前）
      const agentSessionId = await this.initializeAgentSession(
        projectId,
        projectName,
        agentMdContent,
        projectPath
      );
      console.log('[ProjectInit] Agent session initialized:', agentSessionId);

      // 7. 创建项目元数据（包含 agentSessionId）
      const now = Date.now();
      const project: Project = {
        id: projectId,
        name: projectName,
        description: businessModel.background,
        domain: businessModel.industry,
        type: 'canonical-ontology',
        ontologyId: ontologyRef.ontologyId,
        createdAt: now,
        updatedAt: now,
        lastModified: now,
        userId,
        status: 'active',
        color: generateRandomColor(),
        metadata: {
          ontologyRef: {
            ontologyId: ontologyRef.ontologyId,
            ontologyVersion: ontologyRef.ontologyVersion,
          },
          businessModelSummary: JSON.stringify({
            entityCount: businessModel.entities.length,
            relationshipCount: businessModel.relationships.length,
            ruleCount: businessModel.businessRules.length,
          }),
          skillsList: skillsToInclude.join(','),
          agentSessionId, // 保存 Agent 会话 ID
        },
      };

      // 保存项目元数据
      await writeFile(
        path.join(projectPath, 'project.json'),
        JSON.stringify(project, null, 2),
        'utf-8'
      );
      console.log('[ProjectInit] Project metadata saved');

      return {
        project,
        agentSessionId,
        projectPath,
      };
    } catch (error) {
      console.error('[ProjectInit] Initialization failed:', error);
      // TODO: 实现回滚逻辑
      throw error;
    }
  },

  /**
   * 创建项目目录结构
   */
  async createProjectStructure(projectId: string): Promise<void> {
    const projectPath = getProjectPath(projectId);

    // 创建主目录
    await mkdir(projectPath, { recursive: true });

    // 创建子目录
    const subdirs = [
      'reference',
      'skills',
      'output',
      'output/documents',
      'output/diagrams',
      'output/code',
      'sessions',
    ];

    for (const subdir of subdirs) {
      await mkdir(path.join(projectPath, subdir), { recursive: true });
    }
  },

  /**
   * 复制技能到项目目录
   */
  async copySkillsToProject(projectId: string, skillNames: string[]): Promise<void> {
    const projectPath = getProjectPath(projectId);
    const targetSkillsDir = path.join(projectPath, 'skills');

    for (const skillName of skillNames) {
      const sourceSkillDir = path.join(SKILLS_SOURCE_DIR, skillName);
      const targetSkillDir = path.join(targetSkillsDir, skillName);

      // 检查源技能目录是否存在
      if (!existsSync(sourceSkillDir)) {
        console.warn(`[ProjectInit] Skill not found: ${skillName}, skipping`);
        continue;
      }

      // 创建目标技能目录
      await mkdir(targetSkillDir, { recursive: true });

      // 复制 SKILL.md
      const skillMdPath = path.join(sourceSkillDir, 'SKILL.md');
      if (existsSync(skillMdPath)) {
        await copyFile(
          skillMdPath,
          path.join(targetSkillDir, 'SKILL.md')
        );
      }

      // 复制 references/ 目录（如果存在）
      const referencesDir = path.join(sourceSkillDir, 'references');
      if (existsSync(referencesDir)) {
        await cp(
          referencesDir,
          path.join(targetSkillDir, 'references'),
          { recursive: true }
        );
      }

      console.log(`[ProjectInit] Copied skill: ${skillName}`);
    }
  },

  /**
   * 初始化 Agent 会话
   */
  async initializeAgentSession(
    projectId: string,
    projectName: string,
    agentMdContent: string,
    _projectPath: string
  ): Promise<string> {
    // 创建会话
    const session = await agentSessionService.createSession({
      projectId,
      projectName,
      systemPrompt: agentMdContent,
      agentType: 'project-agent',
    });

    // TODO: 配置项目上下文（需要扩展 AgentSession 类型）
    // session.metadata = {
    //   ...session.metadata,
    //   workingDirectory: _projectPath,
    //   outputDirectory: path.join(_projectPath, 'output'),
    //   referenceDirectory: path.join(_projectPath, 'reference'),
    //   skillsDirectory: path.join(_projectPath, 'skills'),
    // };

    return session.sessionId;
  },
};
