# 测试文档 - Story 1.2: 结构化访谈问题收集

**Story:** 结构化访谈问题收集 (ARC-186)
**版本:** 1.0
**最后更新:** 2026-03-02

---

## 🎯 测试目标

验证系统能够正确展示结构化的访谈问题，收集用户回答，并支持各种输入类型和交互模式。

---

## 📋 需求概要

**用户故事:** 用户通过回答结构化访谈问题，提供项目相关信息，系统收集这些信息以构建本体模型。

## 验收标准 (AC)

- AC1: 系统按预设顺序展示访谈问题
- AC2: 支持多种问题类型（文本、单选、多选、分类选择）
- AC3: 支持跳过问题和修改答案
- AC4: 收集的答案正确保存并验证
- AC5: 根据用户回答动态调整后续问题（条件分支）

---

## 📊 测试策略

### 测试层级

```
┌─────────────────────────────────┐
│  E2E 测试 (End-to-End)          │  完整访谈流程
└────────────┬────────────────────┘
             ↓
┌─────────────────────────────────┐
│  集成测试 (Integration)         │  问题加载→回答→保存
└────────────┬────────────────────┘
             ↓
┌─────────────────────────────────┐
│  单元测试 (Unit)                │  问题组件/验证器
└─────────────────────────────────┘
```

### 测试覆盖率目标

| 测试类型 | 覆盖率目标 | 测试用例数 |
|---------|-----------|-----------|
| 单元测试 | > 80% | 12 |
| 集成测试 | > 70% | 5 |
| E2E 测试 | 关键路径 100% | 6 |
| 边界测试 | 100% | 6 |

### 测试矩阵（功能维 × 状态维 × 场景维）

| 维度 | 类别 | 覆盖项 |
|-----|------|--------|
| **功能维** | 问题类型 | 文本输入、单选、多选、下拉、排序、文件上传 |
| **状态维** | 答案状态 | 未回答、已回答、跳过、修改中、已验证 |
| **场景维** | 交互模式 | 顺序答题、跳跃答题、返回修改、批量修改 |

---

## 🧪 单元测试

### 测试框架

- **框架:** Vitest
- **断言库:** Vitest (内置)
- **Mock 库:** Vitest (内置)

---

### TC-02-001: QuestionRenderer 组件渲染测试

**测试文件:** `src/features/interview/components/QuestionRenderer/__tests__/QuestionRenderer.test.tsx`

**测试目标:** 验证不同类型问题组件正确渲染

**用例类别:** 功能测试 / 组件测试
**优先级:** 🔴 P0 (Critical)

**测试代码:**
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QuestionRenderer } from '../QuestionRenderer';
import { Question } from '../../types';

