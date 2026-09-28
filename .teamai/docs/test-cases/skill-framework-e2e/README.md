# E2E 测试文档 - Skill 框架

**Task:** Skill 框架 E2E 测试 (Task #15)
**版本:** 1.0
**创建日期:** 2026-03-24

---

## 🎯 测试目标

验证 Skill 框架的端到端功能，确保技能加载、执行和用户交互流程正确工作。

---

## 📋 测试覆盖范围

### 1. 技能加载测试
- 验证技能从不同源正确加载
- 测试技能名称冲突处理
- 验证技能 frontmatter 解析
- 测试 .gitignore 规则

### 2. 技能执行流程测试
- API 端点功能验证
- 技能启动/消息/完成流程
- 会话状态管理
- 错误处理

### 3. project-initialization skill 测试
- 完整的项目初始化流程
- 用户输入收集
- 文件生成验证

### 4. 性能测试
- 技能加载时间 < 1s
- 技能执行响应时间 < 2s

---

## 📊 测试策略

### 测试层级

```
┌─────────────────────────────────┐
│  E2E 测试 (Playwright)          │  完整用户交互流程
└────────────┬────────────────────┘
             ↓
┌─────────────────────────────────┐
│  集成测试 (Vitest)              │  组件↔API↔服务集成
└────────────┬────────────────────┘
             ↓
┌─────────────────────────────────┐
│  单元测试 (Vitest)              │  服务层和工具函数
└─────────────────────────────────┘
```

### 测试覆盖率目标

| 测试类型 | 覆盖率目标 | 测试用例数 |
|---------|-----------|-----------|
| E2E 测试 | 关键路径 100% | 8 |
| 集成测试 | > 80% | 5 |
| 单元测试 | > 85% | 4 |
| 性能测试 | 关键场景 100% | 2 |

---

## 🧧 依赖关系

```
#14 (API 端点) ← 阻塞 ← #15 (E2E 测试)
#16 (UI 组件) ← 阻塞 ← #15 (E2E 测试)
```

---

## 🎭 E2E 测试用例

### TC-SKILL-E2E-001: 技能列表加载

**测试目标:** 验证技能列表正确加载和显示

**优先级:** 🔴 P0 (Critical)

**前置条件:** #14 API 端点已完成

**测试步骤:**
1. 打开应用
2. 导航到技能选择界面
3. 验证显示的技能列表

**预期结果:**
- 显示所有可用的技能
- 技能名称正确
- 技能描述正确显示
- 技能状态（启用/禁用）正确显示

**测试代码 (Playwright):**
```typescript
import { test, expect } from '@playwright/test';

test('should load and display skill list', async ({ page }) => {
  await page.goto('/skills');

  // 等待技能列表加载
  await page.waitForSelector('[data-testid="skill-list"]');

  // 验证技能存在
  await expect(page.locator('text=project-initialization')).toBeVisible();
  await expect(page.locator('text=OriginOS 项目访谈 Skill')).toBeVisible();

  // 验证技能状态显示
  const skillCard = page.locator('[data-testid="skill-card"][data-name="project-initialization"]');
  await expect(skillCard).toHaveAttribute('data-enabled', 'true');
});
```

---

### TC-SKILL-E2E-002: 启动技能会话

**测试目标:** 验证技能会话启动流程

**优先级:** 🔴 P0 (Critical)

**前置条件:** #14 和 #16 已完成

**测试步骤:**
1. 选择一个技能
2. 点击"开始"按钮
3. 验证会话创建
4. 验证初始欢迎消息显示

**预期结果:**
- 会话 ID 正确生成
- 技能欢迎消息显示
- 界面进入对话状态
- 技能进度指示器显示

**测试代码 (Playwright):**
```typescript
test('should start skill session', async ({ page }) => {
  await page.goto('/skills');

  // 选择技能
  await page.click('[data-testid="skill-card"][data-name="project-initialization"]');
  await page.click('button:has-text("开始")');

  // 验证会话创建
  await page.waitForSelector('[data-testid="skill-chat-view"]');
  await expect(page.locator('[data-testid="session-id"]')).not.toHaveValue('');

  // 验证欢迎消息
  await expect(page.locator('text=欢迎！我很高兴帮助您开始新的项目')).toBeVisible();
});
```

---

### TC-SKILL-E2E-003: 技能对话交互

**测试目标:** 验证与技能的对话交互

**优先级:** 🔴 P0 (Critical)

**前置条件:** #14 和 #16 已完成

**测试步骤:**
1. 启动 project-initialization 技能
2. 选择一个初始选项
3. 输入回答
4. 验证后续问题显示

**预期结果:**
- 用户选择正确被记录
- 技能根据选择给出正确响应
- 对话历史正确显示

**测试代码 (Playwright):**
```typescript
test('should handle skill interaction with options', async ({ page }) => {
  await page.goto('/skills');
  await page.click('[data-testid="skill-card"][data-name="project-initialization"]');
  await page.click('button:has-text("开始")');

  // 选择选项
  await page.click('button:has-text("🔍 从具体场景开始")');

  // 验证响应
  await expect(page.locator('text=具体场景最能帮助我们理解您的需求')).toBeVisible();

  // 输入回答
  const chatInput = page.locator('[data-testid="chat-input"]');
  await chatInput.fill('我想做一个让小商家更容易在线卖东西的平台');
  await page.click('button:has-text("发送")');

  // 验证追问问题
  await expect(page.locator('text=您提到')).toBeVisible();
});
```

---

### TC-SKILL-E2E-004: 完成技能执行

**测试目标:** 验证技能完成和结果生成

**优先级:** 🟡 P1 (High)

**前置条件:** #14 和 #16 已完成

**测试步骤:**
1. 完成完整的技能对话
2. 点击"完成"按钮
3. 验证结果生成

**预期结果:**
- 技能执行正确结束
- 业务模型 JSON 正确生成
- 下载链接可用

**测试代码 (Playwright):**
```typescript
test('should complete skill and generate output', async ({ page }) => {
  // ... 完整对话流程 ...

  // 点击完成
  await page.click('button:has-text("💾 保存为项目")');

  // 验证结果
  await page.waitForSelector('[data-testid="skill-result"]');
  await expect(page.locator('[data-testid="download-json"]')).toBeVisible();

  // 验证 JSON 内容
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('[data-testid="download-json"]')
  ]);
  await download.saveAs('/tmp/project-model.json');

  // 验证文件内容
  const content = await fs.promises.readFile('/tmp/project-model.json', 'utf-8');
  const model = JSON.parse(content);
  expect(model).toHaveProperty('projectName');
  expect(model).toHaveProperty('entities');
});
```

---

### TC-SKILL-E2E-005: 取消技能会话

**测试目标:** 验证技能取消功能

**优先级:** 🟡 P1 (High)

**前置条件:** #14 和 #16 已完成

**测试步骤:**
1. 启动技能会话
2. 点击"取消"按钮
3. 验证会话终止

**预期结果:**
- 会话被取消
- 状态正确更新
- 用户返回到技能列表

**测试代码 (Playwright):**
```typescript
test('should cancel skill session', async ({ page }) => {
  await page.goto('/skills');
  await page.click('[data-testid="skill-card"][data-name="project-initialization"]');
  await page.click('button:has-text("开始")');

  // 获取会话 ID
  const sessionId = await page.locator('[data-testid="session-id"]').inputValue();

  // 取消会话
  await page.click('button:has-text("取消")');

  // 验证返回技能列表
  await expect(page.locator('[data-testid="skill-list"]')).toBeVisible();

  // 验证会话状态
  const response = await page.request.post('/api/skills/status', {
    data: { sessionId }
  });
  const status = await response.json();
  expect(status.status).toBe('cancelled');
});
```

---

### TC-SKILL-E2E-006: 技能搜索和过滤

**测试目标:** 验证技能搜索和过滤功能

**优先级:** 🟢 P2 (Medium)

**前置条件:** #14 和 #16 已完成

**测试步骤:**
1. 打开技能列表
2. 输入搜索关键词
3. 验证搜索结果

**预期结果:**
- 搜索结果正确显示
- 无结果时显示空状态

**测试代码 (Playwright):**
```typescript
test('should filter skills by search', async ({ page }) => {
  await page.goto('/skills');

  // 搜索技能
  const searchInput = page.locator('[data-testid="skill-search"]');
  await searchInput.fill('project');

  // 验证搜索结果
  await expect(page.locator('[data-testid="skill-card"]')).toHaveCount(1);
  await expect(page.locator('text=project-initialization')).toBeVisible();

  // 清空搜索
  await searchInput.fill('');
  await expect(page.locator('[data-testid="skill-card"]')).toHaveCountGreaterThan(1);
});
```

---

### TC-SKILL-E2E-007: 技能错误处理

**测试目标:** 验证技能执行中的错误处理

**优先级:** 🟡 P1 (High)

**前置条件:** #14 和 #16 已完成

**测试步骤:**
1. 启动技能会话
2. 触发错误条件（如网络超时）
3. 验证错误提示

**预期结果:**
- 错误提示友好显示
- 用户可以重试或取消
- 会话状态正确恢复

**测试代码 (Playwright):**
```typescript
test('should handle skill errors gracefully', async ({ page, context }) => {
  // Mock API 错误
  await context.route('**/api/skills/*/message', route => {
    route.fulfill({ status: 500, body: 'Internal Server Error' });
  });

  await page.goto('/skills');
  await page.click('[data-testid="skill-card"][data-name="project-initialization"]');
  await page.click('button:has-text("开始")');

  // 输入消息触发错误
  await page.fill('[data-testid="chat-input"]', 'test message');
  await page.click('button:has-text("发送")');

  // 验证错误提示
  await expect(page.locator('text=发送失败')).toBeVisible();
  await expect(page.locator('button:has-text("重试")')).toBeVisible();
});
```

---

### TC-SKILL-E2E-008: 技能性能测试

**测试目标:** 验证技能执行性能指标

**优先级:** 🟢 P2 (Medium)

**前置条件:** #14 和 #16 已完成

**测试步骤:**
1. 测量技能加载时间
2. 测量技能响应时间

**预期结果:**
- 技能加载 < 1s
- 技能响应 < 2s

**测试代码 (Playwright):**
```typescript
test('should meet performance requirements', async ({ page }) => {
  // 测量列表加载时间
  const startLoad = Date.now();
  await page.goto('/skills');
  await page.waitForSelector('[data-testid="skill-list"]');
  const loadTime = Date.now() - startLoad;

  expect(loadTime).toBeLessThan(1000);

  // 启动技能并测量响应时间
  await page.click('[data-testid="skill-card"][data-name="project-initialization"]');
  const startResponse = Date.now();
  await page.click('button:has-text("开始")');
  await page.waitForSelector('[data-testid="skill-chat-view"]');
  const responseTime = Date.now() - startResponse;

  expect(responseTime).toBeLessThan(2000);
});
```

---

## 🔌 集成测试

### TC-SKILL-INT-001: Skills API 集成

**测试文件:** `src/app/api/skills/__tests__/route.test.ts`

**测试目标:** 验证技能 API 端点正确响应

**测试代码 (Vitest):**
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from '../route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/integrations/pi-agent/core/skills.middleware');

