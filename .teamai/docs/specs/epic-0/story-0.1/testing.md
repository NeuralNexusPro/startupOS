# 测试文档 - Story 0.1

**Story:** pi-agent-core集成基础
**版本:** 1.0
**最后更新:** 2026-03-03

---

## 🎯 测试目标

验证 Story 0.1 的所有验收标准和功能需求已正确实现：
- pi-agent-core 包成功集成
- Agent 生命周期正常运行 (init, start, stop)
- 通信协议正常工作
- 配置加载正确
- 健康检查可用

---

## 📋 测试策略

### 测试层级

```
┌─────────────────────────────────┐
│  集成测试 (Integration)         │  pi-agent-core 集成和通信测试
└────────────┬────────────────────┘
             ↓
┌─────────────────────────────────┐
│  单元测试 (Unit)                │  Agent 生命周期、配置、健康检查
└─────────────────────────────────┘
```

**注意:** Story 0.1 不涉及 UI，不需要 E2E 测试和 React 组件测试。

### 测试覆盖率目标

| 测试类型 | 覆盖率目标 | 当前覆盖率 |
|---------|-----------|-----------|
| 单元测试 | > 80% | 待执行 |
| 集成测试 | > 60% | 待执行 |

---

## 🧪 单元测试

### 测试框架

- **框架:** Vitest
- **断言库:** Vitest (内置)
- **Mock 库:** Vitest (内置)
- **环境:** jsdom

### 测试用例 1: Agent 生命周期管理

**测试文件:** `src/lib/integrations/pi-agent/__tests__/agent.test.ts`

**测试代码:**
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PiAgentManager, AgentStatus } from '../agent';
import { mockAgentConfig } from '../__mocks__/config';
import type { UserMessage } from '../types';

describe('PiAgentManager - Lifecycle', () => {
  let manager: PiAgentManager;

  beforeEach(() => {
    manager = new PiAgentManager(mockAgentConfig);
  });

  it('should initialize agent successfully', async () => {
    await expect(manager.initialize()).resolves.toBeUndefined();
    expect(manager.getStatus()).toBe(AgentStatus.Initializing);
  });

  it('should start agent after initialization', async () => {
    await manager.initialize();
    await expect(manager.start()).resolves.toBeUndefined();
    expect(manager.getStatus()).toBe(AgentStatus.Running);
  });

  it('should stop agent running', async () => {
    await manager.initialize();
    await manager.start();
    await expect(manager.stop()).resolves.toBeUndefined();
    expect(manager.getStatus()).toBe(AgentStatus.Stopped);
  });

  it('should throw error when starting before initialization', async () => {
    await expect(manager.push(() => manager.start())).rejects.toThrow('Agent not initialized');
  });

  it('should handle initialization failure gracefully', async () => {
    const invalidConfig = { ...mockAgentConfig, apiKey: null };
    const manager = new PiAgentManager(invalidConfig);

    await expect(manager.initialize()).rejects.toThrow('ConfigurationError');
  });

  it('should throw error when sending message before initialization', async () => {
    const message: UserMessage = {
      type: 'user_message',
      content: 'Hello',
      sessionId: 'test-session',
      timestamp: new Date()
    };

    await expect(() => manager.sendMessage(message)).rejects.toThrow('Agent not running');
  });
});

**覆盖的验收标准:**
- AC2: Agent 生命周期正常运行

### 测试用例 2: 配置加载和验证

**测试文件:** `src/lib/integrations/pi-agent/__tests__/config.test.ts`

**测试代码:**
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadAgentConfig, validateAgentConfig, PiAgentConfig } from '../config';
import type { Model } from '@mariozechner/pi-ai';

describe('Agent Config', () => {
  beforeEach(() => {
    // Mock environment variables
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test-123');
    vi.stubEnv('OPENAI_API_KEY', 'sk-test-456');
  });

  it('should load config from environment variables', async () => {
    const config = await loadAgentConfig();
    expect(config.apiKey).toBeDefined();
    expect(config.model).toBeDefined();
  });

  it('should validate valid config', () => {
    const config: Partial<PiAgentConfig> = {
      model: { id: 'claude-3-5-sonnet', provider: 'anthropic' },
    };

    const result = validateAgentConfig(config);
    expect(result.isValid).toBe(true);
  });

  it('should reject config without model', () => {
    const config: Partial<PiAgentConfig> = {};

    const result = validateAgentConfig(config);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('model is required');
  });

  it('should validate timeout constraints', () => {
    const config: Partial<PiAgentConfig> = {
      model: { id: 'claude-3-5-sonnet', provider: 'anthropic' },
      timeoutMs: 60001 // 超过最大值
    };

    const result = validateAgentConfig(config);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('timeoutMs must be between 1000 and 60000');
  });
});

