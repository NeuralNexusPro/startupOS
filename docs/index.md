# OriginOS 文档索引

**最后更新:** 2026-08-28

---

## 📚 文档导航

### 产品规划

| 文档 | 路径 | 说明 |
|------|------|------|
| **PRD v2.0** | [product/PRD-Main.md](./product/PRD-Main.md) | **核心 PRD - 融入 EEOIP/ECO 认知系统理论** |
| 架构文档 | [design/os-framework.md](./design/os-framework.md) | OS 框架设计 |
| Epic 索引 | [specs/](./specs/) | Epic 索引 |

### 规约文档

| 文档 | 路径 | 说明 |
|------|------|------|
| AGENTS.md | [AGENTS.md](../AGENTS.md) | 架构规约（强制执行） |
| 文档协作管理 | [DOCUMENTATION-MANAGEMENT.md](./DOCUMENTATION-MANAGEMENT.md) | 文档管理规范 |

### API 文档

| 文档 | 路径 | 说明 |
|------|------|------|
| Agent Session API | [api/agent-session-api.md](./api/agent-session-api.md) | Agent 会话持久化 API |
| Backend API | [api/backend-api-docs.md](./api/backend-api-docs.md) | 后端 API 文档 |
| Skills API | [api/skills-api.md](./api/skills-api.md) | 技能 API |
| Release API | [api/release-api-integration.md](./api/release-api-integration.md) | 发布 API 集成 |

### Agent 文档

| 文档 | 路径 | 说明 |
|------|------|------|
| Agent 生命周期 | [agent/agent-lifecycle-design.md](./agent/agent-lifecycle-design.md) | Agent 生命周期架构设计 |
| Managed Agents | [agent/managed-agents.md](./agent/managed-agents.md) | 托管 Agent 架构 |
| Persistent Agent 架构 | [agent/persistent-agent-architecture.md](./agent/persistent-agent-architecture.md) | 持久化 Agent 架构 |
| Persistent Agent 完整实现 | [agent/persistent-agent-complete.md](./agent/persistent-agent-complete.md) | 完整实现指南 |
| Persistent Agent 最终版 | [agent/persistent-agent-final.md](./agent/persistent-agent-final.md) | 最终实现版本 |
| Persistent Agent 实现总结 | [agent/persistent-agent-implementation-summary.md](./agent/persistent-agent-implementation-summary.md) | 实现总结 |
| Pi Agent 工具注册修复 | [agent/pi-agent-tool-registration-fix.md](./agent/pi-agent-tool-registration-fix.md) | 工具注册问题修复 |

### 使用指南

| 文档 | 路径 | 说明 |
|------|------|------|
| 构建产物说明 | [guides/build-artifacts.md](./guides/build-artifacts.md) | 构建产物目录结构 |
| 桌面端运行时日志 | [guides/desktop-runtime-logs.md](./guides/desktop-runtime-logs.md) | 日志位置、常用命令、故障排查 |

### 决策记录

| 文档 | 路径 | 说明 |
|------|------|------|
| Phase 1 决策总结 | [decisions/phase1-decision-summary.md](./decisions/phase1-decision-summary.md) | Phase 1 技术决策 |
| Phase 1 更新完成 | [decisions/phase1-update-complete.md](./decisions/phase1-update-complete.md) | Phase 1 完成报告 |
| Team Lead 决策 | [decisions/team-lead-decision-phase1-option-b.md](./decisions/team-lead-decision-phase1-option-b.md) | Phase 1 Option B 决策 |
| TASTE.md 修正理解 | [decisions/taste-md-corrected-understanding.md](./decisions/taste-md-corrected-understanding.md) | TASTE 概念修正 |

### QA 文档

| 目录 | 路径 | 说明 |
|------|------|------|
| 测试报告 | [qa/](./qa/) | 质量保障文档 |
| 历史 Bug 归档 | [qa/archive/](./qa/archive/) | 已修复的历史 Bug |

