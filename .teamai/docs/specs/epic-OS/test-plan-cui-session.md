# CUI 会话模块测试计划

**测试 ID:** TEST-CUI-001
**创建日期:** 2026-03-16
**负责人:** QA Engineer
**状态:** 准备中

---

## 1. 测试范围

### 1.1 测试目标

验证 CUI (Command User Interface) 会话模块正确集成 pi-agent 核心，实现真实的 Agent 对话功能。

### 1.2 测试层级

| 层级 | 覆盖范围 | 优先级 |
|------|----------|--------|
| 单元测试 | 组件独立功能 | P0 |
| 集成测试 | pi-agent Hook 集成 | P0 |
| E2E 测试 | 完整对话流程 | P1 |

### 1.3 不在范围内

- pi-agent 核心功能（已有独立测试套件，435 tests passing）
- AppWindow 系统功能（已在 Story OS.1-OS.4 测试）

---

## 2. 测试用例

### 2.1 AgentDialogContent 组件测试

#### TC-CUI-001: 组件渲染
- **描述**: 验证 AgentDialogContent 正确渲染
- **前置条件**: agentId 有效
- **步骤**:
  1. 渲染组件
  2. 验证 agent 名称显示
  3. 验证状态指示器显示
- **预期结果**: 显示正确的 agent 信息

#### TC-CUI-002: Agent 初始化
- **描述**: 验证 usePiAgent 正确初始化
- **前置条件**: 组件首次挂载
- **步骤**:
  1. 挂载组件
  2. 等待初始化完成
  3. 验证 isInitialized = true
- **预期结果**: Agent 状态变为 RUNNING

#### TC-CUI-003: 消息发送
- **描述**: 验证消息发送流程
- **前置条件**: Agent 已初始化
- **步骤**:
  1. 输入消息
  2. 点击发送按钮
  3. 验证 sendMessage 被调用
  4. 验证消息添加到列表
- **预期结果**: 消息成功发送，列表更新

#### TC-CUI-004: 思考状态显示
- **描述**: 验证思考状态正确显示
- **前置条件**: Agent 处理中
- **步骤**:
  1. 发送消息
  2. 验证 isThinking = true
  3. 验证 UI 显示 "思考中..."
- **预期结果**: 正确显示思考状态

#### TC-CUI-005: 错误处理
- **描述**: 验证错误状态显示
- **前置条件**: 发生错误
- **步骤**:
  1. Mock pi-agent 抛出错误
  2. 验证错误消息显示
  3. 验证 Agent 状态为 ERROR
- **预期结果**: 显示错误信息

#### TC-CUI-006: Agent 不存在
- **描述**: 验证无效 agentId 处理
- **前置条件**: agentId 无效
- **步骤**:
  1. 渲染组件使用无效 ID
  2. 验证显示 "Agent not found"
- **预期结果**: 显示友好错误提示

---

### 2.2 MessageList 组件测试

#### TC-CUI-010: 空消息状态
- **描述**: 无消息时显示提示
- **预期结果**: 显示 "开始对话..."

#### TC-CUI-011: 消息列表渲染
- **描述**: 正确渲染消息列表
- **步骤**:
  1. 传入多条消息
  2. 验证消息顺序
  3. 验证用户/助手消息样式区分
- **预期结果**: 消息正确显示

#### TC-CUI-012: 自动滚动
- **描述**: 新消息自动滚动到底部
- **步骤**:
  1. 添加新消息
  2. 验证滚动位置
- **预期结果**: 自动滚动到底部

#### TC-CUI-013: 加载状态
- **描述**: isLoading 时显示加载动画
- **预期结果**: 显示思考动画

---

### 2.3 ChatInput 组件测试

#### TC-CUI-020: 输入功能
- **描述**: 正确处理用户输入
- **步骤**:
  1. 输入文本
  2. 验证状态更新
- **预期结果**: 输入值正确

#### TC-CUI-021: 发送消息
- **描述**: 点击发送或回车发送
- **步骤**:
  1. 输入文本
  2. 按 Enter 或点击发送
  3. 验证 onSend 被调用
  4. 验证输入框清空
- **预期结果**: 消息发送，输入清空

#### TC-CUI-022: 禁用状态
- **描述**: disabled 时禁用输入
- **步骤**:
  1. 设置 disabled=true
  2. 验证输入框禁用
  3. 验证按钮禁用
- **预期结果**: 无法输入或发送

#### TC-CUI-023: 空消息验证
- **描述**: 空消息不能发送
- **步骤**:
  1. 输入空格
  2. 尝试发送
