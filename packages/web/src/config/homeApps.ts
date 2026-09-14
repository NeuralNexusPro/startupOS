/**
 * OriginOS 首页应用配置
 *
 * 定义首页展示的所有内置应用卡片，包含点击行为。
 * 统一配置 SKILL_APPS 和 BUILT_IN_APPS。
 */

export type AppCardType = 'skill' | 'action';

export interface HomeAppConfig {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  type: AppCardType;
  // 用于 skill 类型：打开 SkillDialog 的技能名
  skillName?: string;
  // 用于 action 类型：点击触发的操作
  action?: string;
}

/**
 * 首页应用列表配置
 * 顺序决定首页渲染顺序
 */
export const HOME_APPS: HomeAppConfig[] = [
  // --- 创建入口 ---
  {
    id: 'app-create-agent',
    name: '创建 Agent',
    description: '创建智能 Agent，通过对话定义能力和行为',
    icon: '🤖',
    color: 'from-primary',
    type: 'skill',
    skillName: 'agent-creator',
  },
  {
    id: 'app-create-role',
    name: '创建角色',
    description: '从角色模板创建专属的角色 Agent',
    icon: '👤',
    color: 'from-violet-500',
    type: 'skill',
    skillName: 'role-agent-creator',
  },
  {
    id: 'skill-creator',
    name: '创建技能',
    description: '通过对话创建可复用的技能与工作流能力',
    icon: '⚡',
    color: 'from-cyan-500',
    type: 'skill',
    skillName: 'skill-creator-app',
  },
  {
    id: 'app-skill-market',
    name: '技能市场',
    description: '从技能市场搜索并安装新技能',
    icon: '🧩',
    color: 'from-blue-500',
    type: 'skill',
    skillName: 'search-and-install-skill',
  },
  {
    id: 'app-workspace',
    name: '工作区',
    description: '管理项目文件，编辑 Markdown 文档',
    icon: '📝',
    color: 'from-yellow-500',
    type: 'action',
    action: 'open-workspace',
  },
  {
    id: 'app-sense-center',
    name: '感知与连接',
    description: '接收邮箱和企业消息，自动交给 Agent 处理',
    icon: '📡',
    color: 'from-blue-600',
    type: 'action',
    action: 'open-sense-center',
  },
  // --- 系统内置 Skill (SKILL_APPS) ---
  {
    id: 'app-brainstorming',
    name: '头脑风暴',
    description: '使用多种创意技巧进行头脑风暴和创意生成',
    icon: '💡',
    color: 'from-amber-500',
    type: 'skill',
    skillName: 'bmad-brainstorming',
  },
  {
    id: 'app-workflow-builder',
    name: '工作流构建',
    description: '通过对话式流程设计构建和编排业务工作流',
    icon: '🔗',
    color: 'from-emerald-500',
    type: 'skill',
    skillName: 'bmad-workflow-builder',
  },
  // {
  //   id: 'skill-task-manager',
  //   name: '任务助手',
  //   description: '管理项目任务，创建、分配和跟踪任务进度',
  //   icon: '📋',
  //   color: 'from-blue-500',
  //   type: 'skill',
  //   skillName: 'task-manager',
  // },
  // {
  //   id: 'skill-ontology-editor',
  //   name: '本体编辑',
  //   description: '通过对话式界面编辑知识图谱实体和关系',
  //   icon: '🕸️',
  //   color: 'from-purple-500',
  //   type: 'skill',
  //   skillName: 'ontology-editor',
  // },
  // {
  //   id: 'skill-info-query',
  //   name: '信息查询',
  //   description: '通过自然语言查询项目、任务和团队信息',
  //   icon: '🔍',
  //   color: 'from-green-500',
  //   type: 'skill',
  //   skillName: 'info-query',
  // },
];
