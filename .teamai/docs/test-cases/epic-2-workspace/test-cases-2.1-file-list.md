# 测试文档 - Story 2.1: 文件列表查看

**Story:** 文件列表查看 (Story-2.1-File-List)
**Epic:** 基础工作空间 (Epic-2-Workspace)
**版本:** 1.0
**创建日期:** 2026-03-23
**最后更新:** 2026-03-23

---

## 🎯 测试目标

验证用户能够正确查看项目文件列表，支持排序、过滤和空状态处理。

---

## 📋 需求概要

**用户故事:** 作为用户，我希望能够查看项目中的所有文件，以便了解项目结构和快速找到需要的文件。

## 验收标准 (AC)

- AC1: 文件列表正确显示所有文件和文件夹
- AC2: 支持文件名、类型、大小、日期排序
- AC3: 支持按文件类型过滤
- AC4: 空项目显示友好的空状态提示
- AC5: 支持文件夹展开/折叠

---

## 📊 测试策略

### 测试层级

```
┌─────────────────────────────────┐
│  E2E 测试 (End-to-End)          │  打开项目→查看列表→操作排序过滤
└────────────┬────────────────────┘
             ↓
┌─────────────────────────────────┐
│  集成测试 (Integration)         │  组件↔数据服务集成
└────────────┬────────────────────┘
             ↓
┌─────────────────────────────────┐
│  单元测试 (Unit)                │  排序/过滤/渲染逻辑
└─────────────────────────────────┘
```

### 测试覆盖率目标

| 测试类型 | 覆盖率目标 | 测试用例数 |
|---------|-----------|-----------|
| 单元测试 | > 85% | 5 |
| 集成测试 | > 80% | 3 |
| E2E 测试 | 关键路径 100% | 3 |
| 边界测试 | 100% | 2 |

### 测试矩阵

| 维度 | 类别 | 覆盖项 |
|-----|------|--------|
| **功能维** | 列表显示 | 文件、文件夹、图标、元数据 |
| **状态维** | 数据状态 | 空项目、单文件、多文件、大量文件 |
| **场景维** | 交互场景 | 排序、过滤、搜索、滚动 |

---

## 🧪 单元测试

### 测试文件位置

```
src/components/workspace/__tests__/FileList.test.tsx
src/components/workspace/__tests__/FileItem.test.tsx
src/lib/workspace/__tests__/fileUtils.test.ts
```

### TC-E2-001: 空项目渲染测试

**测试目标:** 验证空项目显示友好的空状态

**优先级:** 🔴 P0 (Critical)

**测试代码:**
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FileList } from '../FileList';
import { emptyProject } from '@/__tests__/fixtures/workspace/fixtures';

describe('FileList - 空项目场景', () => {
  beforeEach(() => {
    vitest.clearAllMocks();
  });

  it('should display empty state message', () => {
    render(<FileList project={emptyProject} />);

    expect(screen.getByText(/暂无文件/i)).toBeInTheDocument();
    expect(screen.getByText(/点击上方按钮创建文件/i)).toBeInTheDocument();
  });

  it('should show empty state icon', () => {
    const { container } = render(<FileList project={emptyProject} />);

    const icon = container.querySelector('[data-testid="empty-state-icon"]');
    expect(icon).toBeInTheDocument();
  });
});
```

**覆盖的验收标准:** AC4

---

### TC-E2-002: 文件列表渲染测试

**测试目标:** 验证文件和文件夹正确渲染

**优先级:** 🔴 P0 (Critical)

**测试代码:**
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FileList } from '../FileList';
import { multipleFilesProject } from '@/__tests__/fixtures/workspace/fixtures';

describe('FileList - 文件列表渲染', () => {
  it('should display all files', () => {
    render(<FileList project={multipleFilesProject} />);

    expect(screen.getByText('README.md')).toBeInTheDocument();
    expect(screen.getByText('API.md')).toBeInTheDocument();
    expect(screen.getByText('config.json')).toBeInTheDocument();
    expect(screen.getByText('notes.txt')).toBeInTheDocument();
  });

  it('should display correct file icons', () => {
    const { container } = render(<FileList project={multipleFilesProject} />);

    const markdownFiles = container.querySelectorAll('[data-file-type="markdown"]');
    expect(markdownFiles).toHaveLength(2);
  });
});
```

**覆盖的验收标准:** AC1

---

### TC-E2-003: 排序功能测试

**测试目标:** 验证文件排序功能正常工作

**优先级:** 🟡 P1 (High)

**测试代码:**
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FileList } from '../FileList';
import { multipleFilesProject } from '@/__tests__/fixtures/workspace/fixtures';

