# 需求定义 - Story 9.7

**Story:** 协作拓扑解析器
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-17

---

## 用户故事

> 作为协作引擎，我需要将 Solution Manifest 中的 Agent 协作关系解析为可执行的拓扑结构，这样才能根据拓扑驱动 Agent 的执行顺序。

---

## 功能需求

1. **解析 agents map** — ID → AgentNode（id, name, type, responsibility, domain, skills, capabilities）
2. **解析 collaboration edges** — from/to/type（trigger/notify/depend）/description
3. **识别 entryPoints** — 无入边的 Agent（外部触发的起点）
4. **识别 exitPoints** — 无出边的 Agent（最终产出物）
5. **自动判定执行模式** — 全 trigger → Workflow，存在 notify/depend → System
6. **检测循环依赖** — 发现 trigger 环时报告错误

## 边界条件

- 全 trigger 拓扑 → `executionMode: 'workflow'`
- 存在 notify/depend → `executionMode: 'system'`
- A→B→A 循环依赖检测正确
- 入口 Agent（无入边）识别正确
- 出口 Agent（无出边）识别正确
- 空 manifest 优雅处理

## 验收标准

- [ ] 全 trigger 拓扑 → `executionMode: 'workflow'`
- [ ] 存在 notify/depend → `executionMode: 'system'`
- [ ] A→B→A 循环依赖检测正确
- [ ] 入口 Agent（无入边）识别正确
- [ ] 出口 Agent（无出边）识别正确
- [ ] 空 manifest 优雅处理

## 依赖关系

- [设计文档 §5.2 协作拓扑解析](../../design/multi-agent-runtime.md#52-协作拓扑解析)
- [Solution Manifest 格式](../../../solutions/)
