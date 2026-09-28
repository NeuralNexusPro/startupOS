# Epic 2: Data Model Definition

**Document Version**: 1.0
**Date**: 2026-03-23
**Author**: Architect (CTO)

---

## 📋 Data Model Overview

Epic 2 定义了文件、项目、版本和工作空间的核心数据模型。所有数据使用 JSON 格式存储在文件系统中。

---

## 📁 Core Data Models

### 1. File (文件模型)

```typescript
/**
 * 文件元数据
 */
interface FileMetadata {
  /** 文件唯一标识符 */
  id: string;

  /** 文件名 (包含扩展名) */
  name: string;

  /** 文件类型 */
  type: 'markdown' | 'text' | 'json' | 'yaml' | 'code';

  /** 所属项目 ID */
  projectId: string;

  /** 文件路径 (虚拟路径，用于层级显示，Post-MVP) */
  path: string;

  /** 文件大小 (字节数) */
  size: number;

  /** 创建时间 (ISO 8601 格式) */
  createdAt: string;

  /** 最后更新时间 (ISO 8601 格式) */
  updatedAt: string;

  /** 当前版本号 */
  currentVersion: number;

  /** 父文件夹 ID (Post-MVP: 支持文件夹层级) */
  parentFolderId?: string;

  /** 文件标签 (Post-MVP) */
  tags?: string[];
}

/**
 * 完整文件内容（元数据 + 内容）
 */
interface FileContent {
  id: string;
  metadata: FileMetadata;
  content: string;
}
```

#### 存储位置
```
data/workspace/projects/{projectId}/files/{fileId}.json
data/workspace/projects/{projectId}/files/{fileId}.md
```

#### 示例

```json
{
  "id": "file_abc123",
  "name": "project-plan.md",
  "type": "markdown",
  "projectId": "proj_xyz789",
  "path": "/project-plan.md",
  "size": 2048,
  "createdAt": "2026-03-23T10:00:00Z",
  "updatedAt": "2026-03-23T11:30:00Z",
  "currentVersion": 3,
  "tags": ["planning", "documentation"]
}
```

---

### 2. FileVersion (版本模型)

```typescript
/**
 * 文件版本记录
 */
interface FileVersion {
  /** 版本唯一标识符 */
  id: string;

  /** 所属文件 ID */
  fileId: string;

  /** 版本号 */
  version: number;

  /** 文件内容快照 */
  content: string;

  /** 创建时间 (ISO 8601 格式) */
  createdAt: string;

  /** 创建者 (用户 ID) */
  createdBy: string;

  /** 版本注释 */
  comment?: string;

  /** 是否固定（不被自动删除） */
  isPinned: boolean;
}
```

#### 存储位置
```
data/workspace/projects/{projectId}/versions/{fileId}/{version}.json
```

#### 示例

```json
{
  "id": "ver_v1_abc123",
  "fileId": "file_abc123",
  "version": 1,
  "content": "# 项目计划\n\n## 概述\n这是一个待办事项...",
  "createdAt": "2026-03-23T10:00:00Z",
  "createdBy": "user_dev1",
  "comment": "初始版本",
  "isPinned": false
}
```

---

### 3. Project (项目模型)

```typescript
/**
 * 项目定义
 */
interface Project {
  /** 项目唯一标识符 */
  id: string;

  /** 项目名称 */
  name: string;

  /** 项目描述 */
  description?: string;

  /** 项目图标 (可选) */
  icon?: string;

  /** 项目颜色 (可选，用于 UI 标识) */
  color?: string;

  /** 项目文件列表 (引用 FileMetadata) */
  files: FileMetadata[];

  /** 创建时间 */
  createdAt: string;

  /** 最后更新时间 */
  updatedAt: string;
}
```

#### 存储位置
```
data/workspace/projects/{projectId}/project.json
```

#### 示例

```json
{
  "id": "proj_xyz789",
  "name": "OriginOS 开发项目",
  "description": "AI Native 操作系统开发",
  "icon": "🚀",
  "color": "#3B82F6",
  "files": ["file_abc123", "file_def456"],
  "createdAt": "2026-03-20T09:00:00Z",
  "updatedAt": "2026-03-23T11:30:00Z"
}
```

