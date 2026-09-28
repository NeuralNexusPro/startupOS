# 架构设计 - Story 9.12

**Story:** UI — 协作查看器
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-17

---

## 技术栈

- React 18+（函数式组件 + Hooks）
- TypeScript 严格模式
- Tailwind CSS 3+
- Zustand 状态管理
- SSE（Server-Sent Events）客户端

## 数据结构

### UI 布局（设计文档 §12.1）

```
┌──────────────────────────────────────────────┐
│               协作过程查看器                    │
│                                              │
│  ┌────────────┐  ┌────────────┐             │
│  │ Agent 活动  │  │ 事件时间线  │             │
│  │ 卡片列表    │  │ 实时滚动    │             │
│  │            │  │            │             │
│  │ A 🟢 思考   │  │ t1: A 思考 │             │
│  │ B 🔵 执行   │  │ t2: A→B   │             │
│  │ C ⚪ 空闲   │  │ t3: B 思考 │             │
│  └────────────┘  └────────────┘             │
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │ 黑板状态简视                          │   │
│  │ Tasks: 3 pending, 2 completed        │   │
│  │ SharedData: { order: {...} }         │   │
│  └──────────────────────────────────────┘   │
└──────────────────────────────────────────────┘
```

### 事件着色规则

- thinking: blue
- tool_call: yellow
- complete: green
- fail: red

## 模块设计

**文件：**

```
src/modules/collaboration-runtime/ui/CollaborationViewer.tsx   # 主容器
src/modules/collaboration-runtime/ui/EventTimeline.tsx         # 事件时间线
src/modules/collaboration-runtime/ui/BlackboardViewer.tsx      # 黑板状态
```

**技术约束：**
- 函数式组件 + Hooks + Tailwind（AGENTS.md 强制）
- 位于 `src/modules/collaboration-runtime/ui/`（豁免 `src/components/` 约束）
- Zustand 管理本地 UI 状态

## 代码变更

- 新增 `ui/CollaborationViewer.tsx`：主容器组件
- 新增 `ui/EventTimeline.tsx`：事件时间线组件（SSE 实时更新）
- 新增 `ui/BlackboardViewer.tsx`：黑板状态视图
- 使用 Zustand 管理 UI 状态
- 实现 SSE 客户端（支持 Last-Event-ID 断线重连）
