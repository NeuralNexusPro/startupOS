# 测试文档 - Story 1.1: 项目访谈流程启动

**Story:** 项目访谈流程启动 (ARC-185)
**版本:** 1.0
**最后更新:** 2026-03-02

---

## 🎯 测试目标

验证用户能够成功启动项目访谈流程，系统正确初始化访谈会话，并提供友好的用户体验界面。

---

## 📋 需求概要

**用户故事:** 作为新用户，我希望能够快速启动项目访谈，以便系统能够了解我的项目并构建初始本体模型。

## 验收标准 (AC)

- AC1: 用户可以点击"开始访谈"按钮启动访谈流程
- AC2: 访谈启动时显示欢迎界面和介绍信息
- AC3: 访谈会话ID正确生成并持久化
- AC4: 访谈进度追踪器正确初始化(0/完成状态)
- AC5: 支持恢复之前的访谈(如果有的话)

---

## 📊 测试策略

### 测试层级

```
┌─────────────────────────────────┐
│  E2E 测试 (End-to-End)          │  访谈启动完整流程
└────────────┬────────────────────┘
             ↓
┌─────────────────────────────────┐
│  集成测试 (Integration)         │  前端↔后端↔数据库集成
└────────────┬────────────────────┘
             ↓
┌─────────────────────────────────┐
│  单元测试 (Unit)                │  组件/服务/状态管理
└─────────────────────────────────┘
```

### 测试覆盖率目标

| 测试类型 | 覆盖率目标 | 测试用例数 |
|---------|-----------|-----------|
| 单元测试 | > 80% | 8 |
| 集成测试 | > 70% | 4 |
| E2E 测试 | 关键路径 100% | 5 |
| 边界测试 | 100% | 4 |

### 测试矩阵（功能维 × 状态维 × 场景维）

| 维度 | 类别 | 覆盖项 |
|-----|------|--------|
| **功能维** | 核心功能 | 启动访谈、欢迎界面、会话创建、进度初始化、恢复访谈 |
| **状态维** | 用户状态 | 新用户、有历史记录用户、匿名用户、认证用户 |
| **场景维** | 网络条件 | 正常网络、弱网络、网络中断、恢复网络 |

---

## 🧪 单元测试

### 测试框架

- **框架:** Vitest
- **断言库:** Vitest (内置)
- **Mock 库:** Vitest (内置)

---

### TC-01-001: InterviewLauncher 组件渲染测试

**测试文件:** `src/features/interview/components/InterviewLauncher/__tests__/InterviewLauncher.test.tsx`

**测试目标:** 验证 InterviewLauncher 组件正确渲染

**用例类别:** 功能测试 / 组件测试
**优先级:** 🔴 P0 (Critical)

**测试代码:**
```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InterviewLauncher } from '../InterviewLauncher';

// Mock interview service
vi.mock('../../services/interviewService', () => ({
  startInterview: vi.fn(),
  hasActiveSession: vi.fn(),
}));

describe('InterviewLauncher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render start button correctly', () => {
    render(<InterviewLauncher />);

    const startButton = screen.getByRole('button', { name: /开始访谈/i });
    expect(startButton).toBeInTheDocument();
    expect(startButton).toBeEnabled();
  });

  it('should show welcome message', () => {
    render(<InterviewLauncher />);

    expect(screen.getByText(/欢迎来到 OriginOS 项目访谈/i)).toBeInTheDocument();
  });

  it('should display interview description', () => {
    render(<InterviewLauncher />);

    expect(screen.getByText(/帮助我们了解您的项目/i)).toBeInTheDocument();
  });
});
```

**覆盖的验收标准:** AC1, AC2

---

### TC-01-002: 启动访谈功能测试

**测试文件:** `src/features/interview/services/__tests__/interviewService.test.ts`

**测试目标:** 验证 startInterview service 正确创建访谈会话

**用例类别:** 功能测试 / 服务测试
**优先级:** 🔴 P0 (Critical)

**测试代码:**
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { startInterview } from '../interviewService';
import { createSessionId } from '../../utils/sessionUtils';

vi.mock('../../utils/sessionUtils');

describe('startInterview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('should create new interview session with valid ID', async () => {
    const mockSessionId = 'session-abc123';
    vi.mocked(createSessionId).mockReturnValue(mockSessionId);

    const result = await startInterview();

    expect(result).toEqual({
      sessionId: mockSessionId,
      createdAt: expect.any(String),
      status: 'in_progress',
      step: 0,
      answers: {},
    });
    expect(createSessionId).toHaveBeenCalled();
  });

  it('should persist session to localStorage', async () => {
    const mockSessionId = 'session-xyz789';
    vi.mocked(createSessionId).mockReturnValue(mockSessionId);

    await startInterview();

    const storedSession = localStorage.getItem('interview_session');
    expect(storedSession).toBeTruthy();
    const parsed = JSON.parse(storedSession!);
    expect(parsed.sessionId).toBe(mockSessionId);
  });

  it('should initialize progress tracker to 0', async () => {
    const result = await startInterview();

    expect(result.step).toBe(0);
    expect(result.status).toBe('in_progress');
  });
});
```

**覆盖的验收标准:** AC3, AC4

---

### TC-01-003: ProgressTracker 状态管理测试

**测试文件:** `src/features/interview/stores/__tests__/progressStore.test.ts`

**测试目标:** 验证进度追踪器状态正确管理

**用例类别:** 功能测试 / 状态管理
**优先级:** 🔴 P0 (Critical)

**测试代码:**
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useInterviewProgress } from '../progressStore';

describe('useInterviewProgress', () => {
  beforeEach(() => {
    useInterviewProgress.getState().reset();
  });

  it('should initialize with default state on start', () => {
    const { result } = renderHook(() => useInterviewProgress());

    expect(result.current).toEqual({
      currentStep: 0,
      totalSteps: expect.any(Number),
      percentage: 0,
      state: 'idle',
    });
  });

  it('should update progress when step advances', () => {
    const { result } = renderHook(() => useInterviewProgress());

    act(() => {
      result.current.advanceStep();
    });

    expect(result.current.currentStep).toBe(1);
    expect(result.current.percentage).toBeGreaterThan(0);
  });

  it('should handle interview completion', () => {
    const { result } = renderHook(() => useInterviewProgress());

    act(() => {
      result.current.complete();
    });

    expect(result.current.state).toBe('completed');
    expect(result.current.percentage).toBe(100);
  });
});
```