---

### 4. Workspace (工作空间模型)

```typescript
/**
 * 工作空间配置
 */
interface Workspace {
  /** 工作空间唯一标识符 */
  id: string;

  /** 工作空间名称 */
  name: string;

  /** 包含的项目列表 */
  projects: Project[];

  /** 工作空间设置 */
  settings: WorkspaceSettings;

  /** 创建时间 */
  createdAt: string;
}

/**
 * 工作空间设置
 */
interface WorkspaceSettings {
  /** 默认项目 ID */
  defaultProjectId?: string;

  /** 自动保存是否启用 */
  autoSave: boolean;

  /** 自动保存间隔（秒） */
  autoSaveInterval: number;

  /** 每个文件保留的最大版本数 */
  maxVersionsPerFile: number;

  /** 工作空间主题 */
  theme: 'light' | 'dark' | 'auto';
}
```

#### 存储位置
```
data/workspace/workspace.json
```

#### 示例

```json
{
  "id": "workspace_main",
  "name": "我的工作空间",
  "projects": ["proj_xyz789", "proj_ghi012"],
  "settings": {
    "defaultProjectId": "proj_xyz789",
    "autoSave": true,
    "autoSaveInterval": 30,
    "maxVersionsPerFile": 10,
    "theme": "dark"
  },
  "createdAt": "2026-03-20T09:00:00Z"
}
```

---

### 5. VirtualFolder (虚拟文件夹模型)

```typescript
/**
 * 虚拟文件夹树节点
 * 用于在前端构建项目文件夹层次结构
 */
interface VirtualFolder {
  /** 节点 ID */
  id: string;

  /** 显示名称 */
  name: string;

  /** 节点类型 */
  type: 'folder' | 'file';

  /** 子节点（仅文件夹） */
  children?: VirtualFolder[];

  /** 文件元数据（仅文件） */
  fileMetadata?: FileMetadata;

  /** 是否折叠 */
  collapsed?: boolean;

  /** 图标标识 */
  icon?: string;
}
```

---

## 🔗 Data Relationships

### ER Diagram

```
┌─────────────────┐
│    Workspace    │
│  ─────────────  │
│  id             │
│  name           │
│  projects []     │
│  settings       │
└────────┬────────┘
         │ 1
         │
         │ *
┌────────▼────────┐       1       ┌─────────────┐
│    Project      │◄─────────────│  FileMetadata│
│  ─────────────  │               │  ───────────  │
│  id (PK)        │               │  id (PK)     │
│  name           │               │  name        │
│  description    │               │  type        │
│  files []       │               │  size        │
│  createdAt      │               │  createdAt   │
└─────────────────┘               └──────────┬───┘
                                            │
                                            │ 1
                                            │
                                            │ *
                                     ┌──────▼────────┐
                                     │  FileVersion  │
                                     │  ────────────  │
                                     │  id (PK)       │
                                     │  fileId (FK)   │
                                     │  version       │
                                     │  content       │
                                     │  createdAt     │
                                     └───────────────┘
```

---

## 📂 File System Structure

### 物理目录结构

```
data/
└── workspace/
    ├── workspace.json                                    # 工作空间配置
    └── projects/
        ├── {projectId}/
        │   ├── project.json                              # 项目元数据
        │   ├── files/
        │   │   ├── {fileId}.json                        # 文件元数据
        │   │   └── {fileId}.md                          # 文件实际内容
        │   └── versions/
        │       └── {fileId}/
        │           ├── 1.json                           # 版本快照
        │           ├── 2.json
        │           └── ...
        └── {projectId}/
            └── ...
```

### 文件命名约定

| 文件类型 | 格式 | 说明 |
|----------|------|------|
| 文件 ID | `file_{timestamp}_{random}` | 示例: `file_1679568000_abc123` |
| 项目 ID | `proj_{timestamp}_{random}` | 示例: `proj_1679568000_xyz789` |
| 版本 ID | `ver_v{version}_{random}` | 示例: `ver_v1_abc123` |