describe('FileList - 排序功能', () => {
  it('should sort files by name', () => {
    render(<FileList project={multipleFilesProject} />);

    const sortButton = screen.getByText(/名称/i);
    fireEvent.click(sortButton);

    // 验证排序结果
    const files = screen.getAllByTestId('file-item');
    expect(files[0]).toHaveTextContent('API.md');
  });

  it('should sort files by size', () => {
    render(<FileList project={multipleFilesProject} />);

    const sortButton = screen.getByText(/大小/i);
    fireEvent.click(sortButton);

    // 验证排序结果
    const files = screen.getAllByTestId('file-item');
    expect(files[0]).toHaveTextContent('notes.txt'); // 20 bytes
  });

  it('should sort files by date', () => {
    render(<FileList project={multipleFilesProject} />);

    const sortButton = screen.getByText(/日期/i);
    fireEvent.click(sortButton);

    // 验证排序结果（最新在前）
    const files = screen.getAllByTestId('file-item');
    expect(files).toHaveLength(4);
  });
});
```

**覆盖的验收标准:** AC2

---

### TC-E2-004: 过滤功能测试

**测试目标:** 验证文件类型过滤功能

**优先级:** 🟡 P1 (High)

**测试代码:**
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FileList } from '../FileList';
import { multipleFilesProject } from '@/__tests__/fixtures/workspace/fixtures';

describe('FileList - 过滤功能', () => {
  it('should filter by file type', () => {
    render(<FileList project={multipleFilesProject} />);

    const filterButton = screen.getByText(/Markdown/i);
    fireEvent.click(filterButton);

    expect(screen.getByText('README.md')).toBeInTheDocument();
    expect(screen.getByText('API.md')).toBeInTheDocument();
    expect(screen.queryByText('config.json')).not.toBeInTheDocument();
    expect(screen.queryByText('notes.txt')).not.toBeInTheDocument();
  });

  it('should show all files when "All" filter is selected', () => {
    render(<FileList project={multipleFilesProject} />);

    const allButton = screen.getByText(/全部/i);
    fireEvent.click(allButton);

    expect(screen.getByText('README.md')).toBeInTheDocument();
    expect(screen.getByText('API.md')).toBeInTheDocument();
    expect(screen.getByText('config.json')).toBeInTheDocument();
    expect(screen.getByText('notes.txt')).toBeInTheDocument();
  });
});
```

**覆盖的验收标准:** AC3

---

### TC-E2-005: 文件夹展开/折叠测试

**测试目标:** 验证文件夹展开折叠功能

**优先级:** 🟡 P1 (High)

**测试代码:**
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FileList } from '../FileList';
import { nestedFolderProject } from '@/__tests__/fixtures/workspace/fixtures';

describe('FileList - 文件夹操作', () => {
  it('should expand folder on click', () => {
    render(<FileList project={nestedFolderProject} />);

    const folder = screen.getByText(/docs/i);
    fireEvent.click(folder);

    expect(screen.getByText('guide.md')).toBeInTheDocument();
  });

  it('should collapse folder when expanded', () => {
    render(<FileList project={nestedFolderProject} />);

    const folder = screen.getByText(/src/i);
    fireEvent.click(folder);
    fireEvent.click(folder);

    // 文件夹折叠后，子文件应该不可见
    expect(screen.queryByText('Button.tsx')).not.toBeInTheDocument();
  });
});
```

**覆盖的验收标准:** AC5

---

## 🔌 集成测试

### TC-E2-INT-001: 文件列表数据加载集成

**测试目标:** 验证组件正确加载和显示项目数据

**优先级:** 🟡 P1 (High)

**测试代码:**
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { FileListContainer } from '../FileListContainer';
import { projectService } from '@/services/projectService';
import { multipleFilesProject } from '@/__tests__/fixtures/workspace/fixtures';

// Mock project service
vi.mock('@/services/projectService');
const mockedProjectService = vi.mocked(projectService);

describe('FileList - 数据加载集成', () => {
  beforeEach(() => {
    vitest.clearAllMocks();
  });

  it('should load and display project files', async () => {
    mockedProjectService.getProject.mockResolvedValue(multipleFilesProject);

    render(<FileListContainer projectId="project-multiple" />);

    await waitFor(() => {
      expect(screen.getByText('README.md')).toBeInTheDocument();
    });

    expect(mockedProjectService.getProject).toHaveBeenCalledWith('project-multiple');
  });

  it('should show loading state while fetching', async () => {
    mockedProjectService.getProject.mockImplementation(() =>
      new Promise(resolve => setTimeout(() => resolve(multipleFilesProject), 100))
    );

    const { container } = render(<FileListContainer projectId="project-multiple" />);

    expect(container.querySelector('[data-testid="loading-spinner"]')).toBeInTheDocument();

    await waitFor(() => {
      expect(container.querySelector('[data-testid="loading-spinner"]')).not.toBeInTheDocument();
    });
  });

  it('should handle error state gracefully', async () => {
    mockedProjectService.getProject.mockRejectedValue(new Error('Failed to load'));

    render(<FileListContainer projectId="invalid-id" />);

    await waitFor(() => {
      expect(screen.getByText(/加载失败/i)).toBeInTheDocument();
    });
  });
});
```

---

## 🎭 E2E 测试

### TC-E2-E2E-001: 完整文件查看流程

