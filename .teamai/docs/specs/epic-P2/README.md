# Epic P2: AI 解决方案设计

**Epic 编号:** P2
**Epic 名称:** AI 解决方案概要设计（Phase 2）
**优先级:** 🔴 High
**状态:** 🔄 进行中（部分实现，缺少 Epic/Story 文档）
**PRD:** [phase-2-ai-solution-design.md](../../product/phase-2-ai-solution-design.md)
**创建日期:** 2026-04-22

---

## 📋 Epic 描述

基于第一阶段沉淀的业务模型（Ontology），设计 AI Native 解决方案的概要设计阶段。

通过对话式 AI 引导，完成建模维度选择（事的维度 / 人的维度）、Agent 协作架构规划、SOP I/O 契约定义、沙盒推演验证，最终输出执行清单供第三阶段消费。

**本阶段边界：**
- ✅ 规划 Agent 职责和协作关系（概要设计）
- ✅ 为每个 Skill 定义 I/O 契约（本体数据流）
- ✅ SOP 步骤级输入输出声明（上游产出 = 下游需求）
- ❌ 不配置具体 Skill 的执行代码
- ❌ 不创建实际 Agent 实例
- ❌ 不进行数据 setup（第三阶段）

---

## 🎯 Epic 目标

1. 将业务模型转化为 AI Native Agent 架构设计
2. 提供两种建模视角：事的维度（Agentic Workflow）和人的维度（Agentic System）
3. 通过沙盒推演验证方案可行性，发现本体缺口
4. 输出执行清单，约束第三阶段的详细设计与实施

### 成功标准

- ✅ 用户可在项目中进入解决方案窗体（前置：项目有本体）
- ✅ AI 自动分析本体，推荐建模维度并给出理由
- ✅ 生成 Agent 规划草稿，支持用户迭代调整
- ✅ 拓扑图实时展示 Agent 协作关系
- ✅ 沙盒推演生成推演报告和本体缺口报告
- ✅ 方案确认后生成执行清单（JSON）
- ✅ 支持多版本方案管理

---

## 📝 Stories 列表

| Story | 标题 | 状态 | 优先级 | 说明 |
|-------|------|------|--------|------|
| P2.1 | 解决方案窗体入口与 AI 初始化 | 🟡 部分实现 | Critical | 入口、Skill 启动、本体分析 |
| P2.2 | Agent 规划编辑与迭代调整 | 🟡 部分实现（在 Skill 内） | High | 职责编辑、协作关系调整 |
| P2.3 | 协作拓扑可视化 | 🔴 未接通 | High | TopologyGraph 组件已写但未激活 |
| P2.4 | 沙盒推演与本体反馈回路 | 🔴 仅有类型定义 | High | 场景生成、模拟运行、缺口报告 |
| P2.5 | 方案版本管理与执行清单 | 🔴 部分（Skill 写文件） | Medium | 左侧版本列表、确认锁定、清单下载 |
| P2.6 | SOP I/O 契约（本体数据流） | ⬜ 未开始 | High | Skill inputContract/outputContract、SOP 数据流验证 |
| P2.7 | Agent-Skill 协作图谱与建模维度扩展 | ⬜ 未开始 | High | Workflow/Team 设计视图和 Agent-Skill 拓扑 |
| P2.8 | Workflow 设计与解决方案执行契约发布 | 🟡 Planning | Critical | 设计门控、不可变契约编译、版本化发布 |

---

## 🏗️ 已有实现资产

| 文件 | 类型 | 状态 |
|------|------|------|
| `skills/solution-design/SKILL.md` | AI Skill | ✅ 完整，覆盖完整 5 阶段工作流 |
| `src/types/solution.ts` | 数据类型 | ✅ 完整 |
| `src/types/sandbox.ts` | 数据类型 | ✅ 完整 |
| `src/app/api/projects/[id]/solution/initialize/route.ts` | API | ✅ 完整 |
| `src/components/solution/SolutionDesign.tsx` | UI 组件 | 🟡 核心功能可用，拓扑图未接通 |
| `src/components/solution/TopologyGraph.tsx` | UI 组件 | 🟡 组件已写，未被激活 |

