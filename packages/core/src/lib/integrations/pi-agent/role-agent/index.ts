/**
 * RoleAgent 模块导出
 */

// R.1: 角色上下文加载器
export { loadRoleContext, parseToolMdTools, scanInstalledSkills, type RoleContext, type SkillInfo } from './role-context';

// R.2: 状态机解析与推进
export {
  parseStateMachine,
  determinePhase,
  checkTransition,
  applyTransition,
  type RolePhase,
  type TransitionRule,
  type StateMachine,
  type TransitionResult,
} from './state-machine';

// R.3: 技能扫描器（内部由 skill-resolver 提供，role-context 已 re-export）
export { scanInstalledSkills as scanInstalledSkillsDirect } from './skill-resolver';

// R.4: 分层 System Prompt 构建器
export { buildRoleSystemPrompt, buildSkillMarkdown } from './system-prompt';

// R.7: Consolidator (reserved)
export { Consolidator, type ConsolidatorConfig, CONSOLIDATOR_ARCHIVE_PROMPT } from './consolidator';
