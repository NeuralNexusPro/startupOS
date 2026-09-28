# 测试文档 - Story {N}.{M}

**Story:** {Story Title}
**版本:** 1.0
**最后更新:** {Date}

---

## 🎯 测试目标

验证 Story {N}.{M} 的所有验收标准和功能需求已正确实现。

---

## 📋 测试策略

### 测试层级

```
┌─────────────────────────────────┐
│  E2E 测试 (End-to-End)          │  用户场景测试
└────────────┬────────────────────┘
             ↓
┌─────────────────────────────────┐
│  集成测试 (Integration)         │  模块间交互测试
└────────────┬────────────────────┘
             ↓
┌─────────────────────────────────┐
│  单元测试 (Unit)                │  函数/组件测试
└─────────────────────────────────┘
```

### 测试覆盖率目标

| 测试类型 | 覆盖率目标 | 当前覆盖率 |
|---------|-----------|-----------|
| 单元测试 | > 80% | {X}% |
| 集成测试 | > 60% | {X}% |
| E2E 测试 | 关键路径 100% | {X}% |

---

## 🧪 单元测试

### 测试框架

- **框架:** Vitest
- **断言库:** Vitest (内置)
- **Mock 库:** Vitest (内置)

### 测试用例 1: {功能描述}

**测试文件:** `src/lib/features/{feature-name}/__tests__/{module}.test.ts`

**测试代码:**
```typescript
import { describe, it, expect } from 'vitest';
import { functionName } from '../{module}';

describe('functionName', () => {
  it('should return expected result when given valid input', () => {
    // Arrange
    const input = { /* 测试数据 */ };

    // Act
    const result = functionName(input);

    // Assert
    expect(result).toEqual({ /* 期望结果 */ });
  });

  it('should throw error when given invalid input', () => {
    // Arrange
    const invalidInput = { /* 无效数据 */ };

    // Act & Assert
    expect(() => functionName(invalidInput)).toThrow('Error message');
  });
});
```

**覆盖的验收标准:**
- AC1: {验收标准描述}

### 测试用例 2: {功能描述}

**测试文件:** `src/lib/features/{feature-name}/__tests__/{module}-store.test.ts`

**测试代码:**
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFeatureStore } from '../{feature}-store';