describe('QuestionRenderer', () => {
  const textQuestion: Question = {
    id: 'q1',
    type: 'text',
    title: '项目名称',
    description: '请输入您的项目名称',
    required: true,
  };

  const singleChoiceQuestion: Question = {
    id: 'q2',
    type: 'single-choice',
    title: '项目类型',
    options: ['Web 应用', '移动应用', '桌面应用', 'API 服务'],
    required: true,
  };

  const multipleChoiceQuestion: Question = {
    id: 'q3',
    type: 'multiple-choice',
    title: '使用的技术栈',
    options: ['React', 'Vue', 'Angular', 'Svelte', 'Solid'],
    required: false,
  };

  it('should render text question correctly', () => {
    render(<QuestionRenderer question={textQuestion} />);

    expect(screen.getByText('项目名称')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('should render single choice question correctly', () => {
    render(<QuestionRenderer question={singleChoiceQuestion} />);

    expect(screen.getByText('项目类型')).toBeInTheDocument();

    // Verify all options are rendered
    expect(screen.getByRole('radio', { name: 'Web 应用' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '移动应用' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '桌面应用' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'API 服务' })).toBeInTheDocument();
  });

  it('should render multiple choice question correctly', () => {
    render(<QuestionRenderer question={multipleChoiceQuestion} />);

    expect(screen.getByText('使用的技术栈')).toBeInTheDocument();

    // Verify all options are rendered as checkboxes
    expect(screen.getByRole('checkbox', { name: 'React' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Vue' })).toBeInTheDocument();
  });

  it('should display required indicator', () => {
    render(<QuestionRenderer question={textQuestion} />);

    expect(screen.getByText(/\*/)).toBeInTheDocument();
  });

  it('should not display required indicator for optional questions', () => {
    render(<QuestionRenderer question={multipleChoiceQuestion} />);

    expect(screen.queryByText(/\*/)).not.toBeInTheDocument();
  });

  it('should display question description', () => {
    render(<QuestionRenderer question={textQuestion} />);

    expect(screen.getByText('请输入您的项目名称')).toBeInTheDocument();
  });
});
```

**覆盖的验收标准:** AC1, AC2

---

### TC-02-002: 答案收集和验证测试

**测试文件:** `src/features/interview/services/__tests__/answerValidator.test.ts`

**测试目标:** 验证答案收集和验证逻辑

**用例类别:** 功能测试 / 服务测试
**优先级:** 🔴 P0 (Critical)

**测试代码:**
```typescript
import { describe, it, expect } from 'vitest';
import { validateAnswer, Answer } from '../../services/answerValidator';
import { Question } from '../../types';

describe('Answer Validator', () => {
  const textQuestion: Question = {
    id: 'project-name',
    type: 'text',
    title: '项目名称',
    required: true,
    validation: {
      minLength: 2,
      maxLength: 50,
    },
  };

  const emailQuestion: Question = {
    id: 'contact-email',
    type: 'text',
    title: '联系邮箱',
    required: true,
    validation: {
      pattern: 'email',
    },
  };

  describe('required questions', () => {
    it('should validate non-empty text answer', () => {
      const answer: Answer = { questionId: 'project-name', value: '我的项目' };
      const result = validateAnswer(answer, textQuestion);

      expect(result.valid).toBe(true);
    });

    it('should fail on empty required answer', () => {
      const answer: Answer = { questionId: 'project-name', value: '' };
      const result = validateAnswer(answer, textQuestion);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('必填');
    });

    it('should fail on null answer for required question', () => {
      const answer: Answer = { questionId: 'project-name', value: null };
      const result = validateAnswer(answer, textQuestion);

      expect(result.valid).toBe(false);
    });
  });

  describe('length validation', () => {
    it('should validate minimum length', () => {
      const answer: Answer = { questionId: 'project-name', value: 'A' };
      const result = validateAnswer(answer, textQuestion);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('至少');
    });

    it('should validate maximum length', () => {
      const answer: Answer = { questionId: 'project-name', value: 'A'.repeat(51) };
      const result = validateAnswer(answer, textQuestion);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('最多');
    });

    it('should pass with valid length', () => {
      const answer: Answer = { questionId: 'project-name', value: 'ValidName' };
      const result = validateAnswer(answer, textQuestion);

      expect(result.valid).toBe(true);
    });
  });

  describe('pattern validation', () => {
    it('should validate email format', () => {
      const validAnswer: Answer = { questionId: 'contact-email', value: 'test@example.com' };
      const validResult = validateAnswer(validAnswer, emailQuestion);
      expect(validResult.valid).toBe(true);

      const invalidAnswer: Answer = { questionId: 'contact-email', value: 'invalid-email' };
      const invalidResult = validateAnswer(invalidAnswer, emailQuestion);
      expect(invalidResult.valid).toBe(false);
    });
  });

  describe('optional questions', () => {
    const optionalQuestion: Question = {
      id: 'optional-field',
      type: 'text',
      title: '可选字段',
      required: false,
    };

    it('should skip validation for empty optional answers', () => {
      const answer: Answer = { questionId: 'optional-field', value: '' };
      const result = validateAnswer(answer, optionalQuestion);

      expect(result.valid).toBe(true);
    });
  });
});
```

**覆盖的验收标准:** AC4

---

### TC-02-003: 问题导航测试

**测试文件:** `src/features/interview/stores/__tests__/questionNavigation.test.ts`

**测试目标:** 验证问题导航功能

**用例类别:** 功能测试 / 状态管理
**优先级:** 🔴 P0 (Critical)

**测试代码:**
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useQuestionNavigation } from '../questionNavigation';

describe('Question Navigation', () => {
  const questions = [
    { id: 'q1', type: 'text', title: '问题1', required: true },
    { id: 'q2', type: 'single-choice', title: '问题2', required: false },
    { id: 'q3', type: 'multiple-choice', title: '问题3', required: true },
  ];

  beforeEach(() => {
    const { reset } = useQuestionNavigation.getState();
    reset();
  });

  it('should start at first question', () => {
    const { result } = renderHook(() => useQuestionNavigation());

    expect(result.current.currentIndex).toBe(0);
    expect(result.current.currentQuestion).toEqual(questions[0]);
  });

  it('should navigate to next question', () => {
    const { result } = renderHook(() => useQuestionNavigation());

    act(() => {
      result.current.next();
    });

    expect(result.current.currentIndex).toBe(1);
    expect(result.current.currentQuestion).toEqual(questions[1]);
  });

  it('should navigate to previous question', () => {
    const { result } = renderHook(() => useQuestionNavigation());

    act(() => {
      result.current.next(); // Go to q2
      result.current.next(); // Go to q3
      result.current.previous(); // Back to q2
    });

    expect(result.current.currentIndex).toBe(1);
    expect(result.current.currentQuestion).toEqual(questions[1]);
  });

  it('should not go before first question', () => {
    const { result } = renderHook(() => useQuestionNavigation());

    act(() => {
      result.current.previous();
    });

    expect(result.current.currentIndex).toBe(0);
    expect(result.current.hasPrevious).toBe(false);
  });

  it('should not go after last question', () => {
    const { result } = renderHook(() => useQuestionNavigation());

    act(() => {
      result.current.next(); // q1 -> q2
      result.current.next(); // q2 -> q3
      result.current.next(); // q3 -> should stay at q3
    });

    expect(result.current.currentIndex).toBe(2); // Last index
    expect(result.current.hasNext).toBe(false);
  });

  it('should jump to specific question', () => {
    const { result } = renderHook(() => useQuestionNavigation());

    act(() => {
      result.current.goToQuestion(2);
    });

    expect(result.current.currentIndex).toBe(2);
    expect(result.current.currentQuestion).toEqual(questions[2]);
  });
});
```

**覆盖的验收标准:** AC1, AC3

---

### TC-02-004: 条件分支测试

**测试文件:** `src/features/interview/services/__tests__/conditionalLogic.test.ts`

**测试目标:** 验证条件逻辑正确执行

**用例类别:** 功能测试 / 逻辑测试
**优先级:** 🔴 P0 (Critical)

**测试代码:**
```typescript
import { describe, it, expect } from 'vitest';
import { getNextQuestions, Question } from '../../services/conditionalLogic';

describe('Conditional Logic', () => {
  const baseQuestions: Question[] = [
    {
      id: 'q1',
      type: 'single-choice',
      title: '项目类型',
      options: ['Web应用', '移动应用', '桌面应用'],
      required: true,
      conditional: {},
    },
    {
      id: 'q2-web',
      type: 'single-choice',
      title: 'Web框架',
      options: ['React', 'Vue', 'Angular'],
      required: false,
      conditional: {
        showIf: {
          questionId: 'q1',
          operator: 'equals',
          value: 'Web应用',
        },
      },
    },
    {
      id: 'q2-mobile',
      type: 'single-choice',
      title: '移动框架',
      options: ['React Native', 'Flutter', 'Native'],
      required: false,
      conditional: {
        showIf: {
          questionId: 'q1',
          operator: 'equals',
          value: '移动应用',
        },
      },
    },
    {
      id: 'q2-desktop',
      type: 'single-choice',
      title: '桌面框架',
      options: ['Electron', 'Tauri'],
      required: false,
      conditional: {
        showIf: {
          questionId: 'q1',
          operator: 'equals',
          value: '桌面应用',
        },
      },
    },
  ];

  it('should show web-specific questions when web app is selected', () => {
    const answers: Record<string, any> = {
      q1: 'Web应用',
    };

    const nextQuestions = getNextQuestions(answers, baseQuestions);

    expect(nextQuestions).toContainEqual(
      expect.objectContaining({ id: 'q2-web' })
    );
    expect(nextQuestions).not.toContainEqual(
      expect.objectContaining({ id: 'q2-mobile' })
    );
    expect(nextQuestions).not.toContainEqual(
      expect.objectContaining({ id: 'q2-desktop' })
    );
  });

  it('should show mobile-specific questions when mobile app is selected', () => {
    const answers: Record<string, any> = {
      q1: '移动应用',
    };

    const nextQuestions = getNextQuestions(answers, baseQuestions);

    expect(nextQuestions).toContainEqual(
      expect.objectContaining({ id: 'q2-mobile' })
    );
    expect(nextQuestions).not.toContainEqual(
      expect.objectContaining({ id: 'q2-web' })
    );
  });

  it('should show all questions when no answer is provided', () => {
    const answers: Record<string, any> = {};

    const nextQuestions = getNextQuestions(answers, baseQuestions);

    // Should show base question q1
    expect(nextQuestions.length).toBeGreaterThan(0);
  });

  it('should handle multiple conditions (AND)', () => {
    const complexQuestion: Question = {
      id: 'q3',
      type: 'text',
      title: '详细描述',
      conditional: {
        showIf: {
          operator: 'AND',
          conditions: [
            { questionId: 'q1', operator: 'equals', value: 'Web应用' },
            { questionId: 'q2-web', operator: 'equals', value: 'React' },
          ],
        },
      },
    };

    const answers: Record<string, any> = {
      q1: 'Web应用',
      'q2-web': 'React',
    };

    const shouldShow = evaluateConditional(complexQuestion.conditional, answers);
    expect(shouldShow).toBe(true);

    // Change one condition
    answers['q2-web'] = 'Vue';
    const shouldHide = evaluateConditional(complexQuestion.conditional, answers);
    expect(shouldHide).toBe(false);
  });

  it('should handle OR conditions', () => {
    const orQuestion: Question = {
      id: 'q4',
      type: 'text',
      title: '额外信息',
      conditional: {
        showIf: {
          operator: 'OR',
          conditions: [
            { questionId: 'q1', operator: 'equals', value: 'Web应用' },
            { questionId: 'q1', operator: 'equals', value: '移动应用' },
          ],
        },
      },
    };

    const answersWeb: Record<string, any> = { q1: 'Web应用' };
    const answersMobile: Record<string, any> = { q1: '移动应用' };
    const answersDesktop: Record<string, any> = { q1: '桌面应用' };

    expect(evaluateConditional(orQuestion.conditional, answersWeb)).toBe(true);
    expect(evaluateConditional(orQuestion.conditional, answersMobile)).toBe(true);
    expect(evaluateConditional(orQuestion.conditional, answersDesktop)).toBe(false);
  });
});
```

**覆盖的验收标准:** AC5

---

### TC-02-005: 答案持久化测试

**测试文件:** `src/features/interview/services/__tests__/answerPersistence.test.ts`

**测试目标:** 验证答案正确保存到持久化存储

**用例类别:** 功能测试 / 持久化
**优先级:** 🟡 P1 (High)

**测试代码:**
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { saveAnswer, getAnswers, clearAnswers } from '../../services/answerPersistence';

describe('Answer Persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should save single answer', () => {
    saveAnswer('q1', '我的项目');

    const answers = getAnswers();

    expect(answers['q1']).toBe('我的项目');
  });

  it('should save multiple answers', () => {
    saveAnswer('q1', '项目A');
    saveAnswer('q2', 'Web应用');
    saveAnswer('q3', ['React', 'TypeScript']);

    const answers = getAnswers();

    expect(answers['q1']).toBe('项目A');
    expect(answers['q2']).toBe('Web应用');
    expect(answers['q3']).toEqual(['React', 'TypeScript']);
  });

  it('should update existing answer', () => {
    saveAnswer('q1', '项目A');
    saveAnswer('q1', '项目B');

    const answers = getAnswers();

    expect(answers['q1']).toBe('项目B');
    expect(Object.keys(answers).length).toBe(1);
  });

  it('should retrieve all answers', () => {
    saveAnswer('q1', 'A');
    saveAnswer('q2', 'B');
    saveAnswer('q3', 'C');

    const answers = getAnswers();

    expect(Object.keys(answers).length).toBe(3);
    expect(answers['q1']).toBe('A');
    expect(answers['q2']).toBe('B');
    expect(answers['q3']).toBe('C');
  });

  it('should clear all answers', () => {
    saveAnswer('q1', 'A');
    saveAnswer('q2', 'B');

    clearAnswers();

    const answers = getAnswers();

    expect(answers).toEqual({});
  });

  it('should persist across page reloads', () => {
    saveAnswer('q1', 'Persisted Value');

    // Simulate page reload by reading from localStorage
    const stored = localStorage.getItem('interview_answers');

    expect(stored).toBeTruthy();

    const parsed = JSON.parse(stored!);
    expect(parsed['q1']).toBe('Persisted Value');
  });
});
```

**覆盖的验收标准:** AC4

---

### TC-02-006: 跳过问题功能测试

**测试文件:** `src/features/interview/stores/__tests__/skipQuestion.test.ts`

**测试目标:** 验证跳过问题功能

**用例类别:** 功能测试 / 交互测试
**优先级:** 🟡 P1 (High)

**测试代码:**
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSkipQuestion } from '../skipQuestion';

describe('Skip Question', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should skip optional question', () => {
    const { result } = renderHook(() => useSkipQuestion());

    const optionalQuestion = {
      id: 'q1',
      type: 'text',
      title: '可选问题',
      required: false,
    };

    act(() => {
      result.current.skip(optionalQuestion);
    });

    expect(result.current.skippedQuestions).toContain('q1');
  });

  it('should require answer for required question', () => {
    const { result } = renderHook(() => useSkipQuestion());

    const requiredQuestion = {
      id: 'q1',
      type: 'text',
      title: '必填问题',
      required: true,
    };

    act(() => {
      result.current.skip(requiredQuestion);
    });

    // Should not allow skipping required question
    expect(result.current.skippedQuestions).not.toContain('q1');
    expect(result.current.error).toContain('必填');
  });

  it('should mark skipped question in summary', () => {
    const { result } = renderHook(() => useSkipQuestion());

    const question = { id: 'q1', type: 'text', title: '问题1', required: false };

    act(() => {
      result.current.skip(question);
    });

    const summary = result.current.getSummary();

    expect(summary['q1']).toBe('skipped');
  });

  it('should unskip when answer is provided', () => {
    const { result } = renderHook(() => useSkipQuestion());

    const question = { id: 'q1', type: 'text', title: '问题1', required: false };

    act(() => {
      result.current.skip(question);
    });

    act(() => {
      result.current.provideAnswer('q1', '现在有答案了');
    });

    expect(result.current.skippedQuestions).not.toContain('q1');
  });
});
```

**覆盖的验收标准:** AC3

---

### TC-02-007: 修改已答问题测试

**测试文件:** `src/features/interview/stores/__tests__/editAnswer.test.ts`

**测试目标:** 验证返回修改已答问题的功能

**用例类别:** 功能测试 / 交互测试
**优先级:** 🟡 P1 (High)

**测试代码:**
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEditAnswer } from '../editAnswer';

describe('Edit Answer', () => {
  beforeEach(() => {
    const { reset } = useEditAnswer.getState();
    reset();
  });

  it('should update existing answer', () => {
    const { result } = renderHook(() => useEditAnswer());

    act(() => {
      result.current.setAnswer('q1', '初始答案');
      result.current.updateAnswer('q1', '修改后的答案');
    });

    expect(result.current.getAnswer('q1')).toBe('修改后的答案');
  });

  it('should clear answer when editing back to empty', () => {
    const { result } = renderHook(() => useEditAnswer());

    act(() => {
      result.current.setAnswer('q1', '答案');
      result.current.updateAnswer('q1', '');
    });

    expect(result.current.getAnswer('q1')).toBeUndefined();
  });

  it('should track answer history', () => {
    const { result } = renderHook(() => useEditAnswer());

    act(() => {
      result.current.setAnswer('q1', '答案1');
      result.current.updateAnswer('q1', '答案2');
      result.current.updateAnswer('q1', '答案3');
    });

    const history = result.current.getAnswerHistory('q1');

    expect(history).toEqual([
      { value: '答案1', timestamp: expect.any(Number) },
      { value: '答案2', timestamp: expect.any(Number) },
      { value: '答案3', timestamp: expect.any(Number) },
    ]);
  });

  it('should undo previous edit', () => {
    const { result } = renderHook(() => useEditAnswer());

    act(() => {
      result.current.setAnswer('q1', 'A');
      result.current.updateAnswer('q1', 'B');
      result.current.undoEdit('q1');
    });

    expect(result.current.getAnswer('q1')).toBe('A');
  });
});
```

**覆盖的验收标准:** AC3

---

### TC-02-008: 多选答案测试

**测试文件:** `src/features/interview/components/__tests__/MultipleChoice.test.tsx`

**测试目标:** 验证多选问题组件行为

**用例类别:** 功能测试 / 组件测试
**优先级:** 🟡 P1 (High)

**测试代码:**
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MultipleChoice } from '../MultipleChoice';
import { Question } from '../../types';

describe('Multiple Choice Component', () => {
  const multipleChoiceQuestion: Question = {
    id: 'tech-stack',
    type: 'multiple-choice',
    title: '使用的技术栈',
    options: ['React', 'Vue', 'Angular', 'Svelte'],
    required: false,
  };

  it('should render all options as checkboxes', () => {
    render(<MultipleChoice question={multipleChoiceQuestion} />);

    expect(screen.getByRole('checkbox', { name: 'React' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Vue' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Angular' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Svelte' })).toBeInTheDocument();
  });

  it('should allow selecting multiple options', () => {
    const onChange = vi.fn();
    render(<MultipleChoice question={multipleChoiceQuestion} onChange={onChange} />);

    fireEvent.click(screen.getByRole('checkbox', { name: 'React' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Vue' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Angular' }));

    expect(onChange).toHaveBeenLastCalledWith({
      questionId: 'tech-stack',
      value: ['React', 'Vue', 'Angular'],
    });
  });

  it('should deselect option when clicked again', () => {
    const onChange = vi.fn();
    render(<MultipleChoice question={multipleChoiceQuestion} onChange={onChange} />);

    fireEvent.click(screen.getByRole('checkbox', { name: 'React' }));
    expect(onChange).toHaveBeenCalledWith({
      questionId: 'tech-stack',
      value: ['React'],
    });

    fireEvent.click(screen.getByRole('checkbox', { name: 'React' }));
    expect(onChange).toHaveBeenCalledWith({
      questionId: 'tech-stack',
      value: [],
    });
  });

  it('should display selection count', () => {
    render(<MultipleChoice question={multipleChoiceQuestion} selected={['React', 'Vue']} />);

    expect(screen.getByText(/已选择 2 项/)).toBeInTheDocument();
  });

  it('should show "Select All" option for many choices', () => {
    const manyOptions = Array.from({ length: 10 }, (_, i) => `选项${i + 1}`);
    const manyChoiceQuestion: Question = {
      ...multipleChoiceQuestion,
      options: manyOptions,
    };

    render(<MultipleChoice question={manyChoiceQuestion} />);

    expect(screen.getByText('全选')).toBeInTheDocument();
  });
});
```

**覆盖的验收标准:** AC2

---

### TC-02-009: 分类选择器测试

**测试文件:** `src/features/interview/components/__tests__/CategorySelector.test.tsx`

**测试目标:** 验证分类选择器组件行为

**用例类别:** 功能测试 / 组件测试
**优先级:** 🟢 P2 (Medium)

**测试代码:**
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CategorySelector } from '../CategorySelector';

describe('Category Selector', () => {
  const categories = [
    {
      id: 'frontend',
      name: '前端',
      items: ['React', 'Vue', 'Angular'],
    },
    {
      id: 'backend',
      name: '后端',
      items: ['Node.js', 'Python', 'Java', 'Go'],
    },
    {
      id: 'database',
      name: '数据库',
      items: ['PostgreSQL', 'MySQL', 'MongoDB'],
    },
  ];

  it('should render category tabs', () => {
    render(<CategorySelector categories={categories} />);

    expect(screen.getByRole('tab', { name: '前端' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '后端' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '数据库' })).toBeInTheDocument();
  });

  it('should show items of selected category', () => {
    render(<CategorySelector categories={categories} />);

    // Frontend should be default
    expect(screen.getByText('React')).toBeInTheDocument();
    expect(screen.getByText('Vue')).toBeInTheDocument();
    expect(screen.getByText('Angular')).toBeInTheDocument();

    // Backend items should not be visible
    expect(screen.queryByText('Node.js')).not.toBeInTheDocument();
  });

  it('should switch to different category', () => {
    render(<CategorySelector categories={categories} />);

    fireEvent.click(screen.getByRole('tab', { name: '后端' }));

    expect(screen.getByText('Node.js')).toBeInTheDocument();
    expect(screen.getByText('Python')).toBeInTheDocument();
    expect(screen.queryByText('React')).not.toBeInTheDocument();
  });

  it('should select item from category', () => {
    const onSelect = vi.fn();
    render(<CategorySelector categories={categories} onSelect={onSelect} />);

    fireEvent.click(screen.getByRole('button', { name: 'React' }));

    expect(onSelect).toHaveBeenCalledWith('React', 'frontend');
  });

  it('should show search input for many items', () => {
    const manyItems = Array.from({ length: 50 }, (_, i) => `Item${i}`);
    const largeCategory = categories.map(cat => ({ ...cat, items: manyItems }));

    render(<CategorySelector categories={largeCategory} />);

    expect(screen.getByPlaceholderText('搜索...')).toBeInTheDocument();
  });
});
```

**覆盖的验收标准:** AC2

---

### TC-02-010: 问题进度更新测试

**测试文件:** `src/features/interview/stores/__tests__/questionProgress.test.ts`

**测试目标:** 验证问题进度正确更新

**用例类别:** 功能测试 / 状态同步
**优先级:** 🟡 P1 (High)

**测试代码:**
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useQuestionProgress } from '../questionProgress';

describe('Question Progress', () => {
  const totalQuestions = 10;

  beforeEach(() => {
    const { reset } = useQuestionProgress.getState();
    reset(totalQuestions);
  });

  it('should track answered questions', () => {
    const { result } = renderHook(() => useQuestionProgress(totalQuestions));

    act(() => {
      result.current.recordAnswer('q1');
      result.current.recordAnswer('q2');
      result.current.recordAnswer('q3');
    });

    expect(result.current.answeredCount).toBe(3);
    expect(result.current.percentage).toBe(30);
  });

  it('should track skipped questions', () => {
    const { result } = renderHook(() => useQuestionProgress(totalQuestions));

    act(() => {
      result.current.recordAnswer('q1');
      result.current.recordSkip('q2');
      result.current.recordSkip('q3');
    });

    expect(result.current.skippedCount).toBe(2);
    expect(result.current.answeredCount).toBe(1);
  });

  it('should calculate progress correctly with skips', () => {
    const { result } = renderHook(() => useQuestionProgress(totalQuestions));

    act(() => {
      result.current.recordAnswer('q1');
      result.current.recordAnswer('q2');
      result.current.recordSkip('q3');
    });

    // Progress based on answered + optional skipped
    expect(result.current.percentage).toBe(20);
  });

  it('should report completion when all required answered', () => {
    const { result } = renderHook(() => useQuestionProgress(totalQuestions));

    act(() => {
      for (let i = 1; i <= totalQuestions; i++) {
        result.current.recordAnswer(`q${i}`);
      }
    });

    expect(result.current.isComplete).toBe(true);
    expect(result.current.percentage).toBe(100);
  });

  it('should update progress in real-time', () => {
    const { result } = renderHook(() => useQuestionProgress(totalQuestions));

    const initialProgress = result.current.percentage;

    act(() => {
      result.current.recordAnswer('q1');
    });

    const updatedProgress = result.current.percentage;

    expect(updatedProgress).toBeGreaterThan(initialProgress);
  });
});
```

**覆盖的验收标准:** AC4

---

### TC-02-011: 问题排序测试

**测试文件:** `src/features/interview/services/__tests__/questionOrdering.test.ts`

**测试目标:** 验证问题按预设顺序展示

**用例类别:** 功能测试 / 排序逻辑
**优先级:** 🟡 P1 (High)

**测试代码:**
```typescript
import { describe, it, expect } from 'vitest';
import { getOrderedQuestions, Question } from '../../services/questionOrdering';

describe('Question Ordering', () => {
  const unsortedQuestions: Question[] = [
    { id: 'q3', type: 'text', title: '问题3', order: 3 },
    { id: 'q1', type: 'text', title: '问题1', order: 1 },
    { id: 'q4', type: 'text', title: '问题4', order: 4 },
    { id: 'q2', type: 'text', title: '问题2', order: 2 },
  ];

  it('should order questions by specified order', () => {
    const ordered = getOrderedQuestions(unsortedQuestions);

    expect(ordered[0].id).toBe('q1');
    expect(ordered[1].id).toBe('q2');
    expect(ordered[2].id).toBe('q3');
    expect(ordered[3].id).toBe('q4');
  });

  it('should handle questions without order field', () => {
    const mixedQuestions: Question[] = [
      { id: 'q1', type: 'text', title: '问题1', order: 1 },
      { id: 'q2', type: 'text', title: '问题2' }, // No order
      { id: 'q3', type: 'text', title: '问题3', order: 3 },
    ];

    const ordered = getOrderedQuestions(mixedQuestions);

    expect(ordered[0].id).toBe('q1');
    // q2 should come after q1 (appended at end)
    expect(ordered[1].id).toBe('q3');
  });

  it('should respect question groups', () => {
    const groupedQuestions: Question[] = [
      { id: 'q1', type: 'text', title: '项目信息', group: 'base', order: 1 },
      { id: 'q2', type: 'text', title: '技术栈', group: 'tech', order: 1 },
      { id: 'q3', type: 'text', title: '项目描述', group: 'base', order: 2 },
    ];

    const ordered = getOrderedQuestions(groupedQuestions);

    // Group base should come first within same order
    expect(ordered[0].group).toBe('base');
  });
});
```

**覆盖的验收标准:** AC1

---

### TC-02-012: 数据导出测试

**测试文件:** `src/features/interview/services/__tests__/dataExport.test.ts`

**测试目标:** 验证收集的答案可以正确导出

**用例类别:** 功能测试 / 数据处理
**优先级:** 🟢 P2 (Medium)

**测试代码:**
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { exportAnswers, exportAsJSON, exportAsCSV } from '../../services/dataExport';

describe('Data Export', () => {
  const mockAnswers = {
    sessionId: 'session-123',
    projectName: '我的项目',
    projectType: 'Web应用',
    techStack: ['React', 'TypeScript'],
    teamSize: '5-10人',
    createdAt: new Date().toISOString(),
  };

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('interview_answers', JSON.stringify(mockAnswers));
  });

  it('should export answers as JSON', () => {
    const json = exportAsJSON();

    const exported = JSON.parse(json);

    expect(exported).toEqual(mockAnswers);
  });

  it('should export answers as CSV', () => {
    const csv = exportAsCSV();

    const lines = csv.split('\n');

    expect(lines[0]).toContain('questionId,value,type');
    expect(lines[1]).toContain('projectName,我的项目,text');
  });

  it('should handle array values in export', () => {
    const csv = exportAsCSV();

    expect(csv).toContain('React,TypeScript');
  });

  it('should format export with timestamps', () => {
    const exporter = exportAnswers();

    expect(exporter).toHaveProperty('timestamp');
    expect(exporter).toHaveProperty('version');
    expect(exporter).toHaveProperty('answers');
  });
});
```

**覆盖的验收标准:** AC4

---

## 🔗 集成测试

### TC-02-INT-001: 完整问答流程集成测试

**测试文件:** `src/features/interview/__tests__/integration/qna-flow.test.tsx`

**测试目标:** 验证从问题展示到答案保存的完整流程

**用例类别:** 集成测试 / 端到端流程
**优先级:** 🔴 P0 (Critical)

**测试代码:**
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InterviewFlow } from '../InterviewFlow';

describe('Q&A Flow Integration', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should complete multiple questions in sequence', async () => {
    render(<InterviewFlow />);

    // Question 1: 项目名称
    await userEvent.type(screen.getByLabelText(/项目名称/i), '测试项目');
    await userEvent.click(screen.getByRole('button', { name: /下一步/i }));

    // Question 2: 项目类型
    await waitFor(() => {
      expect(screen.getByText('项目类型')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('radio', { name: 'Web应用' }));
    await userEvent.click(screen.getByRole('button', { name: /下一步/i }));

    // Question 3: 技术栈
    await waitFor(() => {
      expect(screen.getByText('技术栈')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('checkbox', { name: 'React' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'TypeScript' }));
    await userEvent.click(screen.getByRole('button', { name: /提交/i }));

    // Verify all answers saved
    const answers = JSON.parse(localStorage.getItem('interview_answers')!);

    expect(answers.projectName).toBe('测试项目');
    expect(answers.projectType).toBe('Web应用');
    expect(answers.techStack).toEqual(['React', 'TypeScript']);
  });

  it('should handle back and edit previous answers', async () => {
    render(<InterviewFlow />);

    // Answer Q1
    await userEvent.type(screen.getByLabelText(/项目名称/i), '项目A');
    await userEvent.click(screen.getByRole('button', { name: /下一步/i }));

    // Answer Q2
    await waitFor(() => {
      expect(screen.getByText('项目类型')).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole('radio', { name: 'Web应用' }));
    await userEvent.click(screen.getByRole('button', { name: /下一步/i }));

    // Go back to Q1
    await userEvent.click(screen.getByRole('button', { name: /上一步/i }));

    // Modify Q1
    await waitFor(() => {
      expect(screen.getByLabelText(/项目名称/i)).toBeInTheDocument();
    });
    const input = screen.getByLabelText(/项目名称/i);
    await userEvent.clear(input);
    await userEvent.type(input, '项目B');
    await userEvent.click(screen.getByRole('button', { name: /下一步/i }));

    // Verify Q1 was updated
    const answers = JSON.parse(localStorage.getItem('interview_answers')!);
    expect(answers.projectName).toBe('项目B');
  });

  it('should validate required fields before proceeding', async () => {
    render(<InterviewFlow />);

    // Try to skip required question
    const nextButton = screen.getByRole('button', { name: /下一步/i });
    await userEvent.click(nextButton);

    // Should show validation error
    await waitFor(() => {
      expect(screen.getByText(/请填写此项/)).toBeInTheDocument();
    });

    // Verify still on same question
    expect(screen.getByLabelText(/项目名称/i)).toBeInTheDocument();

    // Fill and proceed
    await userEvent.type(screen.getByLabelText(/项目名称/i), '有效项目');
    await userEvent.click(nextButton);

    await waitFor(() => {
      expect(screen.queryByText(/请填写此项/)).not.toBeInTheDocument();
    });
  });
});
```

