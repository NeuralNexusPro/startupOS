# 测试文档 - Story 0.2

**Story:** 0.2 - CUI 与核心调度层连接
**版本:** 1.1
**最后更新:** 2026-03-03

---

## 📝 变更历史

| 日期 | 版本 | 变更内容 | 变更人 |
|------|------|---------|--------|
| 2026-03-03 | 1.0 | 初始版本，基础测试计划 | team-lead |
| 2026-03-03 | 1.1 | 补充异常、安全、性能、组件集成测试 | team-lead |

---

## 🧪 测试策略

### 测试层次

| 层次 | 目的 | 工具 |
|------|------|------|
| 单元测试 | 测试 Hook 逻辑 | Vitest + @testing-library/react-hooks |
| 集成测试 | 测试事件流转换 | Vitest + Mocks |
| 端到端测试 | 测试完整的用户交互 | Playwright (可选) |

---

## 📦 测试工具

| 工具 | 用途 | 版本 |
|------|------|------|
| Vitest | 测试框架 | 1.x |
| @testing-library/react-hooks | Hook 测试 | 最新 |
| @testing-library/react | 组件测试 | 最新 |
| @testing-library/user-event | 用户交互模拟 | 最新 |

---

## 📊 单元测试

### Hook 测试 (`use-pi-agent.test.ts`)

#### 测试套件 1: 初始化

**描述:** 验证 Hook 初始化和初始状态

**测试用例:**

1. **初始状态正确**
   - Given: 使用 `usePiAgent` Hook
   - When: Hook 挂载
   - Then: `state.messages` 为空数组
   - And: `state.isProcessing` 为 `false`

2. **Agent 初始化**
   - Given: Hook 挂载
   - When: Agent 初始化完成
   - Then: `agentRef` 不为 `null`

---

#### 测试套件 2: 消息发送

**描述:** 验证消息提交功能

**测试用例:**

1. **发送消息后添加到历史**
   - Given: Hook 已初始化
   - When: 调用 `sendMessage('Hello')`
   - Then: `messages` 包含用户消息
   - And: `isProcessing` 为 `true`

2. **消息内容正确**
   - Given: 发送消息
   - When: 调用 `sendMessage('Test')`
   - Then: 用户消息的 `content` 为 `'Test'`
   - And: `timestamp` 为有效 Date

3. **空消息处理**
   - Given: Hook 已初始化
   - When: 发送空字符串
   - Then: 不添加到历史或显示验证错误

---

#### 测试套件 3: 清空历史

**描述:** 验证清空消息历史功能

**测试用例:**

1. **清空所有消息**
   - Given: 消息历史有多个消息
   - When: 调用 `clearMessages()`
   - Then: `messages` 为空数组

2. **清空后状态重置**
   - Given: 正在处理中 (`isProcessing` 为 `true`)
   - When: 调用 `clearMessages()`
   - Then: `isProcessing` 重置为 `false`
   - And: `currentTool` 为 `undefined`

---

#### 测试套件 4: 事件处理

**描述:** 验证 Agent 事件到状态更新的转换

**测试用例:**

1. **message_start 更新状态**
   - Given: Hook 已初始化
   - When: 收到 `message_start` 事件
   - Then: `isProcessing` 为 `true`

2. **message_update 追加文本**
   - Given: 最后一条消息是 assistant 类型
   - When: 收到 `message_update` 事件（text: ' more'）
   - Then: 消息内容被追加 ' more'

3. **message_end 完成处理**
   - Given: 正在处理中
   - When: 收到 `message_end` 事件
   - Then: `isProcessing` 为 `false`

4. **tool_execution_start 显示工具**
   - Given: Hook 已初始化
   - When: 收到 `tool_execution_start`（toolName: 'read'）
   - Then: `currentTool.name` 为 `'read'`

5. **tool_execution_end 清除工具状态**
   - Given: `currentTool` 显示工具
   - When: 收到 `tool_execution_end`
   - Then: `currentTool` 重置为 `undefined`

6. **message_update 顺序保证**
   - Given: 快速接收多个 `message_update` 事件
   - When: 事件为 ['Hello', 'Hello ', 'Hello World']
   - Then: 消息内容按顺序正确更新

7. **Agent 断连处理**
   - Given: Hook 已初始化，与 Agent 连接正常
   - When: Agent 连接断开（网络异常、Agent 崩溃）
   - Then: 捕获错误并显示用户友好的错误提示
   - And: 状态重置为 `isProcessing: false`

