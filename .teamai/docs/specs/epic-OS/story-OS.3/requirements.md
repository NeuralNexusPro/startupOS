# Story OS.3: Agent 对象定义 - 产品需求文档 (PRD)

**版本:** v1.0
**日期:** 2026-03-07
**状态:** 草稿
**批准状态:** 待批准

---

## 1. 功能概述

### 1.1 产品目标

将 Agent 定义为系统中可托管的对象，使其能够在桌面空间中显示、在 Dock 中启动、并与用户进行交互。

### 1.2 核心价值

| 价值点 | 描述 |
|-------|------|
| **可发现性** | 用户能轻易发现和访问所有可用 Agent |
| **可视化** | Agent 以图标形式清晰展示，一目了然 |
| **类型化** | 通过图标和颜色区分不同类型的 Agent |
| **状态感知** | 实时显示 Agent 的运行状态 |
| **扩展性** | 支持动态注册新的 Agent |

---

## 2. 用户角色

| 角色 | 权限 | 职责 |
|-----|------|------|
| **系统用户** | 查看启动 Agent | 使用 Agent 完成任务 |
| **系统管理员** | 注册/注销 Agent | 管理 Agent 生命周期 |

---

## 3. 功能需求

### 3.1 Agent 数据模型 ✅

**需求**: 定义完整的 Agent 数据结构

**字段**:
- `id`: 唯一标识符
- `name`: 内部标识名称
- `displayName`: 显示名称
- `type`: Agent 类型（architect, developer, qa-engineer, ux-designer, pm）
- `status`: 运行状态（idle, running, paused, error, unregistered）
- `icon`: 图标（emoji）
- `color`: 主题颜色
- `capabilities`: 能力列表
- `metadata`: 扩展元数据

**验收**:
- [ ] 数据模型包含所有必需字段
- [ ] 支持可选的 metadata 扩展
- [ ] 所有字段类型定义正确

### 3.2 Agent 注册系统 ✅

**需求**: Agent 可以注册、查询、注销

**功能**:
- 注册新 Agent: `registerAgent(agent)`
- 查询 Agent: `getAgent(id)`
- 查询所有 Agent: `getAllAgents()`
- 按类型查询: `getAgentsByType(type)`
- 按状态查询: `getAgentsByStatus(status)`
- 注销 Agent: `unregisterAgent(id)`

**验收**:
- [ ] 注册功能正常工作
- [ ] 查询功能返回正确结果
- [ ] 注销功能正确清理数据
- [ ] 支持批量操作

### 3.3 Agent 类型系统 ✅

**需求**: 区分 5 种不同类型的 Agent