**覆盖的验收标准:** AC1, AC2, AC3, AC4

---

### TC-02-INT-002: 条件分支集成测试

**测试文件:** `src/features/interview/__tests__/integration/conditional-flow.test.tsx`

**测试目标:** 验证条件逻辑在实际流程中的表现

**用例类别:** 集成测试 / 条件逻辑
**优先级:** 🔴 P0 (Critical)

**测试代码:**
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InterviewFlow } from '../InterviewFlow';

describe('Conditional Flow Integration', () => {
  it('should show framework-specific question for Web apps', async () => {
    render(<InterviewFlow />);

    // Select "Web应用"
    await userEvent.type(screen.getByLabelText(/项目名称/i), '测试项目');
    await userEvent.click(screen.getByRole('button', { name: /下一步/i }));

    await waitFor(() => {
      expect(screen.getByText('项目类型')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('radio', { name: 'Web应用' }));
    await userEvent.click(screen.getByRole('button', { name: /下一步/i }));

    // Should show Web framework question
    await waitFor(() => {
      expect(screen.getByText('Web框架')).toBeInTheDocument();
    });

    // Should NOT show mobile/desktop questions
    expect(screen.queryByText('移动框架')).not.toBeInTheDocument();
    expect(screen.queryByText('桌面框架')).not.toBeInTheDocument();
  });

  it('should show mobile-specific question for mobile apps', async () => {
    render(<InterviewFlow />);

    await userEvent.type(screen.getByLabelText(/项目名称/i), '测试项目');
    await userEvent.click(screen.getByRole('button', { name: /下一步/i }));

    await waitFor(() => {
      expect(screen.getByText('项目类型')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('radio', { name: '移动应用' }));
    await userEvent.click(screen.getByRole('button', { name: /下一步/i }));

    // Should show mobile framework question
    await waitFor(() => {
      expect(screen.getByText('移动框架')).toBeInTheDocument();
    });
  });

  it('should dynamically adjust when answer changes', async () => {
    render(<InterviewFlow />);

    // Select Web app first
    await userEvent.type(screen.getByLabelText(/项目名称/i), '测试项目');
    await userEvent.click(screen.getByRole('button', { name: /下一步/i }));

    await waitFor(() => {
      expect(screen.getByText('项目类型')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('radio', { name: 'Web应用' }));
    await userEvent.click(screen.getByRole('button', { name: /下一步/i }));

    await waitFor(() => {
      expect(screen.getByText('Web框架')).toBeInTheDocument();
    });

    // Go back and change answer
    await userEvent.click(screen.getByRole('button', { name: /上一步/i }));

    await waitFor(() => {
      expect(screen.getByText('项目类型')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('radio', { name: '移动应用' }));
    await userEvent.click(screen.getByRole('button', { { name: /下一步/i }));

    // Should now show mobile question
    await waitFor(() => {
      expect(screen.getByText('移动框架')).toBeInTheDocument();
    });
  });
});
```

**覆盖的验收标准:** AC5

---

### TC-02-INT-003: 答案同步API集成测试

**测试文件:** `src/features/interview/__tests__/integration/api-sync.test.ts`

**测试目标:** 验证答案与后端API的同步

**用例类别:** 集成测试 / API 同步
**优先级:** 🟡 P1 (High)

**测试代码:**
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { msw } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { syncAnswer, syncAllAnswers } from '../../api/interviewApi';

const server = msw.listen();

describe('Answer API Sync Integration', () => {
  beforeAll(() => server.listen());
  afterAll(() => server.close());

  it('should sync single answer to server', async () => {
    server.use(
      http.post('/api/interview/answer', () => {
        return HttpResponse.json({ success: true, synced: true });
      })
    );

    const result = await syncAnswer({
      sessionId: 'session-123',
      questionId: 'project-name',
      value: '测试项目',
    });

    expect(result.success).toBe(true);
    expect(result.synced).toBe(true);
  });

  it('should sync all answers to server', async () => {
    server.use(
      http.post('/api/interview/answers', () => {
        return HttpResponse.json({
          success: true,
          syncedCount: 3,
          answers: {
            projectName: '项目A',
            projectType: 'Web应用',
            techStack: ['React'],
          },
        });
      })
    );

    const result = await syncAllAnswers('session-123', {
      projectName: '项目A',
      projectType: 'Web应用',
      techStack: ['React'],
    });

    expect(result.success).toBe(true);
    expect(result.syncedCount).toBe(3);
  });

  it('should handle sync errors gracefully', async () => {
    server.use(
      http.post('/api/interview/answer', () => {
        return HttpResponse.json(
          { error: 'Sync failed' },
          { status: 500 }
        );
      })
    );

    const result = await syncAnswer({
      sessionId: 'session-123',
      questionId: 'project-name',
      value: '测试项目',
    });

    expect(result.synced).toBe(false);
    // Should queue for retry
    expect(result.queued).toBe(true);
  });

  it('should retry failed syncs', async () => {
    let attempts = 0;

    server.use(
      http.post('/api/interview/answer', () => {
        attempts++;
        if (attempts < 3) {
          return HttpResponse.json({ error: 'Temporarily unavailable' }, { status: 503 });
        }
        return HttpResponse.json({ success: true, synced: true });
      })
    );

    const result = await syncAnswer({
      sessionId: 'session-123',
      questionId: 'project-name',
      value: '测试项目',
    }, { maxRetries: 3 });

    expect(result.synced).toBe(true);
    expect(attempts).toBe(3);
  });
});
```

**覆盖的验收标准:** AC4

---

### TC-02-INT-004: 跨设备答案同步测试

**测试文件:** `src/features/interview/__tests__/integration/cross-device-sync.test.ts`

**测试目标:** 验证跨设备答案同步功能

**用例类别:** 集成测试 / 跨设备同步
**优先级:** 🟢 P2 (Medium)

**测试代码:**
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { saveAnswer, syncToDevice, getDeviceState } from '../../services/crossDeviceSync';

describe('Cross-Device Sync', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should sync answer to local storage for other devices', async () => {
    await saveAnswer('projectName', 'CrossDeviceProject');

    const syncData = await syncToDevice('session-abc');

    expect(syncData).toHaveProperty('answers');
    expect(syncData.answers.projectName).toBe('CrossDeviceProject');
    expect(syncData).toHaveProperty('timestamp');
  });

  it('should detect conflicts when same session on multiple devices', async () => {
    // Device A
    await saveAnswer('projectName', 'ProjectA');
    const deviceAData = await getDeviceState();

    // Simulate Device B with conflict
    const deviceBData = {
      ...deviceAData,
      answers: { ...deviceAData.answers, projectName: 'ProjectB' },
      lastModified: deviceAData.lastModified + 1000,
    };

    // Should detect conflict
    const hasConflict = hasConflict(deviceAData, deviceBData);

    expect(hasConflict).toBe(true);
  });

  it('should merge answers from multiple devices', async () => {
    const deviceA = {
      answers: {
        projectName: 'ProjectA',
        projectType: 'Web应用',
      },
      timestamp: Date.now(),
    };

    const deviceB = {
      answers: {
        projectName: 'ProjectB', // Conflict
        techStack: ['React'],
      },
      timestamp: Date.now() + 1000,
    };

    const merged = mergeAnswers(deviceA, deviceB);

    // Later timestamp wins for conflict
    expect(merged.projectName).toBe('ProjectB');
    // Unique answers should be merged
    expect(merged.projectType).toBe('Web应用');
    expect(merged.techStack).toEqual(['React']);
  });
});
```

---

### TC-02-INT-005: 多语言支持测试

**测试文件:** `src/features/interview/__tests__/integration/i18n.test.tsx`

**测试目标:** 验证多语言问题展示

**用例类别:** 集成测试 / 国际化
**优先级:** 🟢 P2 (Medium)

**测试代码:**
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '../../contexts/I18nContext';
import { QuestionRenderer } from '../QuestionRenderer';
import { Question } from '../../types';

describe('i18n Support', () => {
  const question: Question = {
    id: 'q1',
    type: 'text',
    title: 'project_name',
    description: 'project_name_desc',
    required: true,
  };

  it('should display questions in Chinese', () => {
    render(
      <I18nProvider locale="zh-CN">
        <QuestionRenderer question={question} />
      </I18nProvider>
    );

    expect(screen.getByText('项目名称')).toBeInTheDocument();
    expect(screen.getByText('请输入您的项目名称')).toBeInTheDocument();
  });

  it('should display questions in English', () => {
    render(
      <I18nProvider locale="en-US">
        <QuestionRenderer question={question} />
      </I18nProvider>
    );

    expect(screen.getByText('Project Name')).toBeInTheDocument();
    expect(screen.getByText('Please enter your project name')).toBeInTheDocument();
  });

  it('should display validation messages in selected language', async () => {
    const { result } = render(
      <I18nProvider locale="zh-CN">
        <QuestionRenderer question={question} />
      </I18nProvider>
    );

    // Trigger validation
    const input = screen.getByRole('textbox');
    fireEvent.blur(input);

    expect(await screen.findByText('此项为必填项')).toBeInTheDocument();
  });
});
```

---

## 🌐 E2E 测试

### 测试框架

- **框架:** Playwright
- **浏览器:** Chrome, Firefox, Safari

---

### TC-02-E2E-001: 完整访谈流程E2E测试

**测试文件:** `e2e/interview/full-interview-flow.spec.ts`

**测试目标:** 验证完整的访谈问题收集流程

**用例类别:** E2E 测试 / 完整流程
**优先级:** 🔴 P0 (Critical)
**执行时间:** < 60s

**测试代码:**
```typescript
import { test, expect } from '@playwright/test';

test.describe('Full Interview Flow E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/interview');
    await page.click('button[data-testid="start-interview-button"]');
  });

  test('should complete entire interview question flow', async ({ page }) => {
    // Q1: Project Name
    await page.fill('input[data-testid="q-project-name"]', 'OriginOS 项目');
    await page.click('button[data-testid="next-button"]');

    // Q2: Project Type
    await expect(page.locator('h2')).toContainText('项目类型');
    await page.click('label:has-text("Web应用") input[type="radio"]');
    await page.click('button[data-testid="next-button"]');

    // Q3: Tech Stack (conditional for Web)
    await expect(page.locator('h2')).toContainText('技术栈');
    await page.click('label:has-text("React") input[type="checkbox"]');
    await page.click('label:has-text("TypeScript") input[type="checkbox"]');
    await page.click('button[data-testid="next-button"]');

    // Q4: Team Size
    await expect(page.locator('h2')).toContainText('团队规模');
    await page.click('label:has-text("5-10人") input[type="radio"]');
    await page.click('button[data-testid="next-button"]');

    // Final: Submit
    await expect(page.locator('h2')).toContainText('确认提交');
    await page.click('button[data-testid="submit-button"]');

    // Verify success
    await expect(page.locator('[data-testid="success-message"]')).toBeVisible();

    // Verify all answers saved
    const answers = await page.evaluate(() => {
      return JSON.parse(localStorage.getItem('interview_answers') || '{}');
    });

    expect(answers.projectName).toBe('OriginOS 项目');
    expect(answers.projectType).toBe('Web应用');
    expect(answers.techStack).toEqual(['React', 'TypeScript']);
  });

  test('should allow skipping optional questions', async ({ page }) => {
    // Q1: Project Name (required)
    await page.fill('input[data-testid="q-project-name"]', '测试项目');
    await page.click('button[data-testid="next-button"]');

    // Q2: Project Type
    await page.click('label:has-text("Web应用") input[type="radio"]');

    // Skip optional question
    await page.click('button[data-testid="skip-button"]');

    // Continue to next question
    await expect(page.locator('h2')).not.toContainText('项目类型');
  });

  test('should validate required questions', async ({ page }) => {
    // Try to skip required question
    await page.click('button[data-testid="next-button"]');

    // Should show validation error
    await expect(page.locator('[data-testid="validation-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="validation-error"]')).toContainText('必填');

    // Fill required field
    await page.fill('input[data-testid="q-project-name"]', '必填内容');

    // Error should disappear
    await expect(page.locator('[data-testid="validation-error"]')).not.toBeVisible();
  });
});
```

**覆盖的验收标准:** AC1, AC2, AC3, AC4

---

### TC-02-E2E-002: 条件分支E2E测试

**测试文件:** `e2e/interview/conditional-branches.spec.ts`

**测试目标:** 验证条件分支在实际流程中工作正常

**用例类别:** E2E 测试 / 条件逻辑
**优先级:** 🔴 P0 (Critical)
**执行时间:** < 45s

**测试代码:**
```typescript
import { test, expect } from '@playwright/test';

test.describe('Conditional Branches E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/interview');
    await page.click('button[data-testid="start-interview-button"]');
  });

  test('should show Web framework questions for Web apps', async ({ page }) => {
    // Name the project
    await page.fill('input[data-testid="q-project-name"]', 'Web项目');
    await page.click('button[data-testid="next-button"]');

    // Select Web App
    await page.click('label:has-text("Web应用") input[type="radio"]');
    await page.click('button[data-testid="next-button"]');

    // Should see Web framework question
    await expect(page.locator('h2')).toContainText('Web框架');

    // Verify Web options
    await expect(page.locator('label:has-text("React")')).toBeVisible();
    await expect(page.locator('label:has-text("Vue")')).toBeVisible();
    await expect(page.locator('label:has-text("Angular")')).toBeVisible();

    // Should NOT see mobile/desktop options
    await expect(page.locator('label:has-text("React Native")')).not.toBeVisible();
    await expect(page.locator('label:has-text("Electron")')).not.toBeVisible();
  });

  test('should dynamically switch questions when changing answers', async ({ page }) => {
    // Name the project
    await page.fill('input[data-testid="q-project-name"]', '测试项目');
    await page.click('button[data-testid="next-button"]');

    // Select Web App
    await page.click('label:has-text("Web应用") input[type="radio"]');
    await page.click('button[data-testid="next-button"]');

    // Should see Web framework
    await expect(page.locator('h2')).toContainText('Web框架');

    // Go back
    await page.click('button[data-testid="previous-button"]');

    // Change to Mobile
    await page.click('label:has-text("移动应用") input[type="radio"]');
    await page.click('button[data-testid="next-button"]');

    // Should see mobile framework now
    await expect(page.locator('h2')).toContainText('移动框架');
    await expect(page.locator('label:has-text("React Native")')).toBeVisible();
  });
});
```

**覆盖的验收标准:** AC5

---

### TC-02-E2E-003: 答案持久化E2E测试

**测试文件:** `e2e/interview/answer-persistence.spec.ts`

**测试目标:** 验证答案正确持久化

**用例类别:** E2E 测试 / 数据持久化
**优先级:** 🟡 P1 (High)
**执行时间:** < 30s

**测试代码:**
```typescript
import { test, expect } from '@playwright/test';

test.describe('Answer Persistence E2E', () => {
  test('should persist answers and survive page reload', async ({ page }) => {
    await page.goto('/interview');
    await page.click('button[data-testid="start-interview-button"]');

    // Answer first question
    await page.fill('input[data-testid="q-project-name"]', '持久化测试项目');
    await page.click('button[data-testid="next-button"]');

    // Reload page
    await page.reload();

    // Should show recovery UI
    await expect(page.locator('[data-testid="resume-prompt"]')).toBeVisible();

    // Click resume
    await page.click('button[data-testid="resume-button"]');

    // Should be at correct position
    await expect(page.locator('h2')).not.toContainText('项目名称');

    // Verify answer is preserved
    const answers = await page.evaluate(() => {
      return JSON.parse(localStorage.getItem('interview_answers') || '{}');
    });

    expect(answers.projectName).toBe('持久化测试项目');
  });
});
```

**覆盖的验收标准:** AC4

---

### TC-02-E2E-004: 快速输入测试

**测试文件:** `e2e/interview/rapid-input.spec.ts`

**测试目标:** 验证快速连续输入的处理

**用例类别:** E2E 测试 / 边界场景
**优先级:** 🟢 P2 (Medium)
**执行时间:** < 20s

**测试代码:**
```typescript
import { test, expect } from '@playwright/test';

test.describe('Rapid Input E2E', () => {
  test('should handle rapid next button clicks', async ({ page }) => {
    await page.goto('/interview');
    await page.click('button[data-testid="start-interview-button"]');

    // Fill
    await page.fill('input[data-testid="q-project-name"]', '项目A');

    // Rapid clicks
    await page.click('button[data-testid="next-button"]');
    await page.click('button[data-testid="next-button"]'); // Should be ignored
    await page.click('button[data-testid="next-button"]'); // Should be ignored

    // Should only advance once
    await expect(page.locator('h2')).toContainText('项目类型');

    // Should only be on second question
    const currentStep = await page.locator('[data-testid="current-step"]').textContent();
    expect(currentStep).toBe('2');
  });

  test('should debounced input validation', async ({ page }) => {
    await page.goto('/interview');
    await page.click('button[data-testid="start-interview-button"]');

    // Type rapidly
    const input = page.locator('input[data-testid="q-project-name"]');
    await input.type('A');
    await input.type('B');
    await input.type('C');

    // Validation should only trigger once after typing stops
    await expect(page.locator('[data-testid="validation-result"]')).toHaveText('valid');
  });
});
```

---

### TC-02-E2E-005: 大量选项选择测试

**测试文件:** `e2e/interview/many-options.spec.ts`

**测试目标:** 验证包含大量选项的问题

**用例类别:** E2E 测试 / 数据量测试
**优先级:** 🟢 P2 (Medium)
**执行时间:** < 30s

**测试代码:**
```typescript
import { test, expect } from '@playwright/test';

test.describe('Many Options E2E', () => {
  test('should handle question with many options efficiently', async ({ page }) => {
    await page.goto('/interview');
    await page.click('button[data-testid="start-interview-button"]');

    // Navigate to tech stack question with many options
    await page.fill('input[data-testid="q-project-name"]', '测试项目');
    await page.click('button[data-testid="next-button"]');
    await page.click('label:has-text("Web应用") input[type="radio"]');
    await page.click('button[data-testid="next-button"]');

    // Use search functionality
    await page.fill('input[data-testid="option-search"]', 'React');

    // Should filter options
    await expect(page.locator('label:has-text("React")')).toBeVisible();
    await expect(page.locator('label:has-text("Vue")')).not.toBeVisible();

    // Clear search
    await page.fill('input[data-testid="option-search"]', '');

    // Should show all options again
    await expect(page.locator('label:has-text("Vue")')).toBeVisible();

    // Select using "Select All"
    await page.click('button[data-testid="select-all"]');

    // Verify all selected
    const selectedCount = await page.locator('[data-testid="selected-count"]').textContent();
    expect(selectedCount).toMatch(/\d+/);
  });
});
```

---

### TC-02-E2E-006: 答案导出E2E测试

**测试文件:** `e2e/interview/answer-export.spec.ts`

**测试目标:** 验证答案导出功能

**用例类别:** E2E 测试 / 数据导出
**优先级:** 🟢 P2 (Medium)
**执行时间:** < 15s

**测试代码:**
```typescript
import { test, expect } from '@playwright/test';

test.describe('Answer Export E2E', () => {
  test('should export answers as JSON', async ({ page }) => {
    // Complete some questions first
    await page.goto('/interview');
    await page.click('button[data-testid="start-interview-button"]');

    await page.fill('input[data-testid="q-project-name"]', '导出测试项目');
    await page.click('button[data-testid="next-button"]');

    // Go to settings/export
    await page.click('button[data-testid="export-button"]');

    // Select JSON format
    await page.click('label:has-text("JSON") input[type="radio"]');

    // Download
    const downloadPromise = page.waitForEvent('download');
    await page.click('button[data-testid="download-export"]');

    const download = await downloadPromise;

    // Verify file content
    const content = await download.createReadStream().toString();

    const exported = JSON.parse(content);

    expect(exported.projectName).toBe('导出测试项目');
    expect(exported).toHaveProperty('timestamp');
    expect(exported).toHaveProperty('version');
  });

  test('should export answers as CSV', async ({ page }) => {
    await page.goto('/interview');
    await page.click('button[data-testid="start-interview-button"]');

    await page.fill('input[data-testid="q-project-name"]', 'CSV导出');
    await page.click('button[data-testid="next-button"]');
    await page.click('button[data-testid="export-button"]');

    await page.click('label:has-text("CSV") input[type="radio"]');

    const downloadPromise = page.waitForEvent('download');
    await page.click('button[data-testid="download-export"]');

    const download = await downloadPromise;
    const content = await download.createReadStream().toString();

    // Verify CSV format
    const lines = content.split('\n');
    expect(lines[0]).toContain('questionId,value');
    expect(content).toContain('projectName');
    expect(content).toContain('CSV导出');
  });
});
```

**覆盖的验收标准:** AC4

---

## 🚧 边界测试

### TC-02-BND-001: 空输入验证测试

**测试文件:** `src/features/interview/__tests__/boundary/empty-input.test.tsx`

**测试目标:** 验证空输入验证

**用例类别:** 边界测试 / 输入验证
**优先级:** 🟡 P1 (High)

**测试代码:**
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TextQuestion } from '../TextQuestion';

describe('Empty Input Validation', () => {
  it('should show error for empty required input', () => {
    render(<TextQuestion id="test" title="必填问题" required={true} />);

    const input = screen.getByRole('textbox');
    fireEvent.blur(input);

    expect(screen.getByText(/必填/i)).toBeInTheDocument();
  });

  it('should allow empty optional input', () => {
    render(<TextQuestion id="test" title="可选问题" required={false} />);

    const input = screen.getByRole('textbox');
    fireEvent.blur(input);

    expect(screen.queryByText(/必填/i)).not.toBeInTheDocument();
  });

  it('should trim whitespace before validation', () => {
    render(<TextQuestion id="test" title="必填问题" required={true} />);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.blur(input);

    expect(screen.getByText(/必填/i)).toBeInTheDocument();
  });
});
```

---

### TC-02-BND-002: 最大字符数测试

**测试文件:** `src/features/interview/__tests__/boundary/max-length.test.tsx`

**测试目标:** 验证最大字符数限制

**用例类别:** 边界测试 / 长度限制
**优先级:** 🟡 P1 (High)

**测试代码:**
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TextQuestion } from '../TextQuestion';

describe('Max Length Validation', () => {
  it('should prevent typing beyond max length', () => {
    const maxLength = 10;
    render(<TextQuestion id="test" title="问题" maxLength={maxLength} />);

    const input = screen.getByRole('textbox');
    const longText = 'A'.repeat(20);

    fireEvent.change(input, { target: { value: longText } });

    expect(input).toHaveValue('A'.repeat(maxLength));
  });

  it('should show character count', () => {
    render(<TextQuestion id="test" title="问题" maxLength={100} />);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Hello' } });

    expect(screen.getByText('5/100')).toBeInTheDocument();
  });

  it('should warn when approaching limit', () => {
    render(<TextQuestion id="test" title="问题" maxLength={100} />);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'A'.repeat(90) } });

    expect(screen.getByText(/还剩.*字符/i)).toBeInTheDocument();
  });
});
```

---

### TC-02-BND-003: 选项数量边界测试

**测试文件:** `src/features/interview/__tests__/boundary/option-count.test.tsx`

**测试目标:** 验证处理大量选项的表现

**用例类别:** 边界测试 / 数据量
**优先级:** 🟢 P2 (Medium)

**测试代码:**
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MultipleChoice } from '../MultipleChoice';

describe('Option Count Boundaries', () => {
  it('should render with single option', () => {
    const question = {
      id: 'test',
      type: 'multiple-choice',
      title: '单选项',
      options: ['选项1'],
    };

    render(<MultipleChoice question={question} />);

    expect(screen.getByRole('checkbox', { name: '选项1' })).toBeInTheDocument();
  });

  it('should render with many options (virtualized)', () => {
    const options = Array.from({ length: 1000 }, (_, i) => `选项${i + 1}`);
    const question = {
      id: 'test',
      type: 'multiple-choice',
      title: '多选项',
      options,
    };

    render(<MultipleChoice question={question} />);

    // Should show virtualized rendering (not all 1000 elements in DOM)
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes.length).toBeLessThan(100);
  });

  it('should show search for many options', () => {
    const options = Array.from({ length: 20 }, (_, i) => `选项${i + 1}`);
    const question = {
      id: 'test',
      type: 'multiple-choice',
      title: '搜索问题',
      options,
    };

    render(<MultipleChoice question={question} />);

    expect(screen.getByPlaceholderText('搜索...')).toBeInTheDocument();
  });
});
```

---

### TC-02-BND-004: 并发修改冲突测试

**测试文件:** `src/features/interview/__tests__/boundary/concurrent-edit.test.ts`

**测试目标:** 验证并发修改的处理

**用例类别:** 边界测试 / 并发控制
**优先级:** 🟢 P2 (Medium)

**测试代码:**
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { saveAnswer, getAnswer, hasConflict, resolveConflict } from '../../services/answerManager';
import { renderHook, act } from '@testing-library/react';
import { useAnswerState } from '../answerState';

describe('Concurrent Edit Conflicts', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should detect concurrent modifications', async () => {
    // Device A saves
    const answerA = { value: 'Answer A', timestamp: Date.now() };
    await saveAnswer('q1', answerA);

    // Device B saves (later)
    await new Promise(resolve => setTimeout(resolve, 10));
    const answerB = { value: 'Answer B', timestamp: Date.now() };

    const conflict = hasConflict(answerA, answerB);

    expect(conflict).toBe(true);
  });

  it('should resolve conflicts with last-write-wins', async () => {
    const answerA = { value: 'Answer A', timestamp: Date.now() };
    await saveAnswer('q1', answerA);

    await new Promise(resolve => setTimeout(resolve, 10));
    const answerB = { value: 'Answer B', timestamp: Date.now() };

    const resolved = resolveConflict(answerA, answerB);

    expect(resolved.value).toBe('Answer B');
  });

  it('should show conflict UI to user', async () => {
    const { result } = renderHook(() => useAnswerState());

    act(() => {
      result.current.setAnswer('q1', 'Local', {
        remote: 'Remote',
        timestamp: Date.now() + 1000,
      });
    });

    expect(result.current.hasConflict).toBe(true);
    expect(screen.getByText(/发现冲突/i)).toBeInTheDocument();
  });
});
```

---

### TC-02-BND-005: 网络中断恢复测试

**测试文件:** `src/features/interview/__tests__/boundary/offline-recovery.test.ts`

**测试目标:** 验证网络中断后的恢复

**用例类别:** 边界测试 / 网络异常
**优先级:** 🟡 P1 (High)

**测试代码:**
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { saveAnswer, getOfflineQueue, syncWhenOnline } from '../../services/offlineManager';

describe('Offline Recovery', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('navigator', {
      onLine: true,
    });
  });

  it('should queue answers when offline', async () => {
    vi.stubGlobal('navigator', {
      onLine: false,
    });

    await saveAnswer('q1', '离线答案');

    const queue = getOfflineQueue();
    expect(queue.length).toBeGreaterThan(0);
  });

  it('should sync queued answers when online', async () => {
    // Simulate offline first
    vi.stubGlobal('navigator', { onLine: false });
    await saveAnswer('q1', '离线答案1');

    // Go online
    vi.stubGlobal('navigator', { onLine: true });
    await syncWhenOnline();

    const queue = getOfflineQueue();
    expect(queue.length).toBe(0);
  });

  it('should preserve order of offline answers', async () => {
    vi.stubGlobal('navigator', { onLine: false });

    await saveAnswer('q1', '答案1');
    await saveAnswer('q2', '答案2');
    await saveAnswer('q3', '答案3');

    const queue = getOfflineQueue();

    expect(queue[0].questionId).toBe('q1');
    expect(queue[1].questionId).toBe('q2');
    expect(queue[2].questionId).toBe('q3');
  });
});
```

---

### TC-02-BND-006: 输入特殊字符测试

**测试文件:** `src/features/interview/__tests__/boundary/special-chars.test.tsx`

**测试目标:** 验证特殊字符输入处理

**用例类别:** 边界测试 / 安全性
**优先级:** 🟢 P2 (Medium)

**测试代码:**
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TextQuestion } from '../TextQuestion';

describe('Special Characters Handling', () => {
  it('should handle HTML entities safely', () => {
    render(<TextQuestion id="test" title="问题" />);

    const input = screen.getByRole('textbox');
    const dangerous = '<script>alert("xss")</script>';

    fireEvent.change(input, { target: { value: dangerous } });

    // Should escape or sanitize
    const displayed = input.value;
    expect(displayed).not.toContain('<script>');
  });

  it('should handle emoji', () => {
    render(<TextQuestion id="test" title="问题" />);

    const input = screen.getByRole('textbox');
    const emojiText = '项目🚀测试💡';

    fireEvent.change(input, { target: { value: emojiText } });

    expect(input).toHaveValue(emojiText);
  });

  it('should handle international characters', () => {
    render(<TextQuestion id="test" title="问题" />);

    const input = screen.getByRole('textbox');
    const intlText = 'プロジェクト 项目 프로젝트';

    fireEvent.change(input, { target: { value: intlText } });

    expect(input).toHaveValue(intlText);
  });
});
```