describe('Skill API Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET /api/skills/list should return available skills', async () => {
    const request = new NextRequest(new URL('http://localhost/api/skills/list'));
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.skills).toBeInstanceOf(Array);
    expect(data.skills).toContainEqual(
      expect.objectContaining({
        name: 'project-initialization',
        enabled: true
      })
    );
  });

  it('POST /api/skills/:name/start should create session', async () => {
    const request = new NextRequest(
      new URL('http://localhost/api/skills/project-initialization/start'),
      {
        method: 'POST',
        body: JSON.stringify({}),
      }
    );

    const response = await POST(request, { params: { name: 'project-initialization' } });
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.sessionId).toBeDefined();
  });
});
```

---

## ⚡ 性能测试

### TC-SKILL-PERF-001: 技能加载性能

**测试文件:** `src/lib/integrations/pi-agent/core/__tests__/skills.perf.test.ts`

**性能指标:**
- `loadSkills()` < 500ms
- `loadSkillContent()` < 100ms

**测试代码 (Vitest):**
```typescript
import { describe, it, expect } from 'vitest';
import { loadSkills, loadSkillContent } from '../skills';

describe('Skill Performance Tests', () => {
  it('should load skills within 500ms', () => {
    const start = Date.now();
    const result = loadSkills();
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(500);
    expect(result.skills).toBeInstanceOf(Array);
  });

  it('should load skill content within 100ms', () => {
    const skill = {
      name: 'test',
      description: 'Test skill',
      filePath: './test-skill.md',
      baseDir: '.',
      source: 'test' as const,
      disableModelInvocation: false,
    };

    const start = Date.now();
    const content = loadSkillContent(skill);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(100);
    expect(content).toHaveProperty('frontmatter');
    expect(content).toHaveProperty('body');
  });
});
```

---

## 📋 测试执行检查清单

### 执行前准备
- [ ] #14 API 端点已实现
- [ ] #16 UI 组件已实现
- [ ] Playwright 浏览器已安装
- [ ] 测试环境配置完成

### 执行中
- [ ] 所有 E2E 测试运行完成
- [ ] 失败测试已记录
- [ ] 性能指标已收集

### 执行后
- [ ] 测试报告已生成
- [ ] 问题已分类和追踪
- [ ] 结果已通知 Team Lead

---

## 📊 测试结果记录

| 执行日期 | 测试人员 | 版本 | 通过 | 失败 | 跳过 | 通过率 |
|---------|---------|------|------|------|------|--------|
| - | - | - | - | - | - | - |

---

## 🤝 相关文档

- Skill 框架核心: `src/lib/integrations/pi-agent/core/skills.ts`
- Skill 中间件: `src/lib/integrations/pi-agent/core/skills.middleware.ts`
- project-initialization Skill: `skills/project-initialization/SKILL.md`
- API 路由: `src/app/api/skills/**/route.ts`
- UI 组件: `src/components/skills/**/*`
