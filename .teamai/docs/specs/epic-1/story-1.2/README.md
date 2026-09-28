# Story 1.2: pi-agent Skill 加载与路由

**Story 编号:** 1.2
**Epic:** Epic 1 - 项目初始化 Skill
**状态:** 🔄 In Progress
**负责人:** -
**最后更新:** 2026-03-20

---

## 📋 Story 描述

作为系统，
我需要实现 pi-agent-core 的 Skill 加载与路由机制，
以便能够正确加载 project-initialization 复合 Skill 并处理用户请求。

---

## 🎯 验收标准

### AC1.2.1: Skill Registry
- [ ] 实现 `SkillRegistry` 接口
- [ ] 能够注册技能
- [ ] 能够获取技能
- [ ] 能够列出所有技能
- [ ] 能够检查技能是否存在

### AC1.2.2: Skill Router
- [ ] 实现 `SkillRouter` 接口
- [ ] 实现基于条件的路由规则
- [ ] 支持优先级路由
- [ ] 默认路由到 generic skill

### AC1.2.3: Skill Executor
- [ ] 实现 `SkillExecutor` 类
- [ ] 正确注入工具上下文
- [ ] 处理技能执行错误
- [ ] 返回标准技能结果

### AC1.2.4: Skill Loader
- [ ] 创建 `project-initialization` skill 的加载器
- [ ] 实现 skill handler
- [ ] 自动注册到 registry

### AC1.2.5: Type Definitions
- [ ] 定义所有 skill 相关类型
- [ ] 定义工具调用结果类型
- [ ] 定义 agent 执行结果类型

### AC1.2.6: 集成测试
- [ ] 测试 skill 注册
- [ ] 测试 skill 路由
- [ ] 测试 skill 执行
- [ ] 测试 project-initialization skill 加载

---

## 📁 文件清单

| 文件 | 状态 | 说明 |
|-----|------|------|
| `src/types/skill.ts` | ✅ Created | Skill 系统类型定义 |
| `src/lib/skills/registry.ts` | ✅ Created | Skill registry 和路由 |
| `src/lib/skills/executor.ts` | ✅ Created | Skill 执行器 |
| `src/lib/skills/project-initialization/loader.ts` | ✅ Created | Skill 加载器 |
| `src/lib/features/agent/index.ts` | ✅ Updated | 导出 skill API |

---

## 🏗️ 架构设计

### Skill 系统架构

```
┌─────────────────────────────────────────────────────────┐
│                    User Interface                        │
│  ┌───────────────────────────────────────────────────┐ │
│  │  Create Project Button                          │ │
│  └─────────────────┬─────────────────────────────────┘ │
└────────────────────┼────────────────────────────────────┘
                     │ Call API
                     ↓
┌─────────────────────────────────────────────────────────┐
│                    API Layer                            │
│  POST /api/projects/init                                │
└────────────────────┼────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────┐
│              Skill System Layer                          │
│  ┌───────────────────────────────────────────────────┐ │
│  │  Skill Router (determine which skill to use)      │ │
│  │  - Routes based on agentType, intent, message   │ │
│  └─────────────────┬─────────────────────────────────┘ │
│                    ↓                                    │
│  ┌───────────────────────────────────────────────────┐ │
│  │  Skill Registry (manage loaded skills)           │ │
│  │  - project-initialization (COMPOSITE)            │ │
│  │  - ontology (SIMPLE)                            │ │
│  │  - generic (fallback)                           │ │
│  └─────────────────┬─────────────────────────────────┘ │
│                    ↓                                    │
│  ┌───────────────────────────────────────────────────┐ │
│  │  Skill Executor (execute with tools)             │ │
│  │  - Inject tool context                          │ │
│  │  - Handle errors                                │ │
│  └─────────────────┬─────────────────────────────────┘ │
│                    ↓                                    │
│  ┌───────────────────────────────────────────────────┐ │
│  │  Loaded Skill (project-initialization)           │ │
│  │  handler(context) -> SkillResult                 │ │
│  └───────────────────────────────────────────────────┘ │
└────────────────────┼────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────┐
│                    Tool Context                         │
│  - createEntity (Ontology API)                         │
│  - updateEntity (Ontology API)                         │
│  - createRelation (Ontology API)                       │
│  - queryEntities (Ontology API)                        │
│  - getRelated (Ontology API)                           │
└─────────────────────────────────────────────────────────┘
```

---

## 📝 实现日志

### 2026-03-20

**已完成:**
- ✅ 创建 `src/types/skill.ts` - 完整的 Skill 系统类型定义
  - `SkillType`, `SkillMetadata` 枚举和接口
  - `SkillContext`, `SkillResult` 接口
  - `SkillTools` 接口
  - `SkillRegistry`, `SkillRouter` 接口
- ✅ 创建 `src/lib/skills/registry.ts` - Registry 和路由实现
  - `DefaultSkillRegistry` 类
  - `DefaultSkillRouter` 类
  - 默认路由规则
- ✅ 创建 `src/lib/skills/executor.ts` - Skill 执行器
  - `SkillExecutor` 类
  - 工具上下文创建
  - 错误处理
- ✅ 创建 `src/lib/skills/project-initialization/loader.ts` - Skill 加载器
  - `projectInitializationLoadedSkill` 定义
  - Handler 实现
  - 自动注册
- ✅ 更新 `src/lib/features/agent/index.ts` - 导出 skill API
- ✅ 更新 `src/types/agent.ts` - 添加 `AgentSkillType` 类型

**待完成:**
- ⏸️ 集成实际 Ontology API 调用（目前为 mock）
- ⏸️ 实现 skill-to-skill 通信
- ⏸️ 添加单元测试
- ⏸️ 添加集成测试

---

## 🔗 相关链接

- [Story 1.1](../story-1.1/README.md) - Skill 定义
- [Epic 1 README](../README.md)
- [Skill System Types](../../../../src/types/skill.ts)