### 关键 Bug（P2.3 阻塞）

`SolutionDesign.tsx` 中 `fetchManifest` 和 `onComplete` 被显式 `void` 废弃，
导致 Skill 生成清单后拓扑图 Tab 永远不触发：

```typescript
void fetchManifest;  // 第 209 行 - 需要移除
void onComplete;     // 第 210 行 - 需要移除
```

---

## 🔗 依赖关系

### 前置依赖

| 依赖 | 来源 | 状态 |
|------|------|------|
| pi-agent-core 集成 | Epic 0 | ✅ Complete |
| 项目本体（Ontology）| Epic 1 业务建模技能 | ✅ 技能可用 |
| AppWindow 系统 | Epic OS | ✅ Complete |
| Skill 启动系统 | Epic 0 | ✅ Complete |

### 后续依赖

| 依赖模块 | 用途 |
|---------|------|
| Phase 3（第三阶段）| 消费执行清单创建实际 Agent |
| Story 9.42 | 消费 P2.8 已发布执行契约，实例化多 Agent WorkItem |

---

## 📊 技术架构

### 实现模式

Phase 2 采用 **Skill 驱动的对话式设计**，而非传统的多 API 端点：

```
用户 → SolutionDesign.tsx（对话 UI）
         ↓
    pi-agent 运行 solution-design Skill
         ↓
    Skill 直接读写项目文件系统：
    - output/business-model.json（读取本体）
    - solutions/solution-{version}.json（保存方案）
    - solutions/solution-{version}-manifest.json（执行清单）
```

### 存储位置

```
data/projects/{projectId}/
└── solutions/
    ├── solution-v1.0.json
    ├── solution-v1.0-manifest.json
    └── solution-v1.1.json
```

---

## 📅 实施计划

| 阶段 | Story | 预计工时 |
|------|-------|---------|
| Week 1 | P2.1 验证入口完整性，P2.3 修复拓扑接通 | 1-2 天 |
| Week 1 | P2.2 Agent 编辑 UI 补充（如有需要） | 1 天 |
| Week 1 | P2.6 SOP I/O 契约类型 + solution-design Skill 扩展 | 1-2 天 |
| Week 1 | P2.7 Workflow/Team 与 Agent-Skill 图谱 | 1-2 天 |
| Week 2 | P2.4 沙盒推演独立面板 UI | 2-3 天 |
| Week 2 | P2.5 版本列表 + 执行清单下载 | 1-2 天 |
| Week 2 | P2.8 设计门控与不可变执行契约发布 | 2-3 天 |

---

## 📚 相关文档

- [PRD: Phase 2 AI 解决方案设计](../../product/phase-2-ai-solution-design.md)
- [Epic 0: 技术架构实施层](../epic-0/README.md)
- [Epic OS: OS 交互基础](../epic-OS/README.md)
- [solution-design Skill](../../../skills/solution-design/SKILL.md)

---

## 🔄 变更历史

| 日期 | 变更内容 | 变更人 |
|------|---------|--------|
| 2026-04-22 | Epic P2 初始化，梳理现有实现状态 | archersado |
| 2026-07-28 | 增加 P2.7 与 P2.8，明确 Workflow 只在设计阶段并发布执行契约 | Codex |

## P21-T2 (2026-09-13)

测试包：/Users/archersado/workspace/startupOS/release/session-fixes-20260913/mac-arm64/OriginOS CE.app。

[Testing](./story-P2.1/testing.md)

## 2026-09-14：访谈语义驱动的上下文设计

P2.8扩展为把访谈确认的概念/关系/业务状态编译进语义上下文契约，包含任务模板、输入事实绑定、Action/验收及新鲜度策略，随方案版本冻结。P2.6提供I/O语义连通校验，9.42只消费已发布契约。[实施主线](../epic-ONT/project-semantic-execution-plan.md)记录依赖和验收；本次仅规划，未新增运行实现。