---

## 🐛 异常场景测试

### TC-02-ERR-001: 损坏答案数据恢复

**测试文件:** `src/features/interview/__tests__/error/corrupted-answers.test.ts`

**测试目标:** 验证损坏答案数据的处理

**用例类别:** 异常测试 / 数据完整性
**优先级:** 🟡 P1 (High)

**测试代码:**
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { getAnswers, recoverAnswers } from '../../services/answerRecovery';

describe('Corrupted Answers Recovery', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should detect corrupted JSON', () => {
    localStorage.setItem('interview_answers', 'invalid-json{');

    const result = getAnswers();

    expect(result.isCorrupted).toBe(true);
    expect(result.answers).toEqual({});
  });

  it('should recover from corrupted data', async () => {
    // Setup with valid backup
    localStorage.setItem('interview_answers_backup', '{"q1":"答案1","q2":"答案2"}');

    localStorage.setItem('interview_answers', 'corrupted');

    const recovered = await recoverAnswers();

    expect(recovered.answers).toEqual({
      q1: '答案1',
      q2: '答案2',
    });
  });

  it('should create empty state when no backup available', async () => {
    localStorage.setItem('interview_answers', 'corrupted');

    const recovered = await recoverAnswers();

    expect(recovered.answers).toEqual({});
    expect(recovered.createdBackup).toBe(false);
  });
});
```

---

### TC-02-ERR-002: 同步失败重试测试

**测试文件:** `src/features/interview/__tests__/error/sync-retry.test.ts`

**测试目标:** 验证同步失败后的重试机制

**用例类别:** 异常测试 / 网络异常
**优先级:** 🟡 P1 (High)

**测试代码:**
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { syncAnswer, getRetryQueue, retryFailedSync } from '../../services/syncRetry';

describe('Sync Retry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should queue failed sync for retry', async () => {
    global.fetch = vi.fn(() =>
      Promise.reject(new Error('Network Error'))
    );

    await syncAnswer({ questionId: 'q1', value: '答案' });

    const queue = getRetryQueue();

    expect(queue.length).toBeGreaterThan(0);
    expect(queue[0].questionId).toBe('q1');
  });

  it('should retry failed syncs with exponential backoff', async () => {
    let attempts = 0;

    global.fetch = vi.fn(() => {
      attempts++;
      if (attempts < 3) {
        return Promise.reject(new Error('Temp error'));
      }
      return Promise.resolve({ ok: true });
    });

    await syncAnswer({ questionId: 'q1', value: '答案' }, {
      maxRetries: 3,
      backoffMs: 100,
    });

    const queue = getRetryQueue();

    expect(queue.length).toBe(0); // Should be empty after success
  });

  it('should give up after max retries', async () => {
    global.fetch = vi.fn(() =>
      Promise.reject(new Error('Always fail'))
    );

    await syncAnswer({ questionId: 'q1', value: '答案' }, {
      maxRetries: 3,
    });

    const queue = getRetryQueue();

    expect(queue[0].attempts).toBe(3);
    expect(queue[0].failed).toBe(true);
  });
});
```