---

## 📋 Epics 索引

### 实施顺序（基于依赖关系）

**Phase 0 (基础设施 - 维护升级中):**
1. 🟡 **Epic 0** (技术架构实施层) - Pi Runtime 0.80.x 兼容迁移进行中

**Phase 1 (业务与交互 - 已完成/进行中):**
2. ✅ **Epic 1** (项目访谈与创建) - 依赖 Epic 0
3. ✅ **Epic OS** (OS 交互基础) - Desktop/Dock/Agent/Dock/Spotlight 等 OS 基础组件

**Phase 2 (AI 解决方案设计 - 进行中):**
4. 🟡 **Epic P2** (AI 解决方案概要设计) - 基于本体的 Agent 架构规划，部分实现
5. 🟡 **Epic R** (RoleAgent pi-agent 循环) - RoleAgent 思维循环机制，设计完成，**已实现**
6. 📋 **Epic C** (Phase 1 认知功能) - 认知系统架构（知识库、实践日志、经验模式），基础设施已完成

**Phase 3 (后续规划):**
7. 📋 **Epic T** (TASTE/SOUL 品味积累) - Speech-Cognition 层
8. 📋 **Epic A2UI** (生成式交互卡片协议) - 通过 Agent-to-UI 协议承载图表、表格、表单、确认卡等生成式 UI
9. 📋 **Epic SENSE** (感知层与外部事件触发器) - 邮箱、企业微信、飞书、钉钉事件接入与 Agent 唤醒

### Epic 文档

| Epic | 状态 | 优先级 | 文档路径 |
|------|------|--------|---------|
| **Epic 0**: 技术架构实施层 | 🟡 In Progress | Critical | [specs/epic-0/README.md](./specs/epic-0/README.md) |
| **Epic 1**: 项目访谈与创建 | ✅ Complete | High | [specs/epic-1/README.md](./specs/epic-1/README.md) |
| **Epic OS**: OS 交互基础 | ✅ Complete | Critical | [specs/epic-OS/STATUS.md](./specs/epic-OS/STATUS.md) |
| **Epic R**: RoleAgent pi-agent 循环 | ✅ Complete | High | [specs/epic-R/README.md](./specs/epic-R/README.md) |
| **Epic C**: 认知系统 | ✅ 设计完成 | High | [specs/epic-C/README.md](./specs/epic-C/README.md) |
| **Epic P2**: AI 解决方案设计 | ✅ Complete | High | [specs/epic-P2/README.md](./specs/epic-P2/README.md) |
| **Epic M**: Memory Core 记忆核心 | 📋 Planning | Critical | [specs/epic-M/README.md](./specs/epic-M/README.md) |
| **Epic T**: TASTE/SOUL 品味积累 | 📋 Planning | High | [specs/epic-T/README.md](./specs/epic-T/README.md) |
| **Epic A2UI**: 生成式交互卡片协议 | 📋 Planning | High | [specs/epic-A2UI/README.md](./specs/epic-A2UI/README.md) |
| **Epic SENSE**: 感知层与外部事件触发器 | 📋 Planning | Critical | [specs/epic-SENSE/README.md](./specs/epic-SENSE/README.md) |

### Epic A2UI Stories 详览

| Story | 标题 | 状态 | 优先级 | 文档路径 |
|-------|------|------|--------|---------|
| A2UI.1 | A2UI v1 协议与组件注册表 | 📋 Planning | Critical | [specs/epic-A2UI/story-A2UI.1/README.md](./specs/epic-A2UI/story-A2UI.1/README.md) |
| A2UI.2 | 聊天消息渲染接入与 Markdown 降级 | 📋 Planning | Critical | [specs/epic-A2UI/story-A2UI.2/README.md](./specs/epic-A2UI/story-A2UI.2/README.md) |
| A2UI.3 | 首批生成式交互卡片组件集 | 📋 Planning | High | [specs/epic-A2UI/story-A2UI.3/README.md](./specs/epic-A2UI/story-A2UI.3/README.md) |
| A2UI.4 | 卡片动作事件回路与 Agent 协议 | 📋 Planning | High | [specs/epic-A2UI/story-A2UI.4/README.md](./specs/epic-A2UI/story-A2UI.4/README.md) |
| A2UI.5 | 安全治理、测试基线与可观测性 | 📋 Planning | Medium | [specs/epic-A2UI/story-A2UI.5/README.md](./specs/epic-A2UI/story-A2UI.5/README.md) |