**覆盖的验收标准:**
- AC4: 配置加载正确

### 测试用例 3: 通信协议

**测试文件:** `src/lib/integrations/pi-agent/__tests__/message.test.ts`

**测试代码:**
```typescript
import { describe, it, expect } from 'vitest';
import { validateMessage, createAgentResponse } from '../message';
import type { UserMessage, AgentResponse } from '../types';

describe('Agent Communication', () => {
  it('should validate valid user message', () => {
    const message: UserMessage = {
      type: 'user_message',
      content: 'Hello Agent',
      sessionId: 'test-session-001',
      timestamp: new Date()
    };

    expect(validateMessage(message)).toBe(true);
  });

  it('should reject message with missing required fields', () => {
    const invalidMessage = {
      type: 'user_message',
      // missing content, sessionId, timestamp
    };

    expect(validateMessage(invalidMessage)).toBe(false);
  });

  it('should reject message with empty sessionId', () => {
    const message: UserMessage = {
      type: 'user_message',
      content: 'Hello',
      sessionId: '', // empty
      timestamp: new Date()
    };

    expect(validateMessage(message)).toBe(false);
  });

  it('should reject message with sessionId exceeding max length', () => {
    const longSessionId = 'x'.repeat(129);
    const message: UserMessage = {
      type: 'user_message',
      content: 'Hello',
      sessionId: longSessionId,
      timestamp: new Date()
    };

    expect(validateMessage(message)).toBe(false);
  });

  it('should create agent response correctly', () => {
    const response = createAgentResponse({
      content: 'Agent response',
      sessionId: 'test-session-001',
      agentId: 'agent-001',
      timestamp: new Date()
    });

    expect(response.type).toBe('agent_response');
    expect(response.content).toBeDefined();
    expect(response.sessionId).toBe('test-session-001');
  });
});

**覆盖的验收标准:**
- AC3: 通信协议正常工作

### 测试用例 4: 健康检查

**测试文件:** `src/lib/integrations/pi-agent/__tests__/health.test.ts`

**测试代码:**
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PiAgentManager, AgentStatus } from '../agent';
import { mockAgentConfig } from '../__mocks__/config';
import { healthCheck } from '../health';

describe('Agent Health Check', () => {
  let manager: PiAgentManager;

  beforeEach(async () => {
    manager = new PiAgentManager(mockAgentConfig);
  });

  it('should return unhealthy status when agent not running', () => {
    const health = healthCheck(manager);
    expect(health.status).toBe('unhealthy');
  });

  it('should return healthy status when agent is running', async () => {
    await manager.initialize();
    await manager.start();

    const health = healthCheck(manager);
    expect(health.status).toBe('healthy');
    expect(health.uptime).toBeGreaterThan(0);
  });

  it('should return initializing status during initialization', async () => {
    const initPromise = manager.initialize();

    const health = healthCheck(manager);
    expect(health.status).toBe('initializing');

    await initPromise;
  });

  it('should measure uptime correctly', async () => {
    await manager.initialize();
    await manager.start();

    // Wait a short time
    await new Promise(resolve => setTimeout(resolve, 100));

    const health = healthCheck(manager);
    expect(health.uptime).toBeGreaterThan(50); // at least 50ms
  });

  it('should track messages processed', async () => {
    await manager.initialize();
    await manager.start();

    const message = {
      type: 'user_message',
      content: 'Test',
      sessionId: 'test',
      timestamp: new Date()
    };

    await manager.sendMessage(message);
    await manager.sendMessage(message);

    const health = healthCheck(manager);
    expect(health.messagesProcessed).toBe(2);
  });
});

**覆盖的验收标准:**
- AC5: 健康检查可用

---

## 🔗 集成测试

### 测试用例 1: 完整的 Agent 流程

**测试文件:** `src/lib/integrations/pi-agent/__tests__/integration.test.ts`

**测试代码:**
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PiAgentManager } from '../agent';

describe('Agent Integration', () => {
  beforeEach(() => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test-123');
  });

  it('should complete full agent lifecycle successfully', async () => {
    // given
    const config = {
      model: { id: 'claude-3-5-sonnet', provider: 'anthropic' },
      apiKey: 'sk-test-123',
    };
    const manager = new PiAgentManager(config);

    // when - initialize
    await manager.initialize();
    expect(manager.getStatus()).toBe(AgentStatus.Initializing);

    // when - start
    await manager.start();
    expect(manager.getStatus()).toBe(AgentStatus.Running);

    // when - send message
    const message = {
      type: 'user_message',
      content: 'Hello',
      sessionId: 'test-001',
      timestamp: new Date(),
    };
    const response = await manager.sendMessage(message);
    expect(response.type).toBe('agent_response');
    expect(response.content).toBeDefined();

    // when - health check
    const health = manager.healthCheck();
    expect(health.status).toBe('healthy');

    // when - stop
    await manager.stop();
    expect(manager.getStatus()).toBe(AgentStatus.Stopped);
  });

  it('should handle multiple sequential messages', async () => {
    const config = {
      model: { id: 'claude-3-5-sonnet', provider: 'anthropic' },
      apiKey: 'sk-test-123',
    };
    const manager = new PiAgentManager(config);

    await manager.initialize();
    await manager.start();

    // Send multiple messages
    const messages = [
      { type: 'user_message', content: 'Message 1', sessionId: 'test', timestamp: new Date() },
      { type: 'user_message', content: 'Message 2', sessionId: 'test', timestamp: new Date() },
      { type: 'user_message', content: 'Message 3', sessionId: 'test', timestamp: new Date() },
    ];

    for (const msg of messages) {
      const response = await manager.sendMessage(msg);
      expect(response.type).toBe('agent_response');
    }

    await manager.stop();
  });
});
```