---

### TC-02-ERR-003: 磁盘空间不足测试

**测试文件:** `src/features/interview/__tests__/error/quota-exceeded.test.ts`

**测试目标:** 验证存储空间不足的处理

**用例类别:** 异常测试 / 存储异常
**优先级:** 🟢 P2 (Medium)

**测试代码:**
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { saveAnswer, getAvailableStorage } from '../../services/storageManager';

describe('Quota Exceeded', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should detect quota exceeded error', async () => {
    const originalSetItem = localStorage.setItem;
    localStorage.setItem = vi.fn(() => {
      throw new DOMException('QuotaExceededError');
    });

    const result = await saveAnswer('q1', '答案');

    expect(result.error).toBe('QuotaExceededError');
    expect(result.saved).toBe(false);

    localStorage.setItem = originalSetItem;
  });

  it('should try to free space when quota exceeded', async () => {
    localStorage.setItem = vi.fn(() => {
      throw new DOMException('QuotaExceededError');
    });

    const cleanupSpy = vi.fn();
    vi.stubGlobal('cleanupOldData', cleanupSpy);

    await saveAnswer('q1', '答案', { tryCleanup: true });

    expect(cleanupSpy).toHaveBeenCalled();
  });

  it('should report available storage', () => {
    const available = getAvailableStorage();

    expect(available).toHaveProperty('total');
    expect(available).toHaveProperty('used');
    expect(available).toHaveProperty('free');
  });
});
```

---

### TC-02-ERR-004: 问题配置错误测试

**测试文件:** `src/features/interview/__tests__/error/invalid-config.test.ts`

**测试目标:** 验证错误配置的处理

**用例类别:** 异常测试 / 配置验证
**优先级:** 🟢 P2 (Medium)

**测试代码:**
```typescript
import { describe, it, expect } from 'vitest';
import { validateQuestionConfig, Question } from '../../services/questionValidator';

