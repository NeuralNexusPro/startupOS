# Story OS.7: Agent 托管服务

**状态:** Planning
**优先级:** High
**估计工时:** 4-5 天
**调度:** Week 3, Days 1-5

---

## 用户故事

> 作为用户，我希望 Agent 能在桌面空间中显示，点击可以打开对话窗口。

---

## 功能需求

### 核心功能
- **Agent 渲染服务**：Agent 在桌面/Dock 中渲染
- **Agent 启动器**：点击 Agent 打开对话窗口
- **Agent 状态同步**：Agent 状态实时更新
- **多 Agent 支持**：可同时打开多个 Agent 对话

### 交互流程

```
Dock 中显示 Agent 图标
         ↓
    用户点击 Agent
         ↓
打开对话窗口（Acrylic 材质）
         ↓
Agent 开始运行（状态：running）
         ↓
对话内容显示在窗口中
         ↓
窗口可最小化/关闭
```

---

## 验收标准

- [ ] Agent 在 Dock 中显示
- [ ] 点击 Agent 打开对话窗口
- [ ] Agent 状态正确同步
- [ ] 可同时打开多个 Agent
- [ ] 对话窗口使用 Acrylic 材质
- [ ] 窗口可最小化/关闭
- [ ] 窗口可拖拽

---

## 依赖关系

**前置依赖:** OS.3 (Agent 对象), OS.5 (Acrylic 材质)
**后置依赖:** OS.8 (系统集成)

---

## 相关文档

- Epic README: `docs/specs/epic-OS/README.md`
- pi-agent-core 文档: `src/lib/integrations/pi-agent/`
