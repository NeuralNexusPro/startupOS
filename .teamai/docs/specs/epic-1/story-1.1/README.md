# Story 1.1: project-initialization Skill 定义

**Story 编号:** 1.1
**Epic:** Epic 1 - 项目初始化 Skill
**状态:** 🔄 In Progress
**负责人:** -
**最后更新:** 2026-03-20

---

## 📋 Story 描述

作为系统，
我需要定义 `project-initialization` 复合 Skill 及其与 pi-agent-core 的集成接口，
以便当用户点击"创建项目"时能够启动灵活的访谈流程。

---

## 🎯 验收标准

### AC1.1.1: Skill 定义文档
- [ ] 创建 `skills/project-initialization/SKILL.md` 文件
- [ ] 定义 Skill 元数据（name, description, type）
- [ ] 编写完整的 system prompt
- [ ] 文档包含可用实体类型和关系类型
- [ ] 文档包含对话流程描述

### AC1.1.2: Python Interview Agent
- [ ] 实现 `scripts/interview.py` InterviewAgent 类
- [ ] 实现对话阶段处理（Foundation, Team, Goals, Tasks, Review）
- [ ] 集成 Ontology Skill 调用
- [ ] 实现实体提取和创建逻辑

### AC1.1.3: TypeScript 集成层
- [ ] 实现 `src/lib/skills/project-initialization/index.ts`
- [ ] 实现 `ProjectInitializationSkill` 类
- [ ] 实现 `useProjectInitialization()` React Hook
- [ ] 集成到 `AgentSessionService`

### AC1.1.4: 类型定义
- [ ] 扩展 `src/types/ontology.ts` 添加 Ontology Skill 实体类型
- [ ] 定义所有实体属性类型（Person, Project, Task, Goal 等）
- [ ] 定义关系类型

### AC1.1.5: API Route
- [ ] 创建 `src/app/api/projects/init/route.ts`
- [ ] POST /api/projects/init 端点启动访谈会话
- [ ] 返回 session ID 和初始状态

### AC1.1.6: 测试验证
- [ ] 测试 Skill 文档语法正确
- [ ] 测试 Python agent 可以独立运行
- [ ] 测试 TypeScript 编译通过
- [ ] 测试 API route 可以被调用

---

## 📁 文件清单

| 文件 | 状态 | 说明 |
|-----|------|------|
| `skills/project-initialization/SKILL.md` | ✅ Created | Skill 定义文档 |
| `skills/project-initialization/scripts/interview.py` | ✅ Created | Python interview agent |
| `src/lib/skills/project-initialization/index.ts` | ✅ Created | TypeScript 集成层 |
| `src/types/ontology.ts` (extended) | ✅ Created | 类型定义扩展 |
| `src/app/api/projects/init/route.ts` | ⏸️ Pending | API route |
| `skills/project-initialization/references/agent-prompts.md` | ⏸️ Pending | Agent 提示词参考 |
| `skills/project-initialization/references/examples.md` | ⏸️ Pending | 使用示例 |

---

## 🔄 技术实现

### Skill 结构

```
skills/project-initialization/
├── SKILL.md                  # Skill 定义（✅ 完成）
├── scripts/
│   ├── interview.py          # Interview agent（✅ 完成）
│   └── skill.py              # Skill 入口（需要创建）
└── references/
    ├── agent-prompts.md      # Agent 提示词参考
    └── examples.md           # 使用示例
```

### 数据流向

```
用户界面 (React)
  ↓ 调用 useProjectInitialization()
TypeScript 集成层 (index.ts)
  ↓ 创建 AgentSession
pi-agent-core (AgentSessionService)
  ↓ 处理消息
Python Interview Agent (interview.py)
  ↓ 调用
Ontology Skill (awesome-openclaw-skills-1)
  ↓ 保存
memory/ontology/graph.jsonl
```

---

## 📝 实现日志

### 2026-03-20

**已完成:**
- ✅ 创建 `skills/project-initialization/SKILL.md` - 完整的 Skill 定义
- ✅ 创建 `scripts/interview.py` - Python Interview Agent 实现
- ✅ 创建 `src/lib/skills/project-initialization/index.ts` - TypeScript 集成
- ✅ 扩展 `src/types/ontology.ts` - Ontology 实体类型
- ✅ 创建 `docs/specs/epic-1/README.md` - Epic 设计文档

**待完成:**
- ⏸️ 创建 API route `/api/projects/init`
- ⏸️ 创建 `scripts/skill.py` - Skill 入口
- ⏸️ 集成到 OS 主页面的"创建项目"按钮
- ⏸️ 编写测试

---

## 🔗 相关链接

- [Epic 1 README](../README.md)
- [Ontology Skill](../../../../awesome-openclaw-skills-1/skills/ontology/SKILL.md)
- [pi-agent-core 组件](../../../../src/lib/features/agent/)