**覆盖的验收标准:** AC4

---

### TC-01-004: SessionID 生成唯一性测试

**测试文件:** `src/features/interview/utils/__tests__/sessionUtils.test.ts`

**测试目标:** 验证会话ID唯一性和格式

**用例类别:** 功能测试 / 工具函数
**优先级:** 🟡 P1 (High)

**测试代码:**
```typescript
import { describe, it, expect } from 'vitest';
import { createSessionId } from '../sessionUtils';

describe('createSessionId', () => {
  it('should generate unique IDs', () => {
    const ids = new Set();

    for (let i = 0; i < 1000; i++) {
      const id = createSessionId();
      expect(ids.has(id)).toBe(false);
      ids.add(id);
    }

    expect(ids.size).toBe(1000);
  });

  it('should generate IDs with correct format', () => {
    const id = createSessionId();

    expect(id).toMatch(/^interview_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
  });

  it('should include timestamp for ordering', () => {
    const id1 = createSessionId();
    await new Promise(resolve => setTimeout(resolve, 10));
    const id2 = createSessionId();

    // Extract timestamp portion and compare
    const timestamp1 = id1.split('_')[0];
    const timestamp2 = id2.split('_')[0];

    expect(timestamp2 >= timestamp1).toBe(true);
  });
});
```

**覆盖的验收标准:** AC3

---

### TC-01-005: WelcomeScreen 组件测试

**测试文件:** `src/features/interview/components/WelcomeScreen/__tests__/WelcomeScreen.test.tsx`

**测试目标:** 验证欢迎界面正确显示

**用例类别:** 功能测试 / UI测试
**优先级:** 🟡 P1 (High)

**测试代码:**
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WelcomeScreen } from '../WelcomeScreen';

describe('WelcomeScreen', () => {
  it('should display project name input field', () => {
    render(<WelcomeScreen />);

    const input = screen.getByLabelText(/项目名称/i);
    expect(input).toBeInTheDocument();
  });

  it('should display interview overview sections', () => {
    render(<WelcomeScreen />);

    expect(screen.getByText(/我们将问您几个问题/i)).toBeInTheDocument();
    expect(screen.getByText(/预计用时/i)).toBeInTheDocument();
    expect(screen.getByText(/5分钟/i)).toBeInTheDocument();
  });

  it('should render start action button', () => {
    render(<WelcomeScreen />);

    const button = screen.getByRole('button', { name: /开始/i });
    expect(button).toBeInTheDocument();
  });
});
```

**覆盖的验收标准:** AC2

---

### TC-01-006: 恢复访谈历史功能测试

**测试文件:** `src/features/interview/services/__tests__/resumeService.test.ts`

**测试目标:** 验证能够恢复之前的访谈

**用例类别:** 功能测试 / 场景测试
**优先级:** 🟡 P1 (High)

**测试代码:**
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getActiveSession, hasActiveSession } from '../resumeService';
import { InterviewSession } from '../../types';

describe('resumeService', () => {
  const mockSession: InterviewSession = {
    sessionId: 'existing-session',
    createdAt: new Date().toISOString(),
    status: 'in_progress',
    step: 2,
    answers: {
      projectName: '测试项目',
      projectType: 'web-app',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('should detect existing active session', () => {
    localStorage.setItem('interview_session', JSON.stringify(mockSession));

    const hasSession = hasActiveSession();

    expect(hasSession).toBe(true);
  });

  it('should return null when no active session exists', () => {
    const session = getActiveSession();

    expect(session).toBeNull();
  });

  it('should restore session with all answers', () => {
    localStorage.setItem('interview_session', JSON.stringify(mockSession));

    const restored = getActiveSession();

    expect(restored).toEqual(mockSession);
  });

  it('should ignore completed sessions', () => {
    const completedSession = { ...mockSession, status: 'completed' };
    localStorage.setItem('interview_session', JSON.stringify(completedSession));

    const hasSession = hasActiveSession();

    // Completed sessions are not considered "active" for resuming
    expect(hasSession).toBe(false);
  });
});
```

**覆盖的验收标准:** AC5

---

## 🔗 集成测试

### TC-01-INT-001: 访谈启动端到端集成测试

**测试文件:** `src/features/interview/__tests__/integration/start-integration.test.ts`

**测试目标:** 验证从点击按钮到会话创建的完整流程

**用例类别:** 集成测试 / 端到端
**优先级:** 🔴 P0 (Critical)

**测试代码:**
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InterviewLauncher } from '../../components/InterviewLauncher';
import * as interviewService from '../../services/interviewService';