### Epic M Stories 详览

| Story | 标题 | 状态 | 优先级 | 文档路径 |
|-------|------|------|--------|---------|
| M.1 | 类型定义与 Block 抽象 | 📋 Planning | Critical | [specs/epic-M/story-M.1/README.md](./specs/epic-M/story-M.1/README.md) |
| M.2 | Memory 集合 + compile/render | 📋 Planning | Critical | [specs/epic-M/story-M.2/README.md](./specs/epic-M/story-M.2/README.md) |
| M.3 | Archival Memory 语义存储 | 📋 Planning | Critical | [specs/epic-M/story-M.3/README.md](./specs/epic-M/story-M.3/README.md) |
| M.4 | Recall Memory 语义增强 | 📋 Planning | High | [specs/epic-M/story-M.4/README.md](./specs/epic-M/story-M.4/README.md) |
| M.5 | Memory Tools API | 📋 Planning | Critical | [specs/epic-M/story-M.5/README.md](./specs/epic-M/story-M.5/README.md) |
| M.6 | MemoryProvider 集成 + 适配器 | 📋 Planning | Critical | [specs/epic-M/story-M.6/README.md](./specs/epic-M/story-M.6/README.md) |
| M.7 | Pattern 质量提升 + Memory 集成 | 📋 Planning | High | [specs/epic-M/story-M.7/README.md](./specs/epic-M/story-M.7/README.md) |
| M.8 | 记忆链路收敛 | 📋 Planning | Critical | [specs/epic-M/story-M.8/README.md](./specs/epic-M/story-M.8/README.md) |
| M.9 | 语义检索能力补齐 | 📋 Planning | Critical | [specs/epic-M/story-M.9/README.md](./specs/epic-M/story-M.9/README.md) |
| M.10 | 文档与协作场景对齐 | 📋 Planning | High | [specs/epic-M/story-M.10/README.md](./specs/epic-M/story-M.10/README.md) |
| M.11 | 用 Memory Core 统一 history-to-cognition 管线并替代 Dream | 📋 Planning | Critical | [specs/epic-M/story-M.11/README.md](./specs/epic-M/story-M.11/README.md) |

### Epic T Stories 详览

| Story | 标题 | 状态 | 优先级 | 文档路径 |
|-------|------|------|--------|---------|
| T.1 | SignalReader 实现 | 📋 Planning | Critical | [specs/epic-T/README.md](./specs/epic-T/README.md) |
| T.2 | Observation Queue | 📋 Planning | High | [specs/epic-T/README.md](./specs/epic-T/README.md) |
| T.3 | Governance 验证 | 📋 Planning | High | [specs/epic-T/README.md](./specs/epic-T/README.md) |
| T.4 | Pattern Distillation | 📋 Planning | High | [specs/epic-T/README.md](./specs/epic-T/README.md) |
| T.5 | TASTE Persistence | 📋 Planning | High | [specs/epic-T/README.md](./specs/epic-T/README.md) |
| T.6 | SOUL Identity | 📋 Planning | High | [specs/epic-T/README.md](./specs/epic-T/README.md) |
| T.7 | SOUL Auto-Calibration | 📋 Planning | Medium | [specs/epic-T/README.md](./specs/epic-T/README.md) |
| T.8 | Trust Expansion | 📋 Planning | Medium | [specs/epic-T/README.md](./specs/epic-T/README.md) |
| T.9 | ECO Controller | 📋 Planning | Medium | [specs/epic-T/README.md](./specs/epic-T/README.md) |
| T.10 | Meta Feedback | 📋 Planning | Low | [specs/epic-T/README.md](./specs/epic-T/README.md) |