**覆盖的验收标准:**
- AC2: Agent 生命周期正常运行
- AC3: 通信协议正常工作

---

## ⚡ 性能测试

### 性能指标

根据 AGENTS.md 第 6 章和 requirements.md：

| 指标 | 约束 | 测试方法 |
|------|------|---------|
| 初始化时间 | < 1 秒 | 使用 performance.now() 测量 |
| 消息路由时间 | < 100ms | 使用 performance.now() 测量 |
| 健康检查响应时间 | < 50ms | 使用 performance.now() 测量 |

### 性能测试用例 1: Agent 初始化性能

**测试代码:**
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PiAgentManager } from '../agent';
import { mockAgentConfig } from '../__mocks__/config';

describe('Agent Performance - Initialization', () => {
  beforeEach(() => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test-123');
  });

  it('should complete initialization within 1 second', async () => {
    const manager = new PiAgentManager(mockAgentConfig);

    const startTime = performance.now();
    await manager.initialize();
    const endTime = performance.now();

    const duration = endTime - startTime;
    expect(duration).toBeLessThan(1000);
    console.log(`Initialization completed in ${duration}ms`);
  });
});
```

### 性能测试用例 2: 消息路由性能

**测试代码:**
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PiAgentManager } from '../agent';
import { mockAgentConfig } from '../__mocks__/config';

describe('Agent Performance - Message Routing', () => {
  beforeEach(async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test-123');
  });

  it('should route message within 100ms', async () => {
    const manager = new PiAgentManager(mockAgentConfig);
    await manager.initialize();
    await manager.start();

    const message = {
      type: 'user_message',
      content: 'Test',
      sessionId: 'test',
      timestamp: new Date(),
    };

    const startTime = performance.now();
    const response = await manager.sendMessage(message);
    const endTime = performance.now();

    const duration = endTime - startTime;
    expect(duration).toBeLessThan(100);
    console.log(`Message routed in ${duration}ms`);

    await manager.stop();
  });
});
```

### 性能测试用例 3: 健康检查性能

**测试代码:**
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PiAgentManager } from '../agent';
import { mockAgentConfig } from '../__mocks__/config';
import { healthCheck } from '../health';