---

## 🔄 State Models

### File Editor State

```typescript
interface FileEditorState {
  /** 当前编辑的文件 */
  currentFile: {
    id: string;
    metadata: FileMetadata;
    content: string;
  } | null;

  /** 未保存的更改标志 */
  isDirty: boolean;

  /** 最后保存时间 */
  lastSaved: string | null;

  /** 自动保存定时器 ID */
  autoSaveTimerId: number | null;
}
```

### File List State

```typescript
interface FileListState {
  /** 文件列表 */
  files: FileMetadata[];

  /** 当前选中的项目 ID */
  selectedProjectId: string | null;

  /** 展开/折叠的文件夹 */
  expandedFolders: Set<string>;

  /** 排序字段 */
  sortBy: 'name' | 'date' | 'size';

  /** 排序方向 */
  sortDirection: 'asc' | 'desc';

  /** 搜索关键词 */
  searchQuery: string;
}
```

---

## 📊 Default Values and Constraints

### 系统默认值

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `autoSave` | `true` | 自动保存启用 |
| `autoSaveInterval` | `30` | 30 秒 |
| `maxVersionsPerFile` | `10` | 保留 10 个版本 |
| `theme` | `'dark'` | 暗色主题 |

### 字段约束

| 字段 | 类型 | 必填 | 默认值 | 约束 |
|------|------|------|--------|------|
| FileMetadata.id | string | ✓ | - | 生成的 UUID |
| FileMetadata.name | string | ✓ | - | 1-255 字符 |
| FileMetadata.name | - | - | `.md` | 支持 md, txt, json, yaml |
| FileMetadata.size | number | ✓ | 0 | >= 0 |
| FileVersion.version | number | ✓ | 1 | >= 1 |

---

## 🔍 Queries and Indexes

### 常用查询模式

```typescript
// 按项目获取文件
function getFilesByProject(projectId: string): FileMetadata[];

// 按类型获取文件
function getFilesByType(type: string): FileMetadata[];

// 搜索文件
function searchFiles(query: string): FileMetadata[];

// 获取文件版本历史
function getFileVersions(fileId: string): FileVersion[];

// 获取最新版本
function getLatestFileVersion(fileId: string): FileVersion;
```

### 索引策略 (Post-MVP)

为提高查询性能，可建立以下索引：

| 索引类型 | 字段 | 用途 |
|----------|------|------|
| 主索引 | file.id | 快速定位文件 |
| 次索引 | file.projectId | 按项目查询 |
| 次索引 | file.type | 按类型查询 |
| 文本索引 | file.name | 文件名搜索 |

---

## 🛡️ Data Validation

### 文件名验证

```typescript
function validateFileName(fileName: string): boolean {
  // 长度限制
  if (fileName.length < 1 || fileName.length > 255) {
    return false;
  }

  // 禁止字符
  const invalidChars = /[<>:"/\\|?*\x00-\x1F]/;
  if (invalidChars.test(fileName)) {
    return false;
  }

  // 保留文件名
  const reservedNames = ['CON', 'PRN', 'AUX', 'NUL'];
  const nameWithoutExt = fileName.split('.')[0].toUpperCase();
  if (reservedNames.includes(nameWithoutExt)) {
    return false;
  }

  return true;
}
```

### 文件大小验证

```typescript
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

function validateFileSize(size: number): boolean {
  return size >= 0 && size <= MAX_FILE_SIZE;
}
```

---

## 📝 Migration Strategy

### 初始化数据

当用户首次使用系统时，自动创建：

```typescript
async function initializeWorkspace() {
  const workspaceId = generateId('workspace', Date.now());
  const workspace: Workspace = {
    id: workspaceId,
    name: '我的工作空间',
    projects: [],
    settings: DEFAULT_WORKSPACE_SETTINGS,
    createdAt: new Date().toISOString()
  };

  await writeFile(
    `data/workspace/workspace.json`,
    JSON.stringify(workspace, null, 2)
  );
}
```

---

**文档状态**: Draft
**审核状态**: 待审阅