- **预期结果**: onSend 不被调用

---

### 2.4 StatusIndicator 组件测试

#### TC-CUI-030: 各状态显示
- **描述**: 正确显示所有状态
- **测试矩阵**:
  | 状态 | 预期显示 |
  |------|----------|
  | RUNNING | "● 在线" (绿色) |
  | IDLE | "○ 空闲" (灰色) |
  | ERROR | "⚠ 错误" (红色) |
  | 思考中 | "思考中..." (蓝色动画) |

---

### 2.5 集成测试

#### TC-CUI-INT-001: 完整对话流程
- **描述**: 端到端对话测试
- **步骤**:
  1. 打开 Agent 对话窗口
  2. 等待初始化
  3. 发送消息
  4. 接收回复
  5. 验证对话历史
- **预期结果**: 完整对话流程正常

#### TC-CUI-INT-002: 多 Agent 并发
- **描述**: 多个 Agent 同时运行
- **步骤**:
  1. 打开 Agent A 对话
  2. 打开 Agent B 对话
  3. 分别发送消息
  4. 验证独立响应
- **预期结果**: Agent 之间互不干扰

#### TC-CUI-INT-003: 窗口管理集成
- **描述**: 与 AppWindow 系统集成
- **步骤**:
  1. 打开对话窗口
  2. 最小化
  3. 恢复
  4. 验证状态保持
- **预期结果**: 窗口操作正常，状态保持

---

## 3. 测试数据

### 3.1 Mock Agent 数据

```typescript
const mockAgent = {
  id: 'test-agent-001',
  displayName: 'Test Assistant',
  icon: '🤖',
  status: AgentStatus.IDLE,
};

const mockMessages = [
  { id: '1', role: 'assistant', content: '你好！有什么可以帮助你的？' },
  { id: '2', role: 'user', content: '测试消息' },
];
```

### 3.2 Mock PiAgent Hook

```typescript
// 使用现有的 usePiAgent 测试 mock
// 参考: src/lib/integrations/pi-agent/hooks/__tests__/use-pi-agent.test.ts
```

---

## 4. 测试环境

### 4.1 依赖

- React Testing Library
- Vitest
- MSW (可选，用于 API mock)

### 4.2 配置

```typescript
// vitest.config.ts 已配置
// setupFiles: ['./src/__tests__/setup.ts']
```

---

## 5. 验收标准

### 5.1 必须通过

- [ ] 所有单元测试通过 (目标: >20 tests)
- [ ] 所有集成测试通过 (目标: >5 tests)
- [ ] 点击 Dock 图标打开 Agent 对话窗口
- [ ] 可以发送消息并收到回复
- [ ] 显示 Agent 思考状态
- [ ] 显示错误状态

### 5.2 性能要求

| 指标 | 要求 |
|------|------|
| 组件渲染时间 | < 100ms |
| 消息发送响应 | < 50ms |
| 初始化时间 | < 2s |

---

## 6. 测试文件结构

```
src/components/os/agent-dialog/
├── AgentDialogContent.tsx
├── __tests__/
│   ├── AgentDialogContent.test.tsx
│   ├── MessageList.test.tsx
│   ├── ChatInput.test.tsx
│   └── StatusIndicator.test.tsx
├── MessageList.tsx
├── ChatInput.tsx
└── StatusIndicator.tsx
```

---

## 7. 依赖测试

### 7.1 pi-agent 测试状态

**已验证**: ✅ 435 tests passing

覆盖范围:
- usePiAgent Hook
- session-store
- message handling
- error handling
- intent understanding
- tool execution
- health check

### 7.2 AppWindow 测试状态

**已验证**: ✅ Story OS.1-OS.4 tests passing

---

## 8. 执行时间表

| 阶段 | 时间 | 负责人 |
|------|------|--------|
| 组件开发完成 | 待定 | Developer |
| 单元测试编写 | 开发完成后 1 天 | QA |
| 集成测试执行 | 单元测试后 0.5 天 | QA |
| E2E 测试 | 集成测试后 0.5 天 | QA |
| Bug 修复验证 | 持续 | Developer + QA |

---

## 9. 风险

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| pi-agent 集成问题 | 低 | 高 | 已有完整测试套件 |
| 异步状态测试困难 | 中 | 中 | 使用 act + waitFor |
| Mock 配置复杂 | 低 | 低 | 复用现有 setup |

---

**审批状态:**

- [ ] Architect 确认测试范围
- [ ] Developer 确认测试可行性
- [ ] PM 确认验收标准