describe('useFeatureStore', () => {
  beforeEach(() => {
    // 重置 store
    useFeatureStore.getState().reset();
  });

  it('should initialize with default state', () => {
    const { result } = renderHook(() => useFeatureStore());

    expect(result.current.data).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should update state when action is called', async () => {
    const { result } = renderHook(() => useFeatureStore());

    await act(async () => {
      await result.current.fetchData();
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeDefined();
  });
});
```

### 测试用例 3: React 组件测试

**测试文件:** `src/components/organisms/__tests__/ComponentName.test.tsx`

**测试代码:**
```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ComponentName } from '../ComponentName';

describe('ComponentName', () => {
  it('should render correctly', () => {
    render(<ComponentName prop1="value" />);

    expect(screen.getByText('Expected Text')).toBeInTheDocument();
  });

  it('should handle user interaction', () => {
    const onClickMock = vi.fn();
    render(<ComponentName onClick={onClickMock} />);

    const button = screen.getByRole('button');
    fireEvent.click(button);

    expect(onClickMock).toHaveBeenCalledTimes(1);
  });

  it('should display error state', () => {
    render(<ComponentName error="Error message" />);

    expect(screen.getByText('Error message')).toBeInTheDocument();
  });
});
```

---

## 🔗 集成测试

### 测试用例 1: {集成场景描述}

**测试文件:** `src/lib/features/{feature-name}/__tests__/integration.test.ts`

**测试代码:**
```typescript
import { describe, it, expect } from 'vitest';
import { moduleA } from '../module-a';
import { moduleB } from '../module-b';

describe('Feature Integration', () => {
  it('should integrate moduleA and moduleB correctly', async () => {
    // Arrange
    const dataFromA = await moduleA.getData();

    // Act
    const result = await moduleB.processData(dataFromA);

    // Assert
    expect(result).toBeDefined();
    expect(result.status).toBe('success');
  });
});
```

**覆盖的验收标准:**
- AC2: {验收标准描述}

### 测试用例 2: {集成场景描述}

**测试代码:**
```typescript
// 集成测试代码
```

---

## 🌐 E2E 测试

### 测试框架

- **框架:** Playwright
- **浏览器:** Chrome, Firefox, Safari

### 测试用例 1: {用户场景描述}

**测试文件:** `e2e/{feature-name}.spec.ts`

**测试代码:**
```typescript
import { test, expect } from '@playwright/test';

test.describe('Feature E2E', () => {
  test('should complete user flow successfully', async ({ page }) => {
    // 1. 导航到页面
    await page.goto('/');

    // 2. 执行用户操作
    await page.click('button[data-testid="action-button"]');

    // 3. 等待响应
    await page.waitForSelector('[data-testid="result"]');

    // 4. 验证结果
    const result = await page.textContent('[data-testid="result"]');
    expect(result).toBe('Expected Result');
  });

  test('should handle error scenario', async ({ page }) => {
    // 测试错误场景
  });
});
```

**覆盖的验收标准:**
- AC1: {验收标准描述}
- AC2: {验收标准描述}

---

## ⚡ 性能测试

### 性能指标

根据 AGENTS.md 第 6 章：

| 指标 | 约束 | 测试方法 |
|------|------|---------|
| {指标名称} | < {X} 秒 | {测试方法} |
| {指标名称} | < {X} 秒 | {测试方法} |

### 性能测试用例 1: {性能场景}

**测试代码:**
```typescript
import { describe, it, expect } from 'vitest';

describe('Performance Test', () => {
  it('should complete within performance constraint', async () => {
    const startTime = performance.now();

    // 执行操作
    await performanceFunction();

    const endTime = performance.now();
    const duration = endTime - startTime;

    // 验证性能约束
    expect(duration).toBeLessThan(5000); // < 5 秒
  });
});
```

---

## 📊 测试数据

### 测试数据集 1: {数据集名称}

**用途:** {用途描述}

**数据:**
```json
{
  "testData": [
    {
      "id": "test-1",
      "name": "Test Item 1",
      "value": 100
    },
    {
      "id": "test-2",
      "name": "Test Item 2",
      "value": 200
    }
  ]
}
```

### 测试数据集 2: {数据集名称}

**用途:** {用途描述}

**数据准备脚本:**
```typescript
export function generateTestData(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `test-${i}`,
    name: `Test Item ${i}`,
    value: i * 100,
  }));
}
```

---

## ✅ 验收标准测试

### AC1: {验收标准描述}

**Given** {前置条件}
**When** {用户操作}
**Then** {预期结果}

**测试步骤:**
1. {步骤 1}
2. {步骤 2}
3. {步骤 3}

**测试结果:** ✅ Pass / ❌ Fail

**测试证据:**
- 截图: `./assets/test-results/ac1-screenshot.png`
- 日志: `./assets/test-results/ac1-log.txt`

### AC2: {验收标准描述}

**Given** {前置条件}
**When** {用户操作}
**Then** {预期结果}

**测试步骤:**
1. {步骤 1}
2. {步骤 2}

**测试结果:** ✅ Pass / ❌ Fail

### AC3: {验收标准描述}

**测试步骤:**
1. {步骤 1}

**测试结果:** ✅ Pass / ❌ Fail

---

## 🐛 缺陷记录

### 缺陷 1: {缺陷标题}

**严重程度:** 🔴 Critical / 🟡 Major / 🟢 Minor

**描述:** {缺陷描述}

**复现步骤:**
1. {步骤 1}
2. {步骤 2}
3. {步骤 3}

**预期结果:** {预期结果}

**实际结果:** {实际结果}

**状态:** 🔴 Open / 🟡 In Progress / ✅ Fixed

**修复说明:** {修复说明}

---

## 🔄 回归测试

### 回归测试清单

- [ ] 所有单元测试通过
- [ ] 所有集成测试通过
- [ ] 所有 E2E 测试通过
- [ ] 性能测试通过
- [ ] 无新增缺陷
- [ ] 已修复缺陷验证通过

### 回归测试结果

| 测试类型 | 用例数 | 通过 | 失败 | 跳过 |
|---------|-------|------|------|------|
| 单元测试 | {N} | {N} | {N} | {N} |
| 集成测试 | {N} | {N} | {N} | {N} |
| E2E 测试 | {N} | {N} | {N} | {N} |

---

## 📝 测试执行记录

### 测试轮次 1

**日期:** {Date}
**测试人:** {Name}
**环境:** Development

**结果:**
- 单元测试: ✅ 通过
- 集成测试: ✅ 通过
- E2E 测试: ❌ 失败 (2 个用例)

**问题:**
- {问题描述}

**后续行动:**
- {行动项}

### 测试轮次 2

**日期:** {Date}
**测试人:** {Name}
**环境:** Staging

**结果:**
- 所有测试通过 ✅

---

## 🚀 测试命令

### 运行所有测试

```bash
npm run test
```

### 运行单元测试

```bash
npm run test:unit
```

### 运行集成测试

```bash
npm run test:integration
```

### 运行 E2E 测试

```bash
npm run test:e2e
```

### 生成覆盖率报告

```bash
npm run test:coverage
```

### 监听模式

```bash
npm run test:watch
```

---

## 📌 相关文档

- [Story README](./README.md)
- [需求文档](./requirements.md)
- [架构设计](./architecture.md)
- [开发文档](./implementation.md)