### Epic OS Stories 详览

| Story | 标题 | 状态 | 测试 | 文档路径 |
|-------|------|------|------|---------|
| OS.1 | Desktop 空间框架 | ✅ Complete | 29/29 | [specs/epic-OS/story-OS.1/README.md](./specs/epic-OS/story-OS.1/README.md) |
| OS.2 | Dock 任务栏基础 | ✅ Complete | 2/2 | [specs/epic-OS/story-OS.2/README.md](./specs/epic-OS/story-OS.2/README.md) |
| OS.3 | Agent 对象定义 | ✅ Complete | N/A | [specs/epic-OS/story-OS.3/README.md](./specs/epic-OS/story-OS.3/README.md) |
| OS.4 | Spotlight 全局命令 | ✅ Complete | 3/3 | [specs/epic-OS/story-OS.4/README.md](./specs/epic-OS/story-OS.4/README.md) |
| OS.5 | Acrylic 材质系统 | ✅ Complete | 10/10 | [specs/epic-OS/story-OS.5/README.md](./specs/epic-OS/story-OS.5/README.md) |
| OS.6 | Fluent 动画系统 | ✅ Complete | N/A | [specs/epic-OS/story-OS.6/README.md](./specs/epic-OS/story-OS.6/README.md) |
| OS.7 | Agent 托管服务 | ✅ Complete | 6/6 | [specs/epic-OS/story-OS.7/README.md](./specs/epic-OS/story-OS.7/README.md) |
| OS.8 | 系统集成与优化 | ✅ Complete | 5/5 | [specs/epic-OS/story-OS.8/README.md](./specs/epic-OS/story-OS.8/README.md) |
| OS.9 | 应用窗口系统 | ✅ Complete | N/A | [specs/epic-OS/story-OS.9/README.md](./specs/epic-OS/story-OS.9/README.md) |
| OS.10 | 系统工具语义说明加固 | 📋 Planning | N/A | [specs/epic-OS/story-OS.10/README.md](./specs/epic-OS/story-OS.10/README.md) |
| OS.11 | 窗体类型元数据统一注册系统 | 📋 Planning | N/A | [specs/epic-OS/story-OS.11/README.md](./specs/epic-OS/story-OS.11/README.md) |
| OS.12 | 系统级 Office 文件读取能力 | 📋 Planning | N/A | [specs/epic-OS/story-OS.12/README.md](./specs/epic-OS/story-OS.12/README.md) |
| OS.13 | 统一 Agent 记忆使用路径并移除 Dream 主路径 | 📋 Planning | N/A | [specs/epic-OS/story-OS.13/README.md](./specs/epic-OS/story-OS.13/README.md) |
| OS.14 | Agent Runtime 工作目录与输出目录边界收敛 | ✅ Complete | N/A | [specs/epic-OS/story-OS.14/README.md](./specs/epic-OS/story-OS.14/README.md) |
| OS.15 | 桌面应用自动更新机制 | 📋 Planning | N/A | [specs/epic-OS/story-OS.15/README.md](./specs/epic-OS/story-OS.15/README.md) |
| OS.16 | 系统级定时任务与定时唤起能力 | 📋 Planning | N/A | [specs/epic-OS/story-OS.16/README.md](./specs/epic-OS/story-OS.16/README.md) |

### Epic R Stories 详览