---

## 🔗 集成测试

### 测试套件: 事件流集成

**描述:** 验证从 pi-agent 到 Hook 状态的完整事件流

**Mock 设置:**

```typescript
import { vi } from 'vitest';
import type { AgentEvent } from '@mariozechner/agent';

vi.mock('@mariozechner/agent', () => ({
  Agent: class MockAgent {
    state = {
      isStreaming: false,
      messages: [],
      pendingToolCalls: new Set(),
    };

    constructor(private opts: any) {}

    subscribe(callback: (event: AgentEvent) => () => {}) {
      // 模拟事件触发
      return () => {};
    }
  },
}));
```

**测试用例:**

1. **完整消息流**
   - Given: 用户发送消息
   - When: pi-agent 发送完整事件流
   - Then: 状态正确更新（处理开始 → 文本更新 → 处理结束）

2. **工具执行流**
   - Given: AI 调用工具
   - When: pi-agent 发送工具事件
   - Then: `currentTool` 正确显示和清除

### 测试套件: CUI 组件集成

**描述:** 验证 CUI 组件与 Hook 的完整集成

**测试用例:**

1. **CommandInterface 提交消息**
   - Given: CommandInterface 挂载并初始化
   - When: 用户在输入框输入消息并提交
   - Then: `sendMessage` 被正确调用
   - And: 消息添加到 `messages` 状态

2. **实时显示响应文本**
   - Given: 正在接收 `message_update` 事件
   - When: UI 渲染响应
   - Then: 文本实时更新到终端
   - And: 颜色和格式符合 ANSI 规范

3. **工具执行状态显示**
   - Given: 收到 `tool_execution_start` 事件
   - When: UI 渲染
   - Then: 显示 `🔧 执行工具: <名称>` 品红色文本
   - And: 工具完成时显示 `✓ 工具完成` 绿色文本

4. **错误状态显示**
   - Given: 收到错误事件或异常
   - When: UI 渲染
   - Then: 显示 `❌ 错误:` 红色文本
   - And: 提供可操作的建议

---

## ⏱️ 性能测试

### 测试套件: 响应时间

**约束:**
- 事件处理延迟 < 20ms
- 流式更新延迟 < 100ms

**测试用例:**

1. **事件处理延迟**
   ```typescript
   it('事件处理延迟 < 20ms', async () => {
     const { result } = renderHook(() => usePiAgent());
     const agent = result.current.agentRef.current;

     const start = performance.now();
     const unsubscribe = agent.subscribe(() => {
       const end = performance.now();
       expect(end - start).toBeLessThan(20);
     });

     unsubscribe();
   });
   ```

2. **流式更新延迟**
   - Given: 接收多个 `message_update` 事件
   - When: 模拟事件流
   - Then: 所有事件处理延迟 < 100ms

### 测试套件: 资源使用

**约束:**
- 内存占用 < 10MB（对话历史缓冲区）
- CPU 使用 < 5%（事件处理期间）

**测试用例:**

1. **内存占用测试**
   ```typescript
   it('内存占用 < 10MB', () => {
     // 模拟 100 条消息历史
     const messages = Array(100).fill(null).map((_, i) => ({
       type: 'user',
       content: 'test '.repeat(10),
       timestamp: new Date(),
     }));

     const { result } = renderHook(() => usePiAgent());
     act(() => {
       messages.forEach((msg) => result.current.sendMessage(msg.content));
     });

     // 测量内存（模拟或通过 Node.js heap snapshots）
     const memoryUsage = process.memoryUsage();
     expect(memoryUsage.heapUsed / 1024 / 1024).toBeLessThan(10);
   });
   ```

2. **CPU 使用测试**
   - Given: 连续触发 100 个事件
   - When: 测量 CPU 使用率
   - Then: CPU 使用 < 5%

3. **长对话内存泄漏测试**
   - Given: 发送和清空 10 轮对话
   - When: 检查内存是否释放
   - Then: 内存没有明显增长趋势

---

## 🚨 边界测试

### 测试套件: 边界条件

**测试用例:**

1.**长消息处理**
   - 发送 10000 字符的消息
   - 期望: 消息被截断或分块处理

2. **特殊字符**
   - 发送包含终端转义字符的消息
   - 期望: 消息被正确转义或过滤