describe('Invalid Configuration', () => {
  it('should detect missing required fields', () => {
    const invalidQuestion: any = {
      title: '问题',  // Missing id, type
    };

    const result = validateQuestionConfig(invalidQuestion);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('id is required');
    expect(result.errors).toContain('type is required');
  });

  it('should detect invalid question type', () => {
    const invalidQuestion: Question = {
      id: 'q1',
      type: 'invalid-type' as any,
      title: '问题',
    };

    const result = validateQuestionConfig(invalidQuestion);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Invalid type');
  });

  it('should detect circular conditional references', () => {
    const questions: Question[] = [
      {
        id: 'q1',
        type: 'text',
        title: '问题1',
        conditional: {
          showIf: { questionId: 'q2', operator: 'equals', value: 'test' },
        },
      },
      {
        id: 'q2',
        type: 'text',
        title: '问题2',
        conditional: {
          showIf: { questionId: 'q1', operator: 'equals', value: 'test' },
        },
      },
    ];

    const result = validateQuestions(questions);

    expect(result.hasCircularDependency).toBe(true);
  });
});
```

---

## ⚡ 性能测试

### 性能指标

| 指标 | 约束 | 测试方法 |
|-----|------|----------|
| 问题切换响应时间 | < 200ms | 计时测试 |
| 答案保存时间 | < 100ms | 计时测试 |
| 大量选项渲染 | < 500ms | 渲染性能 |
| 同步API调用 | < 1s | 网络性能 |

---

### TC-02-PERF-001: 问题切换性能

**测试文件:** `src/features/interview/__tests__/performance/navigation-speed.test.ts`

**测试目标:** 验证问题切换响应时间

**用例类别:** 性能测试 / 响应速度
**优先级:** 🟡 P1 (High)
**目标:** < 200ms

**测试代码:**
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useQuestionNavigation } from '../questionNavigation';

describe('Navigation Speed Performance', () => {
  beforeEach(() => {
    const { reset } = useQuestionNavigation.getState();
    reset();
  });

  it('should navigate to next question within 200ms', () => {
    const { result } = renderHook(() => useQuestionNavigation());

    const startTime = performance.now();

    act(() => {
      result.current.next();
    });

    const endTime = performance.now();
    const duration = endTime - startTime;

    expect(duration).toBeLessThan(200);
  });

  it('should handle rapid navigation without degradation', () => {
    const { result } = renderHook(() => useQuestionNavigation());

    const times: number[] = [];

    for (let i = 0; i < 100; i++) {
      const startTime = performance.now();

      act(() => {
        result.current.next();
        if (i > 0) result.current.previous();
      });

      const endTime = performance.now();
      times.push(endTime - startTime);
    }

    const avgTime = times.reduce((a, b) => a + b) / times.length;

    expect(avgTime).toBeLessThan(50); // Should be even faster when warmed up
  });
});
```