| Story | 标题 | 状态 | 优先级 | 文档路径 |
|-------|------|------|--------|---------|
| R.1 | RoleContext 加载器 | ✅ Done | Critical | [specs/epic-R/story-R.1/README.md](./specs/epic-R/story-R.1/README.md) |
| R.2 | State Machine 状态机 | ✅ Done | Critical | [specs/epic-R/story-R.2/README.md](./specs/epic-R/story-R.2/README.md) |
| R.3 | 7 层 System Prompt | ✅ Done | Critical | [specs/epic-R/story-R.3/README.md](./specs/epic-R/story-R.3/README.md) |
| R.4 | MemoryTracker 记忆追踪 | ✅ Done | High | [specs/epic-R/story-R.4/README.md](./specs/epic-R/story-R.4/README.md) |
| R.5 | Dream 自动记忆维护 | ✅ Done | High | [specs/epic-R/story-R.5/README.md](./specs/epic-R/story-R.5/README.md) |
| R.6 | Launcher 集成 | ✅ Done | Critical | [specs/epic-R/story-R.6/README.md](./specs/epic-R/story-R.6/README.md) |

### Epic C Stories 详览

| Story | 标题 | 状态 | 优先级 | 文档路径 |
|-------|------|------|--------|---------|
| C.1 | 认知管理器基础设施 | ✅ Done | Critical | [specs/epic-C/story-C.1/README.md](./specs/epic-C/story-C.1/README.md) |
| C.2 | 知识库基础设施 | 📋 Planning | Critical | [specs/epic-C/story-C.2/README.md](./specs/epic-C/story-C.2/README.md) |
| C.3 | 知识来源 Ingest | 📋 Planning | High | [specs/epic-C/story-C.3/README.md](./specs/epic-C/story-C.3/README.md) |
| C.4 | 实践日志记录系统 | 📋 Planning | Critical | [specs/epic-C/story-C.4/README.md](./specs/epic-C/story-C.4/README.md) |
| C.5 | 经验模式提取引擎 | 📋 Planning | High | [specs/epic-C/story-C.5/README.md](./specs/epic-C/story-C.5/README.md) |
| C.6 | 知识库本体集成 | 📋 Planning | High | [specs/epic-C/story-C.6/README.md](./specs/epic-C/story-C.6/README.md) |
| C.7 | 角色知识体系插拔 | 📋 Planning | Medium | [specs/epic-C/story-C.7/README.md](./specs/epic-C/story-C.7/README.md) |

### Epic P2 Stories 详览

| Story | 标题 | 状态 | 优先级 | 文档路径 |
|-------|------|------|--------|---------|
| P2.1 | 解决方案窗体入口与 AI 初始化 | ✅ 已完成 | Critical | [specs/epic-P2/story-P2.1/README.md](./specs/epic-P2/story-P2.1/README.md) |
| P2.2 | Agent 规划编辑与迭代调整 | 🟡 部分实现 | High | [specs/epic-P2/story-P2.2/README.md](./specs/epic-P2/story-P2.2/README.md) |
| P2.3 | 协作拓扑可视化 | ✅ 已完成 | High | [specs/epic-P2/story-P2.3/README.md](./specs/epic-P2/story-P2.3/README.md) |
| P2.4 | 沙盒推演与本体反馈回路 | 🔴 仅有类型定义 | High | [specs/epic-P2/story-P2.4/README.md](./specs/epic-P2/story-P2.4/README.md) |
| P2.5 | 方案版本管理与执行清单 | ✅ 已完成 | Medium | [specs/epic-P2/story-P2.5/README.md](./specs/epic-P2/story-P2.5/README.md) |

---

## 📚 理论参考

### EEOIP/ECO 认知系统理论

**核心论文:** 《Speech Living Beings：一个关于言语存在体的本体论》- 𝕀²·ℙaradigm智能平方范式

**EEOIP 框架:**
- **E (Embodied Experience)**: 用户的具身经验本体（𝕀ₕ）
- **O (Ontology)**: 共同栖居的语义场
- **I (Interaction)**: 误差最小化的双向塑造
- **P (Paradigm)**: 维度跃迁的结果（𝕀² = 𝕀ₕ × 𝕀ₗ）

