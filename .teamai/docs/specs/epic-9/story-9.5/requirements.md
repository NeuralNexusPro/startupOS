# 需求定义 - Story 9.5

**Story:** Agent 注册表
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-17

---

## 用户故事

> 作为协作运行时，我需要从 Solution Manifest 和项目目录加载 Agent 定义，这样协作引擎知道有哪些 Agent 可用以及它们各自的能力。

---

## 功能需求

1. **解析 Solution Manifest** — 从 `solutions/solution-{version}.json` 提取 Agent 列表
2. **加载 Agent.md / Tool.md / Skill.md** — 从 `data/projects/{id}/agents/{agentId}/*.md` 读取定义
3. **提取能力列表** — 从 Agent.md 的 responsibility 段落解析 Agent 能力
4. **构建 AgentNode** — 注册到 CollaborationTopology

## 边界条件

- Agent.md 不存在时优雅降级（使用默认定义）
- 注册表查询 O(1)
- 复用 `persistent-agent.ts` 中的 `parseAgentDefinition`、`parseToolDefinition`、`parseSkillDefinition`，不重写解析逻辑
- 仅做元数据收集，不实例化 PersistentAgent（实例化由 Agent Worker 子进程负责）

## 验收标准

- [ ] 从 solution-v1.0-manifest.json 正确解析 Agent 列表
- [ ] Agent.md 不存在时优雅降级（使用默认定义）
- [ ] 能力提取准确
- [ ] 注册表查询 O(1)
- [ ] **复用 `persistent-agent.ts` 中的 `parseAgentDefinition`、`parseToolDefinition`、`parseSkillDefinition`，不重写解析逻辑**
- [ ] **仅做元数据收集，不实例化 PersistentAgent（实例化由 Agent Worker 子进程负责）**

## 依赖关系

- [设计文档 §5.2 协作拓扑解析](../../design/multi-agent-runtime.md#52-协作拓扑解析)
- [现有 Agent 定义](../../../data/projects/)
- [现有解析函数](../../../src/lib/integrations/pi-agent/persistent-agent.ts) — 复用 `parseAgentDefinition` 等