---

### TC-02-PERF-002: 答案保存性能

**测试文件:** `src/features/interview/__tests__/performance/answer-save-speed.test.ts`

**测试目标:** 验证答案保存性能

**用例类别:** 性能测试 / 写入性能
**优先级:** 🟡 P1 (High)
**目标:** < 100ms

**测试代码:**
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { saveAnswer, getAnswers } from '../../services/answerPersistence';

describe('Answer Save Performance', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should save answer within 100ms', () => {
    const startTime = performance.now();

    saveAnswer('q1', '测试答案');

    const endTime = performance.now();
    const duration = endTime - startTime;

    expect(duration).toBeLessThan(100);
  });

  it('should save multiple answers efficiently', () => {
    const times: number[] = [];

    for (let i = 0; i < 1000; i++) {
      const startTime = performance.now();

      saveAnswer(`q${i}`, `答案${i}`);

      const endTime = performance.now();
      times.push(endTime - startTime);
    }

    const avgTime = times.reduce((a, b) => a + b) / times.length;

    expect(avgTime).toBeLessThan(5); // Should average < 5ms per save
  });
});
```

---

### TC-02-PERF-003: 大量选项渲染性能

**测试文件:** `src/features/interview/__tests__/performance/option-rendering.test.tsx`

**测试目标:** 验证大量选项的渲染时间

**用例类别:** 性能测试 / 渲染性能
**优先级:** 🟢 P2 (Medium)
**目标:** < 500ms

**测试代码:**
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MultipleChoice } from '../MultipleChoice';
import { Question } from '../../types';

describe('Option Rendering Performance', () => {
  it('should render 1000 options within 500ms', () => {
    const options = Array.from({ length: 1000 }, (_, i) => `选项${i + 1}`);
    const question: Question = {
      id: 'test',
      type: 'multiple-choice',
      title: '多选项',
      options,
    };

    const startTime = performance.now();

    render(<MultipleChoice question={question} />);

    const endTime = performance.now();
    const duration = endTime - startTime;

    expect(duration).toBeLessThan(500);
  });

  it('should use virtualization for many options', () => {
    const options = Array.from({ length: 1000 }, (_, i) => `选项${i + 1}`);
    const question: Question = {
      id: 'test',
      type: 'multiple-choice',
      title: '多选项',
      options,
    };

    const { container } = render(<MultipleChoice question={question} />);

    const checkboxes = container.querySelectorAll('input[type="checkbox"]');

    // With virtualization, only a subset should be in DOM
    expect(checkboxes.length).toBeLessThan(100);
  });
});
```