**类型定义**:
1. **架构师 (Architect)** - 负责系统架构和技术设计
   - 图标: 🏗️
   - 颜色: 蓝色 (#3B82F6)
   - 能力: architecture, design, review

2. **开发者 (Developer)** - 负责代码实现
   - 图标: 💻
   - 颜色: 绿色 (#10B981)
   - 能力: code, test, debug

3. **QA 工程师 (QA Engineer)** - 负责质量保证
   - 图标: 🧪
   - 颜色: 橙色 (#F59E0B)
   - 能力: test, review, quality

4. **UX 设计师 (UX Designer)** - 负责用户体验设计
   - 图标: 🎨
   - 颜色: 紫色 (#8B5CF6)
   - 能力: design, research, prototyping

5. **产品经理 (PM)** - 负责需求规划和协调
   - 图标: 📋
   - 颜色: 粉色 (#EC4899)
   - 能力: planning, requirements, coordination

**验收**:
- [ ] 至少 5 种 Agent 类型
- [ ] 每种类型有独特的图标和颜色
- [ ] 类型定义可扩展

### 3.4 Agent 状态管理 ✅

**需求**: 正确管理和切换 Agent 状态

**状态定义**:
- **IDLE** - 空闲，可以启动
- **RUNNING** - 运行中
- **PAUSED** - 暂停
- **ERROR** - 错误
- **UNREGISTERED** - 未注册

**状态转换**:
```
UNREGISTERED → IDLE (注册)
IDLE ↔ RUNNING (启动/停止)
RUNNING → PAUSED (暂停)
PAUSED → RUNNING (恢复)
RUNNING → ERROR (错误发生)
ERROR → IDLE (恢复)
ERROR → RUNNING (重试)
```

**验收**:
- [ ] 状态转换规则正确
- [ ] 状态更新实时生效
- [ ] 状态变化触发适当更新

---

## 4. 用户场景

### 场景 1: 首次启动系统

```
用户启动 OriginOS
    ↓
系统初始化 Agent Registry
    ↓
自动注册 5 个默认 Agent（PM、架构师、UX 设计师、开发者、QA）
    ↓
所有 Agent 在 Dock 中显示为可用状态 (IDLE)
    ↓
用户可以通过 Dock 启动任何 Agent
```

### 场景 2: 动态注册 Agent

```
系统管理员添加新 Agent
    ↓
调用 registerAgent() API
    ↓
Agent 被添加到 Registry
    ↓
Agent 自动静出现在 Dock 中
    ↓
用户可以立即使用新 Agent
```

### 场景 3: Agent 状态监控

```
用户启动"开发者" Agent
    ↓
Agent 状态从 IDLE 变为 RUNNING
    ↓
Dock 中显示绿色指示灯
    ↓
Agent 运行中遇到错误
    ↓
状态变为 ERROR
    ↓
Dock 中显示红色指示灯
    ↓
用户查看错误并恢复
    ↓
状态恢复为 IDLE
```

---

## 5. 非功能需求

### 5.1 性能

| 指标 | 目标 |
|-----|------|
| 查询响应时间 | < 10ms |
| 状态更新延迟 | < 50ms |
| 注册新 Agent | < 20ms |
| 内存占用 | < 1MB (注册表) |

### 5.2 可扩展性

- 支持 100+ Agent 注册
- 支持自定义 Agent 类型扩展
- 支持动态 metadata 字段

### 5.3 可靠性

- 状态持久化 (localStorage)
- 异常恢复机制
- 错误提示清晰

---

## 6. 界面需求

### 6.1 Dock 显示

| 元素 | 显示规则 |
|------|---------|
| Agent 图标 | 32x32px，居中 |
| 指示灯 | 4x4px，绿色表示运行 |
| Tooltip | hover 显示 Agent 名称 |

### 6.2 状态视觉

| 状态 | 指示灯 | 描述 |
|------|-------|------|
| IDLE | 灰色 ⚪ | 空闲 |
| RUNNING | 绿色 🟢 | 运行中 |
| PAUSED | 橙色 🟡 | 暂停 |
| ERROR | 红色 🔴 | 错误 |
| UNREGISTERED | 黑色 ⚫ | 不可用 |

---

## 7. 数据需求

### 7.1 Agent 元数据

| 字段 | 类型 | 必需 | 示例 |
|-----|------|------|------|
| id | string | ✅ | "agent-pm-1" |
| name | string | ✅ | "pm-1" |
| displayName | string | ✅ | "产品经理" |
| type | AgentType | ✅ | AgentType.PM |
| status | AgentStatus | ✅ | AgentStatus.IDLE |
| icon | string | ✅ | "📋" |
| color | string | ✅ | "#EC4899" |
| capabilities | string[] | ✅ | ["planning", "requirements"] |
| metadata | Record<string, unknown> | ❌ | { version: "1.0" } |
| createdAt | number | ✅ | 1710000000000 |
| lastActivatedAt | number | ✅ | 1710000000000 |

### 7.2 数据持久化

- Registry 存储在 localStorage (`agent-registry`)
- 支持导入/导出 Agent 配置

---

## 8. 集成需求

### 8.1 与 Dock 集成

- Agent 转换为 Dock App 数据结构
- Agent 状态同步到 Dock 指示灯

### 8.2 与 Spotlight 集成 (OS.4)

- 支持按名称搜索 Agent
- 支持按类型过滤 Agent

### 8.3 与 Agent Windows 集成 (OS.5)

- Agent ID 作为窗口标识
- Agent 类型决定窗口样式

---

## 9. 测试需求

### 9.1 单元测试

- [ ] Registry 注册/注销
- [ ] 状态转换逻辑
- [ ] 类型过滤和搜索

### 9.2 集成测试

- [ ] 同步到 Dock
- [ ] 状态持久化
- [ ] 批量操作

### 9.3 E2E 测试

- [ ] 用户启动 Agent
- [ ] 状态变化显示
- [ ] 错误恢复流程

---

## 10. 变更历史

| 日期 | 版本 | 变更内容 | 变更人 |
|-----|------|----------|--------|
| 2026-03-07 | v1.0 | 初始版本 | Product Manager |

---

## 11. 附录

### 11.1 默认 Agents

```typescript
PM: "产品经理" 📋
ARCHITECT: "架构师" 🏗️
UX_DESIGNER: "UX 设计师" 🎨
DEVELOPER: "开发者" 💻
QA_ENGINEER: "QA 工程师" 🧪
```

### 11.2 术语表

| 术语 | 定义 |
|-----|------|
| Agent | 智能助手，可以执行特定任务 |
| Registry | Agent 注册表，管理所有 Agent |
| Capability | Agent 的能力或技能 |
| Status | Agent 的当前运行状态 |

---

**批准签名**：

- [ ] 产品经理 (PM)
- [ ] UX 设计师
- [ ] 系统架构师
- [ ] 开发负责人
