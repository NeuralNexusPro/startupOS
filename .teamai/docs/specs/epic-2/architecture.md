# Epic 2: Technical Architecture

**Epic**: 基础工作空间 (Basic Workspace)
**Document Version**: 1.0
**Date**: 2026-03-23
**Author**: Architect (CTO)

---

## 📋 Executive Summary

Epic 2 实现文件管理功能，支持用户查看、创建、编辑、删除和工作空间中的文件。系统使用文件系统 JSON 存储，与现有 pi-agent 和窗体系统集成。

---

## 🏗️ 系统架构

### 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend Layer                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │   Workspace  │  │  File Editor │  │  File List   │       │
│  │   Layout     │  │ Component    │  │  Component   │       │
│  └──────┬───────┘  └───────┬──────┘  └───────┬──────┘       │
│         │                  │                  │              │
│         └──────────────────┴──────────────────┘              │
│                            │                                 │
└────────────────────────────┼─────────────────────────────────┘
                             │
┌────────────────────────────┼─────────────────────────────────┐
│                       Next.js API Layer                      │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  POST   /api/files              → 创建文件             │  │
│  │  GET    /api/files              → 获取文件列表         │  │
│  │  GET    /api/files/:id          → 获取文件内容         │  │
│  │  PUT    /api/files/:id          → 更新文件内容         │  │
│  │  DELETE /api/files/:id          → 删除文件             │  │
│  │  GET    /api/files/:id/versions → 获取版本历史         │  │
│  │  POST   /api/files/:id/restore  → 恢复版本             │  │
│  └────────────────────────────────────────────────────────┘  │
└────────────────────────────┼─────────────────────────────────┘
                             │
┌────────────────────────────┼─────────────────────────────────┐
│                       Data Access Layer                       │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  FileStorageService                                   │  │
│  │  - readFile(): 读取文件                                │  │
│  │  - writeFile(): 写入文件                               │  │
│  │  - deleteFile(): 删除文件                              │  │
│  │  - listFiles(): 列出文件                               │  │
│  │  - saveVersion(): 保存版本                             │  │
│  ├────────────────────────────────────────────────────────┤  │
│  │  ProjectStorageService                                 │  │
│  │  - getProjectFiles(): 获取项目文件                     │  │
│  │  - createProject(): 创建项目                           │  │
│  └────────────────────────────────────────────────────────┘  │
└────────────────────────────┼─────────────────────────────────┘
                             │
┌────────────────────────────┼─────────────────────────────────┐
│                     File System Storage                       │
│  data/                                                     │
│  ├── workspace/                                           │
│  │   ├── projects/                                        │
│  │   │   ├── {projectId}/                                 │
│  │   │   │   ├── files/                                   │
│  │   │   │   │   ├── {fileId}.json                        │  │
│  │   │   │   │   └── {fileId}.md                          │  │
│  │   │   │   └── versions/                                │
│  │   │   │       └── {fileId}/                            │
│  │   │   │           └── {version}.json                   │  │
│  │   │   └── project.json                                │  │
│  │   └── workspace.json                                  │  │
└─────────────────────────────────────────────────────────────┘
```

---

## 📂 组件架构

### Frontend Components

```
components/
├── workspace/
│   ├── WorkspaceLayout.tsx          # 工作空间主布局
│   ├── FileList.tsx                 # 文件列表组件
│   ├── FileListItem.tsx             # 文件列表项
│   ├── FileEditor.tsx               # Markdown 编辑器
│   ├── MarkdownPreview.tsx          # Markdown 预览
│   ├── FileToolbar.tsx              # 编辑工具栏
│   ├── FileCreateDialog.tsx         # 文件创建对话框
│   ├── FileDeleteDialog.tsx         # 文件删除确认对话框
│   ├── VersionHistory.tsx           # 版本历史视图
│   ├── ProjectFolder.tsx            # 项目文件夹组件
│   └── useFileState.ts              # 文件状态 Hook
└── window/
    ├── DesktopWindow.tsx            # 窗体容器 (已存在)
    └── WindowDragHandle.tsx         # 窗体拖拽 (已存在)