---

### TC-02-PERF-004: 条件逻辑计算性能

**测试文件:** `src/features/interview/__tests__/performance/conditional-eval.test.ts`

**测试目标:** 验证条件逻辑评估性能

**用例类别:** 性能测试 / 逻辑计算
**优先级:** 🟢 P2 (Medium)

**测试代码:**
```typescript
import { describe, it, expect } from 'vitest';
import { getNextQuestions, Question } from '../../services/conditionalLogic';

describe('Conditional Evaluation Performance', () => {
  const createComplexQuestions = (count: number): Question[] => {
    return Array.from({ length: count }, (_, i) => ({
      id: `q${i}`,
      type: 'text',
      title: `问题${i}`,
      conditional: {
        showIf: {
          operator: 'AND',
          conditions: [
            { questionId: `q${i % 5}`, operator: 'equals', value: 'test' },
            { questionId: `q${(i + 1) % 5}`, operator: 'not_equals', value: 'skip' },
          ],
        },
      },
    }));
  };

  it('should evaluate 100 conditional rules within 100ms', () => {
    const questions = createComplexQuestions(100);
    const answers: Record<string, any> = {};

    const startTime = performance.now();

    const visible = getNextQuestions(answers, questions);

    const endTime = performance.now();
    const duration = endTime - startTime;

    expect(duration).toBeLessThan(100);
  });

  it('should cache conditional evaluations', () => {
    const questions = createComplexQuestions(10);
    const answers: Record<string, any> = {};

    // First evaluation
    const startTime1 = performance.now();
    getNextQuestions(answers, questions);
    const duration1 = performance.now() - startTime1;

    // Second evaluation (should use cache)
    const startTime2 = performance.now();
    getNextQuestions(answers, questions);
    const duration2 = performance.now() - startTime2;

    expect(duration2).toBeLessThan(duration1 / 2);
  });
});
```

---

## 🎭 用户体验测试

### TC-02-UX-001: 键盘导航测试

**测试文件:** `src/features/interview/__tests__/ux/keyboard-navigation.test.tsx`

**测试目标:** 验证键盘导航支持

**用例类别:** UX 测试 / 键盘可访问性
**优先级:** 🟢 P2 (Medium)

**测试代码:**
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MultipleChoice } from '../MultipleChoice';
import { Question } from '../../types';

describe('Keyboard Navigation', () => {
  const question: Question = {
    id: 'test',
    type: 'multiple-choice',
    title: '多选项',
    options: ['选项1', '选项2', '选项3', '选项4'],
  };

  it('should navigate options with arrow keys', () => {
    render(<MultipleChoice question={question} />);

    const firstCheckbox = screen.getByRole('checkbox', { name: '选项1' });
    firstCheckbox.focus();

    fireEvent.keyDown(firstCheckbox, { key: 'ArrowDown' });

    const secondCheckbox = screen.getByRole('checkbox', { name: '选项2' });
    expect(secondCheckbox).toHaveFocus();
  });

  it('should select option with Space key', () => {
    const onChange = vi.fn();
    render(<MultipleChoice question={question} onChange={onChange} />);

    const checkbox = screen.getByRole('checkbox', { name: '选项1' });
    checkbox.focus();

    fireEvent.keyDown(checkbox, { key: ' ' });

    expect(onChange).toHaveBeenCalled();
    expect(checkbox).toBeChecked();
  });

  it('should submit form with Enter key', () => {
    render(<MultipleChoice question={question} />);

    const checkbox = screen.getByRole('checkbox', { name: '选项1' });
    checkbox.focus();

    fireEvent.keyDown(checkbox, { key: 'Enter' });

    // Should trigger submit/next action
  });
});
```

---

### TC-02-UX-002: 进度可视化测试

**测试文件:** `src/features/interview/__tests__/ux/progress-viz.test.tsx`

**测试目标:** 验证进度可视化的清晰度

**用例类别:** UX 测试 / 进度显示
**优先级:** 🟢 P2 (Medium)

**测试代码:**
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProgressBar } from '../ProgressBar';

describe('Progress Visualization', () => {
  it('should show percentage clearly', () => {
    render(<ProgressBar current={3} total={10} />);

    expect(screen.getByText('30%')).toBeInTheDocument();
  });

  it('should show step fraction clearly', () => {
    render(<ProgressBar current={3} total={10} />);

    expect(screen.getByText('3/10')).toBeInTheDocument();
  });

  it('should provide estimated time remaining', () => {
    render(<ProgressBar current={3} total={10} avgTimePerQuestion={30} />);

    const timeRemaining = screen.getByText(/约.*分钟/);
    expect(timeRemaining).toBeInTheDocument();
  });

  it('should highlight current step in step indicator', () => {
    render(<Stepper current={2} steps={[1, 2, 3, 4, 5]} />);

    const currentStep = screen.getByTestId('step-2');
    expect(currentStep).toHaveClass('active');
  });
});
```

---

## 📊 测试数据

### 测试数据集 1: 问题配置

**用途:** 测试各种问题类型的配置

**数据:**
```json
{
  "questions": {
    "text": {
      "id": "q1",
      "type": "text",
      "title": "项目名称",
      "description": "请输入您的项目名称",
      "required": true,
      "validation": {
        "minLength": 2,
        "maxLength": 50,
        "pattern": "^[\\u4e00-\\u9fa5a-zA-Z0-9\\s]+$"
      }
    },
    "singleChoice": {
      "id": "q2",
      "type": "single-choice",
      "title": "项目类型",
      "options": ["Web应用", "移动应用", "桌面应用", "API服务"],
      "required": true
    },
    "multipleChoice": {
      "id": "q3",
      "type": "multiple-choice",
      "title": "技术栈",
      "options": ["React", "Vue", "Angular", "TypeScript", "JavaScript"],
      "required": false
    },
    "category": {
      "id": "q4",
      "type": "category",
      "title": "详细分类",
      "categories": [
        {
          "id": "frontend",
          "name": "前端",
          "items": ["React", "Vue", "Angular"]
        },
        {
          "id": "backend",
          "name": "后端",
          "items": ["Node.js", "Python", "Go", "Java"]
        }
      ],
      "required": false
    }
  }
}
```

### 测试数据集 2: 条件分支场景

**用途:** 测试复杂的条件逻辑

**数据:**
```json
{
  "conditionalScenarios": {
    "webAppPath": {
      "triggers": [{ "q1": "Web应用" }],
      "nextQuestions": ["web-framework", "css-framework", "state-management"]
    },
    "mobileAppPath": {
      "triggers": [{ "q1": "移动应用" }],
      "nextQuestions": ["mobile-framework", "platform-selection"]
    },
    "complexConditions": {
      "showIf": {
        "operator": "AND",
        "conditions": [
          { "q1": "Web应用" },
          { "q2": "React" },
          { "q3": "大型项目" }
        ]
      },
      "nextQuestions": ["architecture-choice", "team-structure"]
    }
  }
}
```

---

## ✅ 验收标准测试

### AC1: 系统按预设顺序展示访谈问题

**Given** 用户启动访谈
**When** 用户回答问题并点击下一步
**Then** 问题按预设顺序依次展示

**测试用例:** TC-02-001, TC-02-011, TC-02-INT-001

**测试结果:** ☐ Pass / ☐ Fail

**测试证据:**
- 单元测试: `TC-02-001, TC-02-011`
- 集成测试: `TC-02-INT-001`

---

### AC2: 支持多种问题类型（文本、单选、多选、分类选择）

**Given** 访谈包含不同类型的问题
**When** 用户查看问题
**Then** 每种问题类型正确渲染并支持相应交互

**测试用例:** TC-02-001, TC-02-008, TC-02-009

**测试结果:** ☐ Pass / ☐ Fail

**测试证据:**
- 单元测试: `TC-02-001, TC-02-008, TC-02-009`

---

### AC3: 支持跳过问题和修改答案

**Given** 用户在访谈过程中
**When** 用户点击跳过或返回上一题
**Then** 可以跳过可选问题并修改已答问题

**测试用例:** TC-02-006, TC-02-007, TC-02-INT-001

**测试结果:** ☐ Pass / ☐ Fail

**测试证据:**
- 单元测试: `TC-02-006, TC-02-007`
- 集成测试: `TC-02-INT-001`

---

### AC4: 收集的答案正确保存并验证

**Given** 用户回答问题
**When** 答案被收集
**Then** 答案被正确保存并满足验证规则

**测试用例:** TC-02-002, TC-02-005, TC-02-INT-003

**测试结果:** ☐ Pass / ☐ Fail

**测试证据:**
- 单元测试: `TC-02-002, TC-02-005`
- 集成测试: `TC-02-INT-003`

---

### AC5: 根据用户回答动态调整后续问题（条件分支）

**Given** 用户回答某个问题
**When** 答案满足特定条件
**Then** 后续问题根据条件动态调整

**测试用例:** TC-02-004, TC-02-INT-002, TC-02-E2E-002

**测试结果:** ☐ Pass / ☐ Fail

**测试证据:**
- 单元测试: `TC-02-004`
- 集成测试: `TC-02-INT-002`
- E2E 测试: `TC-02-E2E-002`

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

---

## 📌 相关文档

- [Story 1.2 README](./README-1.2.md)
- [测试模板](../../templates/story-spec-template/testing.md)
- [Story 1.1 测试用例](./test-cases-1.1-interview-start.md)