describe('Interview Start Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('should complete full start interview flow', async () => {
    render(<InterviewLauncher />);

    // Step 1: Verify initial state
    expect(screen.getByRole('button', { name: /开始访谈/i })).toBeInTheDocument();

    // Step 2: Click start button
    const startButton = screen.getByRole('button', { name: /开始访谈/i });
    await userEvent.click(startButton);

    // Step 3: Wait for session creation
    await waitFor(() => {
      expect(localStorage.getItem('interview_session')).toBeTruthy();
    });

    // Step 4: Verify session data
    const session = JSON.parse(localStorage.getItem('interview_session')!);
    expect(session.status).toBe('in_progress');
    expect(session.step).toBe(0);
    expect(session.sessionId).toBeDefined();

    // Step 5: Verify UI state change
    await waitFor(() => {
      expect(screen.queryByText(/欢迎来到 OriginOS 项目访谈/i)).not.toBeInTheDocument();
    });
  });

  it('should handle existing session correctly', async () => {
    // Pre-populate with existing session
    const existingSession = {
      sessionId: 'prev-session',
      createdAt: new Date().toISOString(),
      status: 'in_progress',
      step: 2,
      answers: { projectName: '旧项目' },
    };
    localStorage.setItem('interview_session', JSON.stringify(existingSession));

    render(<InterviewLauncher />);

    // Should show resume option
    await waitFor(() => {
      expect(screen.getByText(/继续访谈/i)).toBeInTheDocument();
    });
  });
});
```

**覆盖的验收标准:** AC1, AC3, AC4, AC5

---

### TC-01-INT-002: 前后端 API 集成测试

**测试文件:** `src/features/interview/__tests__/integration/api-integration.test.ts`

**测试目标:** 验证前端与后端 API 的正确集成

**用例类别:** 集成测试 / API 测试
**优先级:** 🟡 P1 (High)

**测试代码:**
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { msw } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { startInterview as apiStartInterview } from '../../api/interviewApi';

const server = msw.listen();

describe('Interview API Integration', () => {
  beforeAll(() => server.listen());
  afterAll(() => server.close());

  it('should successfully call start interview API', async () => {
    server.use(
      http.post('/api/interview/start', () => {
        return HttpResponse.json({
          sessionId: 'api-session-123',
          status: 'created',
        });
      })
    );

    const response = await apiStartInterview({ projectName: 'Test Project' });

    expect(response.sessionId).toBe('api-session-123');
    expect(response.status).toBe('created');
  });

  it('should handle API errors gracefully', async () => {
    server.use(
      http.post('/api/interview/start', () => {
        return HttpResponse.json(
          { error: 'Internal Server Error' },
          { status: 500 }
        );
      })
    );

    await expect(apiStartInterview({ projectName: 'Test Project' }))
      .rejects.toThrow();
  });

  it('should validate request to API', async () => {
    let requestBody;

    server.use(
      http.post('/api/interview/start', async ({ request }) => {
        requestBody = await request.json();
        return HttpResponse.json({ sessionId: 'valid-123' });
      })
    );

    await apiStartInterview({ projectName: 'Valid Project' });

    expect(requestBody).toEqual({
      projectName: 'Valid Project',
      timestamp: expect.anything(),
    });
  });
});
```

**覆盖的验收标准:** AC1, AC3

### TC-01-INT-003: 数据库持久化集成测试

**测试文件:** `src/features/interview/__tests__/integration/persistence-integration.test.ts`

**测试目标:** 验证访谈数据正确持久化到数据库

**用例类别:** 集成测试 / 数据库
**优先级:** 🟡 P1 (High)

**测试代码:**
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../db/client';
import { startInterview, saveSession } from '../../services/interviewService';

describe('Interview Persistence Integration', () => {
  beforeEach(async () => {
    // Clean database
    await db.interview_sessions.deleteMany();
  });

  it('should save session to database', async () => {
    const session = await startInterview();

    const saved = await db.interview_sessions.findUnique({
      where: { sessionId: session.sessionId },
    });

    expect(saved).toBeDefined();
    expect(saved?.sessionId).toBe(session.sessionId);
    expect(saved?.status).toBe('in_progress');
  });

  it('should update existing session', async () => {
    const session = await startInterview();

    await saveSession({
      ...session,
      step: 1,
      answers: { projectName: 'Updated Name' },
    });

    const updated = await db.interview_sessions.findUnique({
      where: { sessionId: session.sessionId },
    });

    expect(updated?.step).toBe(1);
    expect(updated?.answers).toEqual({ projectName: 'Updated Name' });
  });

  it('should handle concurrent session updates', async () => {
    const session = await startInterview();

    // Simulate concurrent updates
    const updates = Promise.all([
      saveSession({ ...session, step: 1 }),
      saveSession({ ...session, step: 2 }),
      saveSession({ ...session, step: 3 }),
    ]);

    // Should handle with last-write-wins or optimistic locking
    await expect(updates).resolves.toBeDefined();
  });
});
```

**覆盖的验收标准:** AC3, AC4

---

### TC-01-INT-004: 状态管理集成测试

**测试文件:** `src/features/interview/__tests__/integration/store-integration.test.ts`

**测试目标:** 验证多个 store 之间的正确协调

**用例类别:** 集成测试 / 状态协调
**优先级:** 🟢 P2 (Medium)

**测试代码:**
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useInterviewStore } from '../../stores/interviewStore';
import { useProgressStore } from '../../stores/progressStore';
import { startInterview } from '../../services/interviewService';

describe('Store Integration', () => {
  beforeEach(() => {
    useInterviewStore.getState().reset();
    useProgressStore.getState().reset();
  });

  it('should sync interview state with progress state', async () => {
    const { result: interviewStore } = renderHook(() => useInterviewStore());
    const { result: progressStore } = renderHook(() => useProgressStore());

    // Start interview
    act(() => {
      startInterview();
    });

    // Verify stores are synchronized
    expect(interviewStore.current.sessionId).toBeDefined();
    expect(progressStore.current.state).toBe('in_progress');
  });

  it('should update progress when answer is recorded', async () => {
    const { result: interviewStore } = renderHook(() => useInterviewStore());
    const { result: progressStore } = renderHook(() => useProgressStore());

    // Start interview
    act(() => {
      interviewStore.startInterview();
    });

    // Record answer
    act(() => {
      interviewStore.recordAnswer('projectName', 'Test Project');
    });

    // Verify progress updated
    expect(progressStore.current.currentStep).toBeGreaterThan(0);
  });
});
```

**覆盖的验收标准:** AC4

---

## 🌐 E2E 测试

### 测试框架

- **框架:** Playwright
- **浏览器:** Chrome, Firefox, Safari

---

### TC-01-E2E-001: 新用户启动访谈流程

**测试文件:** `e2e/interview/start-interview-flow.spec.ts`

**测试目标:** 验证新用户首次启动访谈的完整流程

**用例类别:** E2E 测试 / 用户场景
**优先级:** 🔴 P0 (Critical)
**执行时间:** < 30s