```

### Backend Services

```
lib/services/
├── file-storage.service.ts          # 文件存储服务
├── project-storage.service.ts       # 项目存储服务
├── version-control.service.ts       # 版本控制服务
└── markdown.service.ts              # Markdown 渲染服务
```

### Data Models

```
types/
├── file.ts                          # 文件类型定义
├── project.ts                       # 项目类型定义
├── version.ts                       # 版本类型定义
└── workspace.ts                     # 工作空间类型定义
```

---

## 🔌 API Architecture

### File Management API

所有 API 路由位于 `app/api/files/` 目录：

```
app/api/files/
├── route.ts                         # 文件列表/创建
└── [id]/
    ├── route.ts                     # 文件 CRUD
    ├── versions/
    │   └── route.ts                 # 版本历史
    └── restore/
        └── route.ts                 # 版本恢复
```

### API Response Format

统一响应格式：

```typescript
// 成功响应
{
  success: true,
  data: T,
  timestamp: string
}

// 错误响应
{
  success: false,
  error: {
    code: string,
    message: string,
    details?: any
  },
  timestamp: string
}
```

---

## 💾 Data Storage

### File Metadata Structure

```typescript
interface FileMetadata {
  id: string;
  name: string;
  type: 'markdown' | 'text' | 'json' | 'yaml';
  projectId: string;
  path: string;
  size: number;
  createdAt: string;
  updatedAt: string;
  currentVersion: number;
  parentFolderId?: string;
}
```

### File Content Structure

```typescript
interface FileContent {
  id: string;
  metadata: FileMetadata;
  content: string;
}
```

### Version History Structure

```typescript
interface FileVersion {
  id: string;
  fileId: string;
  version: number;
  content: string;
  createdAt: string;
  createdBy: string;
  comment?: string;
}
```

### Project Structure

```typescript
interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  files: FileMetadata[];
}
```

### Workspace Structure

```typescript
interface Workspace {
  id: string;
  name: string;
  projects: Project[];
  settings: WorkspaceSettings;
}

interface WorkspaceSettings {
  defaultProjectId?: string;
  autoSave: boolean;
  autoSaveInterval: number; // in seconds
}
```

---

## 🔍 Version Control Strategy

### MVP 方案：简单快照版本控制

**存储策略**：
- 每次保存文件时创建新版本快照
- 版本按时间戳递增编号
- 保留最近 N 个版本（默认 10 个）

**存储路径**：
```
data/workspace/projects/{projectId}/versions/{fileId}/{version}.json
```

**版本限制**：
- 配置选项：`maxVersionsPerFile` (default: 10)
- 超出限制时自动删除最旧的版本
- 用户可手动指定"固定版本"不被删除

---

## 📁 Project-Dimension File Organization

### 虚拟文件夹结构

虽然文件在物理上存储为扁平 JSON 文件，但前端展示为层级项目文件夹：

```typescript
interface VirtualFolder {
  id: string;
  name: string;
  type: 'folder' | 'file';
  children?: VirtualFolder[];
  fileMetadata?: FileMetadata;
  collapsed?: boolean;
}
```

### 文件夹树构建逻辑

```typescript
function buildFolderTree(files: FileMetadata[]): VirtualFolder[] {
  // 按 projectId 分组
  const projectGroups = groupBy(files, 'projectId');

  // 构建项目文件夹
  return Object.entries(projectGroups).map(([projectId, files]) => ({
    id: projectId,
    name: getProjectName(projectId), // 从 project.json 读取
    type: 'folder',
    children: files.map(file => ({
      id: file.id,
      name: file.name,
      type: 'file',
      fileMetadata: file
    }))
  }));
}
```

---

## 🔄 State Management

###文件状态流

```typescript
// 使用 Zustand 管理
interface FileState {
  // 当前打开的文件
  currentFile: {
    id: string;
    content: string;
    isDirty: boolean;
    lastSaved: string;
  } | null;

  // 文件列表
  files: FileMetadata[];

  // 当前选中的项目
  selectedProjectId: string | null;

  // 文件夹展开状态
  expandedFolders: Set<string>;

  // 版本历史
  versionHistory: FileVersion[];