describe('Agent Performance - Health Check', () => {
  beforeEach(async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test-123');
  });

  it('should complete health check within 50ms', async () => {
    const manager = new PiAgentManager(mockAgentConfig);
    await manager.initialize();
    await manager.start();

    const startTime = performance.now();
    const health = healthCheck(manager);
    const endTime = performance.now();

    const duration = endTime - startTime;
    expect(duration).toBeLessThan(50);
    console.log(`Health check completed in ${duration}ms`);

    await manager.stop();
  });

  it('should complete health check within 50ms when not initialized', () => {
    const manager = new PiAgentManager(mockAgentConfig);

    const startTime = performance.now();
    const health = healthCheck(manager);
    const endTime = performance.now();

    const duration = endTime - startTime;
    expect(duration).toBeLessThan(50);
  });
});
```

---

## 🐛 边界测试

### 测试用例 1: 空消息处理

**测试代码:**
```typescript
import { describe, it, expect } from 'vitest';
import { validateMessage } from '../message';

describe('Boundary Tests - Empty Messages', () => {
  it('should reject empty message content', () => {
    const message = {
      type: 'user_message',
      content: '', // empty
      sessionId: 'test',
      timestamp: new Date(),
    };

    expect(validateMessage(message)).toBe(false);
  });

  it('should reject message with only whitespace', () => {
    const message = {
      type: 'user_message',
      content: '   ', // only whitespace
      sessionId: 'test',
      timestamp: new Date(),
    };

    expect(validateMessage(message)).toBe(false);
  });
});
```

### 测试用例 2: 配置缺失场景

**测试代码:**
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadAgentConfig, validateAgentConfig } from '../config';
import { ConfigurationError } from '../errors';

describe('Boundary Tests - Missing Config', () => {
  beforeEach(() => {
    // Clear environment variables
    delete process.env.ANTHROPIC_API_KEY;
    vi.clearAllMocks();
  });

  it('should throw ConfigurationError when API key missing', async () => {
    await expect(loadAgentConfig()).rejects.toThrow(ConfigurationError);
  });

  it('should fail validation with missing model', () => {
    const config = {};
    const result = validateAgentConfig(config);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('model is required');
  });

  it('should use default values for optional config', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test');

    const config = await loadAgentConfig();
    expect(config.maxRetries).toBeDefined();
    expect(config.timeoutMs).toBeDefined();
  });
});
```

### 测试用例 3: 初始化超时

**测试代码:**
```typescript
import { describe, it, expect, beforeEach, vi, useFakeTimers } from 'vitest';
import { PiAgentManager } from '../agent';
import { InitializationError } from '../errors';
import { mockAgentConfig } from '../__mocks__/config';

describe('Boundary Tests - Initialization Timeout', () => {
  beforeEach(() => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test-123');
  });

  it('should throw InitializationError when initialization times out', async () => {
    const timeoutConfig = {
      ...mockAgentConfig,
      timeoutMs: 100, // 100ms timeout
    };
    const manager = new PiAgentManager(timeoutConfig);

    // Mock slow initialization
    vi.spyOn(manager, 'initialize').mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 200)); // 200ms delay
    });

    await expect(manager.start()).rejects.toThrow(InitializationError);
  });
});
```

### 测试用例 4: 并发消息处理

**测试代码:**
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PiAgentManager } from '../agent';
import { mockAgentConfig } from '../__mocks__/config';