**测试目标:** 验证用户打开项目并查看文件列表的完整流程

**优先级:** 🟡 P1 (High)

**测试代码 (Playwright):**
```typescript
import { test, expect } from '@playwright/test';

test.describe('File List E2E', () => {
  test('user can view project file list', async ({ page }) => {
    // 打开应用
    await page.goto('/');

    // 选择项目
    await page.click('[data-testid="project-multiple"]');

    // 等待文件列表加载
    await page.waitForSelector('[data-testid="file-list"]');

    // 验证文件列表显示
    await expect(page.locator('text=README.md')).toBeVisible();
    await expect(page.locator('text=API.md')).toBeVisible();
    await expect(page.locator('text=config.json')).toBeVisible();

    // 测试排序
    await page.click('[data-testid="sort-by-name"]');
    const files = await page.locator('[data-testid="file-item"]').allTextContents();
    expect(files[0]).toBe('API.md');

    // 测试过滤
    await page.click('[data-testid="filter-markdown"]');
    await expect(page.locator('text=config.json')).not.toBeVisible();
    await expect(page.locator('text=API.md')).toBeVisible();
  });

  test('empty project shows helpful message', async ({ page }) => {
    await page.goto('/');

    await page.click('[data-testid="project-empty"]');
    await page.waitForSelector('[data-testid="empty-state"]');

    await expect(page.locator('text=暂无文件')).toBeVisible();
    await expect(page.locator('text=点击上方按钮创建文件')).toBeVisible();
  });
});
```

---

## ⚡ 性能测试

### TC-E2-PERF-001: 大量文件渲染性能

**测试目标:** 验证项目包含大量文件时的渲染性能

**优先级:** 🟢 P2 (Medium)

**性能指标:**
- 列表渲染时间 < 500ms
- 滚动 FPS > 55
- 排序操作响应时间 < 300ms

**测试代码:**
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FileList } from '../FileList';
import { createLargeProjectFixture } from '@/__tests__/fixtures/workspace/fixtures';

describe('FileList - 性能测试', () => {
  it('should render large file list within 500ms', () => {
    const largeProject = createLargeProjectFixture(1000); // 1000 个文件

    const start = performance.now();
    render(<FileList project={largeProject} />);
    const end = performance.now();

    expect(end - start).toBeLessThan(500);
  });

  it('should handle sorting of large list efficiently', () => {
    const largeProject = createLargeProjectFixture(1000);
    const { rerender } = render(<FileList project={largeProject} />);

    const start = performance.now();
    rerender(<FileList project={{ ...largeProject,sortBy: 'size' }} />);
    const end = performance.now();

    expect(end - start).toBeLessThan(300);
  });
});
```

---

## 🐛 边界测试

### TC-E2-EDGE-001: 特殊字符文件名

**测试目标:** 验证包含特殊字符的文件名正确显示

**优先级:** 🟢 P2 (Medium)

**测试代码:**
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FileList } from '../FileList';

describe('FileList - 边界情况', () => {
  it('should handle files with special characters in name', () => {
    const projectWithSpecialChars = {
      ...emptyProject,
      files: [
        { id: '1', name: 'file with spaces.md', type: 'markdown', size: 10 },
        { id: '2', name: '文件名中文.md', type: 'markdown', size: 10 },
        { id: '3', name: 'file-with-dashes.md', type: 'markdown', size: 10 },
        { id: '4', name: 'file_with_underscores.md', type: 'markdown', size: 10 },
      ],
    };

    render(<FileList project={projectWithSpecialChars} />);

    expect(screen.getByText('file with spaces.md')).toBeInTheDocument();
    expect(screen.getByText('文件名中文.md')).toBeInTheDocument();
  });

  it('should handle extremely long file names', () => {
    const longName = 'a'.repeat(200);
    const projectWithLongName = {
      ...emptyProject,
      files: [{ id: '1', name: `${longName}.md`, type: 'markdown', size: 10 }],
    };

    const { container } = render(<FileList project={projectWithLongName} />);

    const fileElement = screen.getByTestId(/file-item/);
    expect(fileElement).toBeInTheDocument();
    // 验证被截断显示
    expect(container.textContent).toContain('...');
  });
});
```

---

## 📊 测试结果记录

| 执行日期 | 测试人员 | 版本 | 通过 | 失败 | 跳过 | 通过率 |
|---------|---------|------|------|------|------|--------|
| - | - | - | - | - | - | - |

---

## ✅ QA 检查清单

### 代码质量
- [ ] 代码覆盖率达标 (> 85%)
- [ ] 无 lint 错误
- [ ] 类型检查通过

### 功能验证
- [ ] 所有验收标准 (AC) 已验证
- [ ] 边界情况已测试
- [ ] 错误处理已验证

### 性能验证
- [ ] 大量文件渲染性能达标
- [ ] 排序/过滤响应迅速

### 用户体验
- [ ] 空状态友好
- [ ] 加载状态清晰
- [ ] 错误提示明确