**测试代码:**
```typescript
import { test, expect } from '@playwright/test';

test.describe('Start Interview E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage before each test
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
  });

  test('should complete interview start flow for new user', async ({ page }) => {
    // Step 1: Navigate to interview page
    await page.goto('/interview');

    // Step 2: Verify welcome screen is visible
    await expect(page.locator('h1')).toContainText('欢迎来到 OriginOS');

    // Step 3: Click start button
    await page.click('button[data-testid="start-interview-button"]');

    // Step 4: Wait for next screen
    await page.waitForURL('/interview/questions/1', { timeout: 5000 });

    // Step 5: Verify session was created
    const sessionData = await page.evaluate(() => {
      return JSON.parse(localStorage.getItem('interview_session') || '{}');
    });

    expect(sessionData.sessionId).toBeDefined();
    expect(sessionData.status).toBe('in_progress');

    // Step 6: Verify progress tracker is visible
    const progressElement = page.locator('[data-testid="progress-tracker"]');
    await expect(progressElement).toBeVisible();

    // Step 7: Verify progress is at starting point (0% or 1/N)
    const progressText = await progressElement.textContent();
    expect(progressText).toMatch(/0%|1\/\d/);
  });

  test('should handle resume from previous session', async ({ page }) => {
    // Setup: Create a previous session
    await page.goto('/interview');
    await page.evaluate(() => {
      localStorage.setItem('interview_session', JSON.stringify({
        sessionId: 'prev-session-123',
        createdAt: new Date().toISOString(),
        status: 'in_progress',
        step: 2,
        answers: { projectName: '我的项目' },
      }));
    });

    // Reload page
    await page.reload();

    // Verify resume screen appears
    await expect(page.locator('[data-testid="resume-option"]')).toBeVisible();
    await expect(page.locator('text=继续之前的访谈')).toBeVisible();

    // Click resume
    await page.click('button[data-testid="resume-button"]');

    // Verify it resumes at correct step
    await expect(page).toHaveURL(/interview\/questions\/3/);
  });
});
```

**覆盖的验收标准:** AC1, AC2, AC3, AC4, AC5

---

### TC-01-E2E-002: 欢迎界面交互测试

**测试文件:** `e2e/interview/welcome-screen.spec.ts`

**测试目标:** 验证欢迎界面的所有交互元素

**用例类别:** E2E 测试 / UI 交互
**优先级:** 🟡 P1 (High)
**执行时间:** < 15s

**测试代码:**
```typescript
import { test, expect } from '@playwright/test';

test.describe('Welcome Screen E2E', () => {
  test('should display all welcome elements', async ({ page }) => {
    await page.goto('/interview');

    // Verify welcome heading
    await expect(page.locator('h1')).toContainText('欢迎');

    // Verify description text
    await expect(page.locator('[data-testid="welcome-description"]')).toBeVisible();

    // Verify expected time
    await expect(page.locator('text=5分钟')).toBeVisible();

    // Verify start button
    const startButton = page.locator('button[data-testid="start-interview-button"]');
    await expect(startButton).toBeVisible();
    await expect(startButton).toBeEnabled();

    // Verify optional project name input
    const projectNameInput = page.locator('input[data-testid="project-name-input"]');
    await expect(projectNameInput).toBeVisible();
  });

  test('should handle project name input before starting', async ({ page }) => {
    await page.goto('/interview');

    const projectNameInput = page.locator('input[data-testid="project-name-input"]');
    await projectNameInput.fill('我的第一个项目');

    const startButton = page.locator('button[data-testid="start-interview-button"]');
    await startButton.click();

    // Verify project name is saved
    const sessionData = await page.evaluate(() => {
      return JSON.parse(localStorage.getItem('interview_session') || '{}');
    });

    expect(sessionData.answers?.projectName).toBe('我的第一个项目');
  });

  test('should show help tooltip on hover/click', async ({ page }) => {
    await page.goto('/interview');

    const helpIcon = page.locator('[data-testid="help-icon"]');

    // Click help icon
    await helpIcon.click();

    // Verify tooltip content
    await expect(page.locator('[data-testid="help-tooltip"]')).toBeVisible();
    await expect(page.locator('text=访谈说明')).toBeVisible();
  });
});
```

**覆盖的验收标准:** AC1, AC2

---

### TC-01-E2E-003: 进度追踪器显示测试

**测试文件:** `e2e/interview/progress-tracker.spec.ts`

**测试目标:** 验证进度追踪器正确显示和更新

**用例类别:** E2E 测试 / 组件验证
**优先级:** 🟡 P1 (High)
**执行时间:** < 20s

**测试代码:**
```typescript
import { test, expect } from '@playwright/test';

test.describe('Progress Tracker E2E', () => {
  test('should display progress tracker with correct initial state', async ({ page }) => {
    await page.goto('/interview');
    await page.click('button[data-testid="start-interview-button"]');

    // Wait for progress tracker
    const tracker = page.locator('[data-testid="progress-tracker"]');
    await expect(tracker).toBeVisible();

    // Verify initial progress
    const progressBar = page.locator('[data-testid="progress-bar"]');
    const width = await progressBar.evaluate(el => getComputedStyle(el).width);
    expect(width).toBe('0%');

    // Verify step indicator
    const stepIndicator = page.locator('[data-testid="current-step"]');
    await expect(stepIndicator).toContainText('1');
  });

  test('should update progress as user advances', async ({ page }) => {
    await page.goto('/interview');
    await page.click('button[data-testid="start-interview-button"]');

    // Answer a question
    await page.fill('input[data-testid="answer-input"]', '测试答案');
    await page.click('button[data-testid="next-button"]');

    // Wait for progress update
    await expect(page.locator('[data-testid="current-step"]')).toHaveText('2', { timeout: 3000 });

    // Verify progress bar advanced
    const progressBar = page.locator('[data-testid="progress-bar"]');
    const width = await progressBar.evaluate(el => getComputedStyle(el).width);
    expect(parseInt(width)).toBeGreaterThan(0);
  });
});
```

**覆盖的验收标准:** AC4

---

### TC-01-E2E-004: 跨浏览器的访谈启动测试

**测试文件:** `e2e/interview/cross-browser.spec.ts`

**测试目标:** 验证在不同浏览器中访谈流程的一致性

**用例类别:** E2E 测试 / 兼容性测试
**优先级:** 🟢 P2 (Medium)
**执行时间:** < 60s