describe('Boundary Tests - Concurrent Messages', () => {
  beforeEach(async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test-123');
  });

  it('should handle concurrent message processing', async () => {
    const config = {
      ...mockAgentConfig,
      maxConcurrent: 5,
    };
    const manager = new PiAgentManager(config);

    await manager.initialize();
    await manager.start();

    // Send 10 concurrent messages
    const messages = Array.from({ length: 10 }, (_, i) => ({
      type: 'user_message' as const,
      content: `Concurrent message ${i}`,
      sessionId: 'test',
      timestamp: new Date(),
    }));

    const promises = messages.map(msg => manager.sendMessage(msg));
    const responses = await Promise.all(promises);

    // All responses should be valid
    responses.forEach(response => {
      expect(response.type).toBe('agent_response');
      expect(response.content).toBeDefined();
    });

    await manager.stop();
  });

  it('should limit concurrent messages to max', async () => {
    const config = {
      ...mockAgentConfig,
      maxConcurrent: 2,
    };
    const manager = new PiAgentManager(config);

    await manager.initialize();
    await manager.start();

    // Send 5 messages
    const messages = Array.from({ length: 5 }, (_, i) => ({
      type: 'user_message' as const,
      content: `Message ${i}`,
      sessionId: 'test',
      timestamp: new Date(),
    }));

    const promises = messages.map(msg => manager.sendMessage(msg));
    const start = Date.now();
    await Promise.all(promises);
    const duration = Date.now() - start;

    // Should take longer due to concurrency limit
    expect(duration).toBeGreaterThan(0);

    await manager.stop();
  });
});
```

---

## ✅ 验收标准测试

### AC1: pi-agent-core 包成功集成

**Given** OriginOS 项目已初始化
**When** 开发者安装 pi-agent-core 依赖 `npm install @mariozechner/pi-coding-agent`
**Then** 包成功安装到 node_modules
**And** TypeScript 可以正确导入 pi-agent-core 的类型定义
**And** 无编译错误或类型错误

**测试步骤:**
1. 运行 `npm install @mariozechner/pi-coding-agent`
2. 运行 `npm run type-check` 验证类型

**覆盖位置:**
- 单元测试: `agent.test.ts` 中的 import 测试

### AC2: Agent 生命周期正常运行

**Given** pi-agent-core 已集成
**When** 调用 Agent 初始化方法
**Then** Agent 状态变为 "initialized"
**And** 初始化时间 < 1 秒

**Given** Agent 已初始化
**When** 调用 Agent 启动方法
**Then** Agent 状态变为 "running"
**And** Agent 可以接收和处理消息

**Given** Agent 正在运行
**When** 调用 Agent 停止方法
**Then** Agent 状态变为 "stopped"
**And** 所有资源被正确释放
**And** 无内存泄漏

**测试文件:** `src/lib/integrations/pi-agent/__tests__/agent.test.ts`

**测试结果:** ⏳ 待执行 (架构完成后执行)

### AC3: 通信协议正常工作

**Given** Agent 正在运行
**When** OriginOS 发送测试消息到 Agent
**Then** Agent 接收到消息
**And** 消息格式符合协议定义
**And** 消息路由时间 < 100ms

**Given** Agent 处理消息
**When** Agent 发送响应事件
**Then** OriginOS 接收到事件
**And** 事件数据结构正确
**And** 事件类型可识别

**测试文件:** `src/lib/integrations/pi-agent/__tests__/message.test.ts`, `agent.test.ts`

**测试结果:** ⏳ 待执行

### AC4: 配置加载正确

**Given** 配置文件存在于指定路径
**When** Agent 初始化时加载配置
**Then** 配置参数被正确读取
**And** 必需的配置项存在（如 LLM 模型、API 密钥）
**And** 可选配置项使用默认值

**Given** 配置文件不存在或格式错误
**When** Agent 初始化时加载配置
**Then** 抛出清晰的错误信息
**And** 错误信息指明缺失的配置项

**测试文件:** `src/lib/integrations/pi-agent/__tests__/config.test.ts`

**测试结果:** ⏳ 待执行

### AC5: 健康检查可用

**Given** Agent 正在运行
**When** 调用健康检查接口
**Then** 返回 Agent 状态信息
**And** 包含运行时长、内存使用、消息处理数量等指标
**And** 健康检查响应时间 < 50ms

**Given** Agent 未运行或异常
**When** 调用健康检查接口
**Then** 返回错误状态
**And** 包含错误原因和建议操作

**测试文件:** `src/lib/integrations/pi-agent/__tests__/health.test.ts`

**测试结果:** ⏳ 待执行

---

## 🚀 测试命令

### 运行所有测试

```bash
npm run test
```

### 运行特定测试文件

```bash
npm run test -- agent.test.ts
npm run test -- config.test.ts
npm run test -- health.test.ts
npm run test -- integration.test.ts
```

### 运行性能测试

```bash
npm run test -- --grep "Agent Performance"
```

### 生成覆盖率报告

```bash
npm run test:coverage
```

### 运行边界测试

```bash
npm run test -- --grep "Boundary Tests"
```

---

## 📝 测试执行记录

### 当前状态

**日期:** 2026-03-03
**架构设计:** ✅ 已完成
**测试计划:** ✅ 已编写
**测试实现:** ⏳ 待代码实施后执行

---

## 📌 相关文档

- [Story README](./README.md)
- [需求文档](./requirements.md)
- [架构设计](./architecture.md)
- [AGENTS.md](../../../AGENTS.md)

---

**测试计划完成！** 🧪