3. **快速连续发送**
   - 快速发送多个消息
   - 期望: 所有消息按顺序处理

4. **Agent 未初始化**
   - 在 Agent 初始化前调用 **sendMessage**
   - 期望: 抛出错误或显示提示

---

## 🚨 异常场景测试

### 测试套件: 错误处理

**描述:** 验证各种异常情况下的错误处理和用户反馈

**测试用例:**

1. **核心调度层错误**
   - Given: Hook 已初始化，发送消息
   - When: pi-agent 返回错误（如 API 错误、配置错误）
   - Then: 捕获错误并显示 `❌ 错误:` 红色提示
   - And: 显示错误详情和可操作的建议
   - And: 状态重置为 `isProcessing: false`

2. **响应超时**
   - Given: 发送消息并等待响应
   - When: 超时时间（30秒）内未收到 `message_end`
   - Then: 显示 `⚠️ 响应超时，请重试` 黄色提示
   - And: 状态重置，允许用户重试

3. **网络断连**
   - Given: 正在接收流式响应
   - When: 网络连接中断
   - Then: 显示连接错误提示
   - And: 提供重连或重试选项

4. **无效事件类型**
   - Given: Hook 已初始化
   - When: 收到未定义的事件类型
   - Then: 忽略或记录警告日志
   - And: 不影响现有功能

5. **并发冲突**
   - Given: 快速发送多个消息
   - When: 响应顺序与发送顺序不一致
   - Then: 正确映射响应到对应消息
   - And: UI 显示正确

---

## 🔒 安全测试

### 测试套件: 输入安全

**描述:** 验证输入验证和安全防护

**测试用例:**

1. **最大长度限制**
   - Given: Hook 已初始化
   - When: 发送超过 10000 字符的消息
   - Then: 消息被截断或提示消息过长
   - And: 系统不崩溃

2. **命令注入防护**
   - Given: Hook 已初始化
   - When: 发送包含终端命令的消息（如 `; rm -rf ~`）
   - Then: 消息作为纯文本处理
   - And: 命令不被执行

3. **特殊字符转义**
   - Given: Hook 已初始化
   - When: 发送包含 ANSI 转义字符的消息
   - Then: 转义字符被正确处理
   - And: 显示为文本而非控制序列

4. **XSS 防护（前端）**
   - Given: Hook 返回响应消息
   - When: 响应包含 HTML/Script 标签
   - Then: 内容被转义
   - And: 不执行恶意脚本

5. **敏感信息过滤**
   - Given: Hook 收到包含 API Key、密码的响应
   - When: 响应返回
   - Then: 敏感信息被识别和过滤或显示警告

---

## 🤝 代码覆盖率

### 目标覆盖率

| 层次 | 目标覆盖率 |
|------|-----------|
| Hook 单元测试 | > 80% |
| 事件处理逻辑 | > 90% |
| 错误处理逻辑 | > 85% |
| 组件集成测试 | > 75% |
| 边界条件 | > 70% |
| 安全测试 | > 80% |

**覆盖率工具:** Vitest coverage

### 测试套件覆盖总结

| 测试套件 | 测试用例数 | 优先级 |
|---------|-----------|--------|
| Hook 初始化 | 2 | P0 |
| 消息发送 | 3 | P0 |
| 清空历史 | 2 | P0 |
| 事件处理 | 7 | P0 |
| 事件流集成 | 2 | P0 |
| CUI 组件集成 | 4 | P1 |
| 响应时间 | 2 | P1 |
| 资源使用 | 3 | P1 |
| 边界条件 | 4 | P1 |
| 错误处理 | 5 | P0 |
| 输入安全 | 5 | P0 |

---

## 📝 测试执行

### 运行命令

```bash
# 运行 Story 0.2 所有测试
npm test src/lib/integrations/pi-agent/hooks/__tests__

# 运行覆盖率
npm run test:coverage src/lib/integrations/pi-agent/hooks/

# 监听模式
npm test src/lib/integrations/pi-agent/hooks/ -- --watch
```

---

## 📌 相关文档

- **需求文档:** [requirements.md](./requirements.md)
- **架构设计:** [architecture.md](./architecture.md)
- **交互设计:** [interaction.md](./interaction.md)
- **前序依赖:** [Story 0.1 Testing](./story-0.1/testing.md)
- **代码规约:** [AGENTS.md](../../../AGENTS.md)