**测试代码:**
```typescript
import { test, expect } from '@playwright/test';

test.describe('Cross-Browser Interview Start', () => {
  ['chromium', 'firefox', 'webkit'].forEach(browser => {
    test(`should work correctly in ${browser}`, async ({ page }) => {
      await page.goto('/interview');

      // Verify basic elements
      await expect(page.locator('h1')).toBeVisible();
      await expect(page.locator('button[data-testid="start-interview-button"]')).toBeVisible();

      // Start interview
      await page.click('button[data-testid="start-interview-button"]');

      // Verify session created
      const sessionData = await page.evaluate(() => {
        return JSON.parse(localStorage.getItem('interview_session') || '{}');
      });

      expect(sessionData.sessionId).toBeDefined();
    });
  });
});
```

**覆盖的验收标准:** AC1, AC3

---

### TC-01-E2E-005: 响应式设计测试

**测试文件:** `e2e/interview/responsive.spec.ts`

**测试目标:** 验证访谈界面在不同屏幕尺寸下正常工作

**用例类别:** E2E 测试 / 响应式测试
**优先级:** 🟢 P2 (Medium)
**执行时间:** < 30s

**测试代码:**
```typescript
import { test, expect, devices } from '@playwright/test';

test.describe('Responsive Design', () => {
  test('should work on mobile viewport', async ({ page }) => {
    await page.setViewportSize(devices['iPhone SE'].viewport);
    await page.goto('/interview');

    // Verify mobile layout
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('button[data-testid="start-interview-button"]')).toBeVisible();

    // Start interview
    await page.click('button[data-testid="start-interview-button"]');

    // Verify mobile progress display
    await expect(page.locator('[data-testid="mobile-progress"]')).toBeVisible();
  });

  test('should work on tablet viewport', async ({ page }) => {
    await page.setViewportSize(devices['iPad Mini'].viewport);
    await page.goto('/interview');

    await expect(page.locator('h1')).toBeVisible();
    await page.click('button[data-testid="start-interview-button"]');

    await expect(page.locator('[data-testid="progress-tracker"]')).toBeVisible();
  });

  test('should work on desktop viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/interview');

    await expect(page.locator('h1')).toBeVisible();
    await page.click('button[data-testid="start-interview-button"]');

    await expect(page.locator('[data-testid="progress-tracker"]')).toBeVisible();
  });
});
```

**覆盖的验收标准:** AC1, AC2

---

## 🚧 边界测试

### TC-01-BND-001: 空项目名称处理测试

**测试文件:** `src/features/interview/__tests__/boundary/empty-input.test.tsx`

**测试目标:** 验证系统处理空项目名称输入的行为

**用例类别:** 边界测试 / 输入验证
**优先级:** 🟡 P1 (High)

**测试代码:**
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WelcomeScreen } from '../../components/WelcomeScreen';

describe('Empty Project Name Boundary', () => {
  it('should start interview even with empty project name', () => {
    render(<WelcomeScreen />);

    // Don't fill in project name
    fireEvent.click(screen.getByRole('button', { name: /开始/i }));

    // Should still start interview
    // System may generate default project name
  });

  it('should handle whitespace-only project names', () => {
    render(<WelcomeScreen />);

    const input = screen.getByLabelText(/项目名称/i);
    fireEvent.change(input, { target: { value: '   ' });

    fireEvent.click(screen.getByRole('button', { name: /开始/i }));

    // Should treat as empty or trim whitespace
  });

  it('should handle special characters in project name', () => {
    render(<WelcomeScreen />);

    const input = screen.getByLabelText(/项目名称/i);
    fireEvent.change(input, { target: { value: '项目@#$%^&*()' } });

    fireEvent.click(screen.getByRole('button', { name: /开始/i }));

    // Should handle or sanitize special characters
  });
});
```

---

### TC-01-BND-002: 项目名称长度限制测试

**测试文件:** `src/features/interview/__tests__/boundary/name-length.test.tsx`

**测试目标:** 验证项目名称长度限制

**用例类别:** 边界测试 / 长度验证
**优先级:** 🟡 P1 (High)

**测试代码:**
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WelcomeScreen } from '../../components/WelcomeScreen';

describe('Project Name Length Boundaries', () => {
  const MAX_LENGTH = 100; // Assuming max length constraint

  it('should accept name at max length', () => {
    render(<WelcomeScreen />);

    const input = screen.getByLabelText(/项目名称/i);
    const maxLengthName = 'A'.repeat(MAX_LENGTH);
    fireEvent.change(input, { target: { value: maxLengthName } });

    expect(input).toHaveValue(maxLengthName);
  });

  it('should truncate name exceeding max length', () => {
    render(<WelcomeScreen />);

    const input = screen.getByLabelText(/项目名称/i);
    const tooLongName = 'A'.repeat(MAX_LENGTH + 10);
    fireEvent.change(input, { target: { value: tooLongName } });

    expect(input).toHaveLength(MAX_LENGTH);
  });

  it('should handle single character name', () => {
    render(<WelcomeScreen />);

    const input = screen.getByLabelText(/项目名称/i);
    fireEvent.change(input, { target: { value: 'A' } });

    expect(input).toHaveValue('A');
  });

  it('should display character count near limit', () => {
    render(<WelcomeScreen />);

    const input = screen.getByLabelText(/项目名称/i);
    const nearLimitName = 'A'.repeat(MAX_LENGTH - 5);
    fireEvent.change(input, { target: { value: nearLimitName } });

    // Should show character count indicator
    const charCount = screen.queryByText(/95\/100/);
    expect(charCount).toBeVisible();
  });
});
```

---

### TC-01-BND-003: 快速连续点击测试

**测试文件:** `src/features/interview/__tests__/boundary/rapid-clicks.test.tsx`

**测试目标:** 验证系统处理快速连续点击按钮的行为

**用例类别:** 边界测试 / 防抖测试
**优先级:** 🟢 P2 (Medium)

**测试代码:**
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InterviewLauncher } from '../../components/InterviewLauncher';