  // Actions
  loadFiles: () => Promise<void>;
  openFile: (id: string) => Promise<void>;
  saveFile: (content: string) => Promise<void>;
  createFile: (file: Partial<FileMetadata>) => Promise<void>;
  deleteFile: (id: string) => Promise<void>;
  toggleFolder: (id: string) => void;
  loadVersionHistory: (fileId: string) => Promise<void>;
  restoreVersion: (fileId: string, version: number) => Promise<void>;
}
```

---

## 🎨 Integration with Existing Systems

### FluentOS Window System

Epic 2 复用现有窗体管理系统：

```typescript
// 使用现有 DesktopWindow 组件
<DesktopWindow
  title="工作空间"
  defaultPosition={{ x: 100, y: 50 }}
  defaultSize={{ width: 1200, height: 700 }}
>
  <WorkspaceLayout />
</DesktopWindow>
```

### pi-agent Integration

文件内容可以传递给 pi-agent 进行处理：

```typescript
// 示例：将文件内容发送给 agent
async function analyzeFileWithAgent(fileId: string) {
  const file = await fileStorageService.readFile(fileId);
  const agentResponse = await piAgent.analyze({
    context: file.content,
    task: "summarize"
  });
  return agentResponse;
}
```

---

## 🛡️ Error Handling

### Error Categories

| Error Type | Code | HTTP Status | 处理策略 |
|------------|------|-------------|-----------|
| 文件不存在 | FILE_NOT_FOUND | 404 | 显示友好提示，返回文件列表 |
| 文件已存在 | FILE_ALREADY_EXISTS | 409 | 提示用户修改文件名 |
| 权限错误 | ACCESS_DENIED | 403 | 记录日志，提示用户 |
| 存储错误 | STORAGE_ERROR | 500 | 显示错误，重试选项 |
| 版本错误 | VERSION_NOT_FOUND | 404 | 恢复时版本不存在 |

---

## 📊 Performance Considerations

### 文件加载优化

- **虚拟滚动**: 大文件列表使用虚拟滚动
- **懒加载**: 文件内容按需加载
- **缓存策略**: 最近打开的文件缓存在内存

### 版本历史优化

- **分页加载**: 版本历史分页显示（每页 20 个）
- **差异存储**: 考虑使用差异存储减少空间占用（Post-MVP）

---

## 🔐 Security Considerations

### 文件访问控制 (Post-MVP)

- MVP: 所有文件对所有用户可见
- Post-MVP: 实现基于项目的访问控制

### 文件路径安全

- 验证文件路径，防止目录遍历攻击
- 文件名消毒，防止特殊字符问题

---

## 🧪 Testing Strategy

### 单元测试

- FileStorageService: 文件 CRUD 操作
- VersionControlService: 版本管理逻辑
- buildFolderTree: 文件夹树构建

### 集成测试

- API 端点测试
- 组件交互测试

### E2E 测试

- 完整用户流程：创建 → 编辑 → 保存 → 删除

---

## 📈 Scalability

### MVP 限制

- 支持 1000+ 文件/项目
- 单文件大小限制: 10MB (Markdown)
- 版本数限制: 10 版本/文件

### 未来扩展

- 文件夹层级支持 (Post-MVP)
- 文件搜索索引 (Post-MVP)
- 离线同步 (Post-MVP)

---

## 📝 Implementation Sequence

1. **Story 2.1**: 文件列表查看
   - FileStorageService
   - FileList 组件

2. **Story 2.2**: 文件打开和查看
   - MarkdownPreview 组件
   - 文件获取 API

3. **Story 2.3**: 文件创建
   - FileCreateDialog 组件
   - 文件创建 API

4. **Story 2.4**: Markdown 编辑
   - FileEditor 组件
   - FileToolbar 组件
   - 自动保存逻辑

5. **Story 2.5**: 文件删除
   - FileDeleteDialog 组件
   - 删除 API

6. **Story 2.7**: 项目维度组织
   - ProjectFolder 组件
   - 文件夹树构建

7. **Story 2.6**: 版本追溯
   - VersionControlService
   - VersionHistory 组件

---

**文档状态**: Draft
**审核状态**: 待审阅