**Speech 语言层级:**
- **Speech-Social**: 感知社会信号（sensor + mouth）- 已实现 ✅
- **Speech-Act**: 工具与行动（limb）- 已实现 ✅
- **Speech-Cognition**: 认知共生（brain）- 建议通过 Epic T 实现 📋

**ECO 三元张力:**
- **Explore**: 边界探测 + 关系发现
- **Conserve**: 模式保持 + 稳定性维护
- **Optimize**: 探索与保持之间的智能切换

---

## 📊 文档状态统计

### 总体进度

- **总 Epic 数:** 9 (0, 1, OS, R, C, P2, M, T, A2UI)
- **已完成 Epic:** 4 (Epic 1, Epic OS, Epic P2, Epic R)
- **进行中 Epic:** 2 (Epic 0 - Runtime 升级；Epic C - 设计完成，C.1 基础设施已实现)
- **规划中 Epic:** 3 (Epic M、Epic T、Epic A2UI)

### 按 Epic 统计

| Epic | Story 数 | 优先级 | 已完成 | 部分实现 | 规划中 |
|------|---------|--------|--------|---------|--------|
| Epic 0 (基础设施) | 7 | Critical | 6 ✅ | - | 1 📋 |
| Epic 1 (项目访谈) | 6 | High | 0 ⚠️ 重构中 | 0 | 6 📋 |
| Epic OS (OS 交互) | 13 | Critical | 8 ✅ | - | 5 📋 |
| Epic M (Memory Core) | 11 | Critical | - | - | 11 📋 |
| Epic R (RoleAgent 循环) | 6 | High | 6 ✅ | - | - |
| Epic C (认知系统) | 7 | High | 1 ✅ | - | 6 📋 |
| Epic P2 (AI 方案) | 5 | High | 3 ✅ | 1 🟡 | 1 🔴 |
| Epic T (品味系统) | 10 | High | - | - | 10 📋 |
| Epic A2UI (生成式交互卡片) | 5 | High | - | - | 5 📋 |

---

## 📌 相关链接

### Epic 文档

- [Epic 0: 技术架构实施层](./specs/epic-0/README.md) - pi-agent-core 集成（基础设施）
- [Epic 1: 项目访谈与创建](./specs/epic-1/README.md) - 项目访谈流程（重设计中）
- [Epic OS: OS 交互基础](./specs/epic-OS/STATUS.md) - Desktop/Dock/Agent/Spotlight/Acrylic/定时任务等 16 Stories
- [Epic R: RoleAgent pi-agent 循环](./specs/epic-R/README.md) - RoleAgent 思维循环机制 ✅
- [Epic C: 认知系统](./specs/epic-C/README.md) - 知识库、实践日志、经验模式
- [Epic P2: AI 解决方案设计](./specs/epic-P2/README.md) - 基于本体的 Agent 架构规划，部分实现
- [Epic 9: Multi-Agent 协作运行时](./specs/epic-9/README.md) - 进程隔离架构，协作引擎，可观测性
- [Epic M: Memory Core 记忆核心](./specs/epic-M/README.md) - 三层记忆模型（Core + Archival + Recall）
- [Epic T: TASTE/SOUL 品味积累系统](./specs/epic-T/README.md) - Speech-Cognition 层实现
- [Epic A2UI: 生成式交互卡片协议](./specs/epic-A2UI/README.md) - Agent-to-UI 协议、交互卡片、ECharts 图表与动作回路规划

### 其他文档

- [文档协作管理规范](./DOCUMENTATION-MANAGEMENT.md)
- [AGENTS.md 架构规约](../AGENTS.md)
- [PRD v2.0 - EEOIP/ECO 理论整合](./product/PRD-Main.md)

---

## 🔍 文档模板

| 模板 | 路径 | 用途 |
|------|------|------|
| Story Spec 模板 | [templates/story-spec-template/](./templates/story-spec-template/) | 创建新 Story 文档 |