describe('Rapid Clicks Boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('should prevent multiple interview sessions from rapid clicks', async () => {
    render(<InterviewLauncher />);

    const startButton = screen.getByRole('button', { name: /开始访谈/i });

    // Click multiple times rapidly
    fireEvent.click(startButton);
    fireEvent.click(startButton);
    fireEvent.click(startButton);

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 100));

    // Only one session should be created
    const sessions = Object.keys(localStorage)
      .filter(key => key.includes('interview'));

    expect(sessions.length).toBe(1);
  });

  it('should disable button during processing', async () => {
    const mockStartInterview = vi.fn().mockResolvedValue({ sessionId: 'test' });

    render(<InterviewLauncher />);

    const startButton = screen.getByRole('button', { name: /开始访谈/i });

    // Click and expect button to be disabled
    fireEvent.click(startButton);

    // Button should be disabled while processing
    expect(startButton).toBeDisabled();
  });
});
```

---

### TC-01-BND-004: 存储空间不足测试

**测试文件:** `src/features/interview/__tests__/boundary/storage-full.test.ts`

**测试目标:** 验证当 localStorage 满时的处理

**用例类别:** 边界测试 / 错误处理
**优先级:** 🟢 P2 (Medium)

**测试代码:**
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { startInterview } from '../../services/interviewService';

describe('Storage Full Boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('should handle localStorage quota exceeded error', async () => {
    // Mock localStorage.setItem to throw quota error
    const originalSetItem = localStorage.setItem;
    localStorage.setItem = vi.fn((key, value) => {
      throw new DOMException('QuotaExceededError');
    });

    await expect(startInterview()).rejects.toThrow();

    // Restore original
    localStorage.setItem = originalSetItem;
  });

  it('should provide fallback storage strategy', async () => {
    // Test in-memory fallback when localStorage is full
    const originalStorage = { ...localStorage };

    // Simulate full storage
    Object.defineProperty(window, 'localStorage', {
      value: {
        setItem: vi.fn(() => {
          throw new DOMException('QuotaExceededError');
        }),
      },
      configurable: true,
    });

    const result = await startInterview();

    // Should use in-memory state
    expect(result.sessionId).toBeDefined();

    Object.defineProperty(window, 'localStorage', {
      value: originalStorage,
      configurable: true,
    });
  });
});
```

---

## 🐛 异常场景测试

### TC-01-ERR-001: 网络错误处理

**测试文件:** `src/features/interview/__tests__/error/network-error.test.tsx`

**测试目标:** 验证网络中断时的处理

**用例类别:** 异常测试 / 网络异常
**优先级:** 🟡 P1 (High)

**测试代码:**
```typescript
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { InterviewLauncher } from '../../components/InterviewLauncher';

describe('Network Error Handling', () => {
  beforeAll(() => {
    // Mock fetch to simulate network errors
    global.fetch = vi.fn(() =>
      Promise.reject(new Error('Network Error'))
    );
  });

  it('should display error message on network failure', async () => {
    render(<InterviewLauncher />);

    const startButton = screen.getByRole('button', { name: /开始访谈/i });
    fireEvent.click(startButton);

    await waitFor(() => {
      expect(screen.getByText(/网络连接失败/i)).toBeInTheDocument();
    });
  });

  it('should allow retry after network error', async () => {
    render(<InterviewLauncher />);

    const startButton = screen.getByRole('button', { name: /开始访谈/i });

    // First attempt fails
    fireEvent.click(startButton);

    await waitFor(() => {
      expect(screen.getByText(/重试/i)).toBeInTheDocument();
    });

    // Fix network and retry
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ sessionId: 'retry-session' }),
      })
    );

    fireEvent.click(screen.getByRole('button', { name: /重试/i }));

    await waitFor(() => {
      expect(screen.queryByText(/网络连接失败/i)).not.toBeInTheDocument();
    });
  });
});
```

---

### TC-01-ERR-002: 服务器错误处理

**测试文件:** `src/features/interview/__tests__/error/server-error.test.ts`

**测试目标:** 验证服务器响应错误时的处理

**用例类别:** 异常测试 / 服务器异常
**优先级:** 🟡 P1 (High)

**测试代码:**
```typescript
import { describe, it, expect, vi } from 'vitest';
import { startInterview } from '../../services/interviewService';

describe('Server Error Handling', () => {
  it('should handle 500 Internal Server Error', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Internal Server Error' }),
      })
    );

    await expect(startInterview()).rejects.toThrow('Internal Server Error');
  });

  it('should handle 400 Bad Request with validation message', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 400,
        json: () => Promise.resolve({
          error: 'Bad Request',
          message: 'Project name is required',
        }),
      })
    );

    await expect(startInterview()).rejects.toThrow();
  });

  it('should handle 503 Service Unavailable', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 503,
        json: () => Promise.resolve({ error: 'Service Unavailable' }),
      })
    );

    await expect(startInterview()).rejects.toThrow('Service Unavailable');
  });
});
```

---

### TC-01-ERR-003: 损坏会话恢复测试

**测试文件:** `src/features/interview/__tests__/error/corrupted-session.test.ts`

**测试目标:** 验证损坏会话数据的处理

**用例类别:** 异常测试 / 数据完整性
**优先级:** 🟢 P2 (Medium)

**测试代码:**
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { hasActiveSession, getActiveSession } from '../../services/resumeService';

describe('Corrupted Session Handling', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should handle invalid JSON in localStorage', () => {
    localStorage.setItem('interview_session', 'invalid-json{');

    const hasSession = hasActiveSession();
    expect(hasSession).toBe(false);

    const session = getActiveSession();
    expect(session).toBeNull();
  });

  it('should handle malformed session object', () => {
    localStorage.setItem('interview_session', JSON.stringify({
      // Missing required fields
      sessionId: 'test',
      // Missing status, step, etc.
    }));

    const session = getActiveSession();
    expect(session).toBeNull();
  });

  it('should clear corrupted session data', () => {
    localStorage.setItem('interview_session', 'corrupted');

    const session = getActiveSession();

    // Corrupted session should be cleared
    expect(session).toBeNull();
    expect(localStorage.getItem('interview_session')).toBeNull();
  });
});
```

---

### TC-01-ERR-004: 浏览器兼容性错误测试

**测试文件:** `src/features/interview/__tests__/error/browser-compatibility.test.ts`

**测试目标:** 验证在不支持特性浏览器中的处理

**用例类别:** 异常测试 / 浏览器兼容
**优先级:** 🟢 P2 (Medium)

**测试代码:**
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { startInterview } from '../../services/interviewService';

describe('Browser Compatibility', () => {
  let originalLocalStorage: Storage;

  beforeEach(() => {
    originalLocalStorage = window.localStorage;
    localStorage.clear();
  });

  afterEach(() => {
    window.localStorage = originalLocalStorage;
  });

  it('should fallback when localStorage is disabled', async () => {
    // Simulate disabled localStorage
    delete (window as any).localStorage;

    const result = await startInterview();

    // Should work with in-memory fallback
    expect(result.sessionId).toBeDefined();
  });

  it('should handle missing crypto API for session ID generation', async () => {
    const originalCrypto = window.crypto;
    delete (window as any).crypto;

    const result = await startInterview();

    // Should fallback to random UUID generation
    expect(result.sessionId).toBeDefined();

    window.crypto = originalCrypto;
  });
});
```

---

## ⚡ 性能测试

### 性能指标

根据 Epic 1 目标：

| 指标 | 约束 | 测试方法 |
|-----|------|----------|
| 访谈启动响应时间 | < 1s | 计时测试 |
| 页面加载时间 | < 2s | Playwright 测试 |
| 欢迎界面渲染 | < 500ms | 浏览器性能指标 |
| SessionID 生成 | < 50ms | Jest performance 测试 |

---

### TC-01-PERF-001: 访谈启动响应时间

**测试文件:** `src/features/interview/__tests__/performance/start-performance.test.ts`

**测试目标:** 验证访谈启动在性能约束内完成

**用例类别:** 性能测试 / 响应时间
**优先级:** 🟡 P1 (High)
**目标:** < 1s

**测试代码:**
```typescript
import { describe, it, expect } from 'vitest';
import { startInterview } from '../../services/interviewService';

describe('Start Interview Performance', () => {
  it('should complete start interview within 1 second', async () => {
    const startTime = performance.now();

    await startInterview();

    const endTime = performance.now();
    const duration = endTime - startTime;

    expect(duration).toBeLessThan(1000); // < 1 second
  });

  it('should generate session ID within 50ms', () => {
    const startTime = performance.now();

    const sessionId = createSessionId();

    const endTime = performance.now();
    const duration = endTime - startTime;

    expect(duration).toBeLessThan(50);
  });
});
```

---

### TC-01-PERF-002: 页面加载性能

**测试文件:** `e2e/interview/performance/load-performance.spec.ts`

**测试目标:** 验证页面加载时间符合目标

**用例类别:** 性能测试 / 加载时间
**优先级:** 🟡 P1 (High)
**目标:** < 2s

**测试代码:**
```typescript
import { test, expect } from '@playwright/test';

test.describe('Load Performance', () => {
  test('should load interview page within 2 seconds', async ({ page }) => {
    const startTime = performance.now();

    await page.goto('/interview');
    await page.waitForLoadState('networkidle');

    const endTime = performance.now();
    const duration = endTime - startTime;

    expect(duration).toBeLessThan(2000);
  });

  test('should have low First Contentful Paint', async ({ page }) => {
    await page.goto('/interview');

    const fcp = await page.evaluate(() => {
      const perfEntries = performance.getEntriesByType('paint');
      const fcpEntry = perfEntries.find(entry => entry.name === 'first-contentful-paint');
      return fcpEntry ? fcpEntry.startTime : 0;
    });

    expect(fcp).toBeLessThan(1000); // FCP < 1s
  });

  test('should have low Time to Interactive', async ({ page }) => {
    await page.goto('/interview');
    await page.waitForLoadState('networkidle');

    const tti = await page.evaluate(() => {
      return performance.timing.domInteractive - performance.timing.navigationStart;
    });

    expect(tti).toBeLessThan(1500); // TTI < 1.5s
  });
});
```

---

### TC-01-PERF-003: 大量历史记录性能

**测试文件:** `src/features/interview/__tests__/performance/many-sessions.test.ts`

**测试目标:** 验证处理大量历史记录的性能

**用例类别:** 性能测试 / 数据量
**优先级:** 🟢 P2 (Medium)

**测试代码:**
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { hasActiveSession, getSessionsList } from '../../services/resumeService';

describe('Many Sessions Performance', () => {
  beforeEach(() => {
    localStorage.clear();

    // Populate with many historical sessions
    for (let i = 0; i < 100; i++) {
      localStorage.setItem(`interview_history_${i}`, JSON.stringify({
        sessionId: `session-${i}`,
        createdAt: new Date(Date.now() - i * 1000 * 60 * 60).toISOString(),
        status: 'completed',
        step: 10,
      }));
    }
  });

  it('should quickly retrieve sessions list', () => {
    const startTime = performance.now();

    const sessions = getSessionsList();

    const endTime = performance.now();
    const duration = endTime - startTime;

    expect(sessions.length).toBeGreaterThanOrEqual(100);
    expect(duration).toBeLessThan(100); // < 100ms
  });

  it('should quickly check for active session among many', () => {
    const startTime = performance.now();

    const hasActive = hasActiveSession();

    const endTime = performance.now();
    const duration = endTime - startTime;

    expect(duration).toBeLessThan(50); // < 50ms
  });
});
```

---

## 🎭 用户体验测试

### TC-01-UX-001: 无障碍测试

**测试文件:** `src/features/interview/__tests__/ux/a11y.test.tsx`

**测试目标:** 验证界面符合无障碍标准

**用例类别:** UX 测试 / A11y
**优先级:** 🟢 P2 (Medium)

**测试代码:**
```typescript
import { describe, it, expect } from 'vitest';
import { render, axe } from '@testing-library/react';
import { InterviewLauncher } from '../../components/InterviewLauncher';

describe('Accessibility', () => {
  it('should have no accessibility violations', async () => {
    const { container } = render(<InterviewLauncher />);

    const results = await axe(container);

    expect(results).toHaveNoViolations();
  });

  it('should have proper ARIA labels', () => {
    const { container } = render(<InterviewLauncher />);

    const startButton = container.querySelector('button')!;
    expect(startButton).toHaveAttribute('aria-label');
    expect(startButton).toHaveAttribute('aria-live', 'polite');
  });

  it('should support keyboard navigation', () => {
    const { container } = render(<InterviewLauncher />);

    const startButton = container.querySelector('button')!;

    startButton.focus();
    expect(startButton).toHaveFocus();

    // Simulate Enter key press
    startButton.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
  });

  it('should have sufficient color contrast', async () => {
    const { container } = render(<InterviewLauncher />);

    const results = await axe(container, {
      rules: {
        'color-contrast': { enabled: true },
      },
    });

    expect(results).toHaveNoViolations();
  });
});
```

---

### TC-01-UX-002: 动画和过渡测试

**测试文件:** `src/features/interview/__tests__/ux/animations.test.tsx`

**测试目标:** 验证动画不会影响用户体验

**用例类别:** UX 测试 / 动画
**优先级:** 🟢 P2 (Medium)

**测试代码:**
```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InterviewLauncher } from '../../components/InterviewLauncher';

describe('Animations', () => {
  beforeEach(() => {
    // Mock RequestAnimationFrame
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      return setTimeout(() => cb(performance.now()), 16);
    });
  });

  it('should respect reduced motion preference', async () => {
    // Mock reduced motion
    vi.stubGlobal('matchMedia', () => ({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
    }));

    const { container } = render(<InterviewLauncher />);

    // Verify animations are disabled
    const transitions = getComputedStyle(container).transition;
    expect(transitions).toBe('none 0s ease 0s');
  });

  it('should have smooth animations for default users', async () => {
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      media: '(prefers-reduced-motion: reduce)',
    }));

    const { container } = render(<InterviewLauncher />);

    const startButton = screen.getByRole('button', { name: /开始访谈/i });

    await userEvent.click(startButton);

    // Verify animation triggers
    const animatedElement = container.querySelector('[data-animating]');
    expect(animatedElement).toBeInTheDocument();
  });
});
```

---

## 📊 测试数据

### 测试数据集 1: 有效项目名称

**用途:** 测试项目名称输入的各种有效格式

**数据:**
```json
{
  "validProjectNames": [
    {
      "name": "我的项目",
      "description": "中文项目名"
    },
    {
      "name": "My Project",
      "description": "英文项目名"
    },
    {
      "name": "项目123",
      "description": "包含数字"
    },
    {
      "name": "A".repeat(100),
      "description": "最大长度"
    },
    {
      "name": "项目-Alpha_v1.0",
      "description": "包含特殊字符"
    }
  ]
}
```

### 测试数据集 2: 无效项目名称

**用途:** 测试输入验证和错误处理

**数据:**
```json
{
  "invalidProjectNames": [
    {
      "name": "",
      "expectedBehavior": "使用默认名称或要求输入"
    },
    {
      "name": "   ",
      "expectedBehavior": "视为空值"
    },
    {
      "name": "A".repeat(101),
      "expectedBehavior": "截断到最大长度"
    },
    {
      "name": "<script>alert('xss')</script>",
      "expectedBehavior": "转义或拒绝"
    }
  ]
}
```

### 测试数据集 3: 会话状态

**用途:** 测试各种会话恢复场景

**数据:**
```json
{
  "sessionStates": [
    {
      "sessionId": "session-1",
      "status": "in_progress",
      "step": 0,
      "answers": {},
      "description": "刚启动的会话"
    },
    {
      "sessionId": "session-2",
      "status": "in_progress",
      "step": 5,
      "answers": {
        "projectName": "项目B",
        "projectType": "app"
      },
      "description": "进行中的会话"
    },
    {
      "sessionId": "session-3",
      "status": "completed",
      "step": 10,
      "description": "已完成的会话"
    }
  ]
}
```

---

## ✅ 验收标准测试

### AC1: 用户可以点击"开始访谈"按钮启动访谈流程

**Given** 用户访问访谈页面
**When** 用户点击"开始访谈"按钮
**Then** 访谈流程启动，进入第一个问题阶段

**测试用例:** TC-01-001, TC-01-INT-001, TC-01-E2E-001

**测试结果:** ☐ Pass / ☐ Fail

**测试证据:**
- 单元测试: `TC-01-001`
- 集成测试: `TC-01-INT-001`
- E2E 测试: `TC-01-E2E-001`

---

### AC2: 访谈启动时显示欢迎界面和介绍信息

**Given** 用户访问访谈页面
**When** 页面加载完成
**Then** 显示欢迎界面、说明信息、预计用时（5分钟）

**测试用例:** TC-01-001, TC-01-005, TC-01-E2E-002

**测试结果:** ☐ Pass / ☐ Fail

**测试证据:**
- 单元测试: `TC-01-005`
- E2E 测试: `TC-01-E2E-002`

---

### AC3: 访谈会话ID正确生成并持久化

**Given** 用户启动访谈
**When** 系统创建会话
**Then** 唯一的会话ID被生成并保存到localStorage/数据库

**测试用例:** TC-01-002, TC-01-004, TC-01-INT-001

**测试结果:** ☐ Pass / ☐ Fail

**测试证据:**
- 单元测试: `TC-01-002, TC-01-004`
- 集成测试: `TC-01-INT-001`

---

### AC4: 访谈进度追踪器正确初始化(0/完成状态)

**Given** 用户启动访谈
**When** 初始化进度追踪器
**Then** 进度为0，状态为进行中

**测试用例:** TC-01-003, TC-01-E2E-003

**测试结果:** ☐ Pass / ☐ Fail

**测试证据:**
- 单元测试: `TC-01-003`
- E2E 测试: `TC-01-E2E-003`

---

### AC5: 支持恢复之前的访谈(如果有的话)

**Given** 用户之前有未完成的访谈
**When** 用户访问访谈页面
**Then** 显示恢复选项，可继续之前的访谈

**测试用例:** TC-01-006, TC-01-INT-001

**测试结果:** ☐ Pass / ☐ Fail

**测试证据:**
- 单元测试: `TC-01-006`
- 集成测试: `TC-01-INT-001`

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

### 运行性能测试

```bash
npm run test:performance
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

- [Story 1.1 README](./README-1.1.md)
- [测试模板](../../templates/story-spec-template/testing.md)
- [项目架构文档](../architecture.md)
