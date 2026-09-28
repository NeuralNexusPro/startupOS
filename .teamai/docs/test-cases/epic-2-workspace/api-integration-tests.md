# Epic 2 API 集成测试计划

**Epic:** Epic 2: 基础工作空间 (Basic Workspace)
**文档版本:** 1.0
**创建日期:** 2026-03-24
**基于文档:**
- `docs/specs/epic-2/api-spec.md`
- `docs/specs/epic-2/data-model.md`
- `docs/specs/epic-2/architecture.md`

---

## 🎯 测试目标

验证 Epic 2 文件管理 API 的功能正确性、数据完整性和错误处理能力。

---

## 📋 API 测试覆盖范围

### 主要 API 端点

| 方法 | 端点 | 描述 | 优先级 |
|------|------|------|--------|
| GET | `/api/files` | 文件列表查询 | P0 |
| GET | `/api/files/:id` | 获取文件详情 | P0 |
| POST | `/api/files` | 创建新文件 | P0 |
| PUT | `/api/files/:id` | 更新文件 | P0 |
| DELETE | `/api/files/:id` | 删除文件 | P1 |
| GET | `/api/files/:id/versions` | 获取版本历史 | P2 |
| POST | `/api/files/:id/restore` | 恢复版本 | P2 |

---

## 📊 测试策略

### 测试层级

```
┌─────────────────────────────────┐
│  API 集成测试 (Vitest)          │  端到端 API 测试
└────────────┬────────────────────┘
             ↓
┌─────────────────────────────────┐
│  服务层单元测试                  │  FileStorageService 等
└────────────┬────────────────────┘
             ↓
┌─────────────────────────────────┐
│  数据验证测试                    │  JSON 结构验证
└─────────────────────────────────┘
```

### 测试覆盖率目标

| 测试类型 | 覆盖率目标 | 测试用例数 |
|---------|-----------|-----------|
| API 集成测试 | > 90% | 15 |
| 服务层单元测试 | > 85% | 8 |
| 数据验证测试 | 100% | 6 |
| 错误处理测试 | 100% | 5 |

---

## 🧪 API 集成测试用例

### TC-API-001: GET /api/files - 获取文件列表（无参数）

**测试目标:** 验证无参数时返回所有文件

**优先级:** 🔴 P0 (Critical)

**请求:**
```
GET /api/files
```

**预期响应:**
```json
{
  "success": true,
  "data": {
    "files": [...],
    "total": N,
    "page": 1,
    "pageSize": 50
  },
  "timestamp": "ISO-8601"
}
```

**通过条件:**
- HTTP 状态码 200
- success 为 true
- files 数组不为空
- total 等于 files.length

---

### TC-API-002: GET /api/files - 项目过滤

**测试目标:** 验证 projectId 过滤功能

**优先级:** 🔴 P0 (Critical)

**请求:**
```
GET /api/files?projectId=proj_xyz789
```

**预期响应:**
```json
{
  "success": true,
  "data": {
    "files": [
      {
        "id": "file_abc123",
        "name": "project-plan.md",
        "type": "markdown",
        "projectId": "proj_xyz789"
      }
    ],
    "total": 1,
    "page": 1,
    "pageSize": 50
  }
}
```

**通过条件:**
- HTTP 状态码 200
- 所有文件的 projectId 匹配

---

### TC-API-003: GET /api/files - 类型过滤

**测试目标:** 验证 type 过滤功能

**优先级:** 🟡 P1 (High)

**请求:**
```
GET /api/files?type=markdown
```

**预期响应:**
```json
{
  "success": true,
  "data": {
    "files": [...],
    "total": N,
    "page": 1,
    "pageSize": 50
  }
}
```

**通过条件:**
- 所有文件的 type 为 "markdown"

---

### TC-API-004: GET /api/files - 排序功能

**测试目标:** 验证 sortBy 和 sortDir 参数

**优先级:** 🟡 P1 (High)

**测试场景:**
1. 按 name 升序: `GET /api/files?sortBy=name&sortDir=asc`
2. 按 date 降序 (默认): `GET /api/files?sortBy=date&sortDir=desc`
3. 按 size 排序: `GET /api/files?sortBy=size&sortDir=asc`

**通过条件:**
- 结果按指定字段正确排序

---

### TC-API-005: GET /api/files - 搜索功能

**测试目标:** 验证 search 关键词搜索

**优先级:** 🟡 P1 (High)

**请求:**
```
GET /api/files?search=plan
```

**预期响应:**
```json
{
  "success": true,
  "data": {
    "files": [
      {
        "id": "file_abc123",
        "name": "project-plan.md",
        "type": "markdown"
      }
    ],
    "total": 1,
    "page": 1,
    "pageSize": 50
  }
}
```

**通过条件:**
- 文件名包含搜索关键词

---

### TC-API-006: GET /api/files/:id - 获取文件详情

**测试目标:** 验证获取单个文件完整信息

**优先级:** 🔴 P0 (Critical)

**请求:**
```
GET /api/files/file_abc123
```

**预期响应:**
```json
{
  "success": true,
  "data": {
    "id": "file_abc123",
    "metadata": {
      "id": "file_abc123",
      "name": "project-plan.md",
      "type": "markdown",
      "projectId": "proj_xyz789",
      "path": "/project-plan.md",
      "size": 2048,
      "createdAt": "2026-03-23T10:00:00Z",
      "updatedAt": "2026-03-23T11:30:00Z",
      "currentVersion": 3
    },
    "content": "# 项目计划\n\n## 概述..."
  }
}
```

**通过条件:**
- HTTP 状态码 200
- metadata 和 content 都存在
- metadata.currentVersion 正确

---

### TC-API-007: GET /api/files/:id - 文件不存在

**测试目标:** 验证文件不存在时的错误处理

**优先级:** 🔴 P0 (Critical)

**请求:**
```
GET /api/files/non_existent_id
```

**预期响应:**
```json
{
  "success": false,
  "error": {
    "code": "FILE_NOT_FOUND",
    "message": "File not found: non_existent_id"
  },
  "timestamp": "ISO-8601"
}
```

**通过条件:**
- HTTP 状态码 404
- error.code 为 "FILE_NOT_FOUND"

---

### TC-API-008: POST /api/files - 创建文件（正常）

**测试目标:** 验证正常创建文件

**优先级:** 🔴 P0 (Critical)

**请求:**
```
POST /api/files
Content-Type: application/json

{
  "name": "new-document.md",
  "type": "markdown",
  "projectId": "proj_xyz789",
  "path": "/new-document.md",
  "content": "# 新文档\n\n开始写作...",
  "tags": ["draft"]
}
```

**预期响应:**
```json
{
  "success": true,
  "data": {
    "id": "file_def456",
    "metadata": {
      "id": "file_def456",
      "name": "new-document.md",
      "type": "markdown",
      "projectId": "proj_xyz789",
      "path": "/new-document.md",
      "size": 256,
      "createdAt": "2026-03-24T12:00:00Z",
      "updatedAt": "2026-03-24T12:00:00Z",
      "currentVersion": 1
    },
    "content": "# 新文档\n\n开始写作..."
  }
}
```

**通过条件:**
- HTTP 状态码 201
- 返回的 id 不为空
- metadata.createdAt 等于 metadata.updatedAt
- currentVersion 为 1

---

### TC-API-009: POST /api/files - 文件名已存在

**测试目标:** 验证同名文件创建的错误处理

**优先级:** 🟡 P1 (High)

**请求:**
```
POST /api/files
Content-Type: application/json

{
  "name": "existing-file.md",
  "type": "markdown",
  "projectId": "proj_xyz789"
}
```

**预期响应:**
```json
{
  "success": false,
  "error": {
    "code": "FILE_ALREADY_EXISTS",
    "message": "File with name 'existing-file.md' already exists",
    "details": {
      "existingFileId": "file_abc123"
    }
  }
}
```

**通过条件:**
- HTTP 状态码 409
- error.code 为 "FILE_ALREADY_EXISTS"

---

### TC-API-010: POST /api/files - 无效文件名

**测试目标:** 验证无效文件名的验证

**优先级:** 🟡 P1 (High)

**测试场景:**
1. 空文件名: `""`
2. 无效字符: `"file/with/slashes.md"`
3. 无扩展名: `"noextension"`

**预期响应:**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_FILE_NAME",
    "message": "Invalid file name: [原因]"
  }
}
```

**通过条件:**
- HTTP 状态码 400
- error.code 为 "INVALID_FILE_NAME"

---

### TC-API-011: PUT /api/files/:id - 更新文件内容

**测试目标:** 验证更新文件内容和元数据

**优先级:** 🔴 P0 (Critical)

**请求:**
```
PUT /api/files/file_abc123
Content-Type: application/json

{
  "content": "# 更新后的内容\n\n已修改...",
  "name": "renamed-document.md",
  "comment": "更新了第一部分"
}
```

**预期响应:**
```json
{
  "success": true,
  "data": {
    "id": "file_abc123",
    "metadata": {
      "id": "file_abc123",
      "name": "renamed-document.md",
      "type": "markdown",
      "updatedAt": "2026-03-24T12:30:00Z",
      "currentVersion": 4
    },
    "content": "# 更新后的内容\n\n已修改..."
  }
}
```

**通过条件:**
- HTTP 状态码 200
- content 已更新
- currentVersion 递增
- updatedAt 已更新

---

### TC-API-012: PUT /api/files/:id - 只更新元数据

**测试目标:** 验证只更名不更新内容

**优先级:** 🟡 P1 (High)

**请求:**
```
PUT /api/files/file_abc123
Content-Type: application/json

{
  "name": "renamed-without-content-change.md"
}
```

**通过条件:**
- HTTP 状态码 200
- 文件名已更改
- currentVersion 不变

---

### TC-API-013: PUT /api/files/:id - 文件不存在

**测试目标:** 验证更新不存在文件的错误处理

**优先级:** 🔴 P0 (Critical)

**请求:**
```
PUT /api/files/non_existent_id
Content-Type: application/json

{
  "content": "test"
}
```

**预期响应:**
```json
{
  "success": false,
  "error": {
    "code": "FILE_NOT_FOUND",
    "message": "File not found: non_existent_id"
  }
}
```

**通过条件:**
- HTTP 状态码 404

---

### TC-API-014: DELETE /api/files/:id - 正常删除

**测试目标:** 验证删除文件功能

**优先级:** 🟡 P1 (High)

**请求:**
```
DELETE /api/files/file_abc123
```

**预期响应:**
```json
{
  "success": true,
  "data": {
    "id": "file_abc123",
    "deleted": true
  }
}
```

**通过条件:**
- HTTP 状态码 200
- 文件被物理删除
- 后续 GET 请求返回 404

---

### TC-API-015: DELETE /api/files/:id - 文件不存在

**测试目标:** 验证删除不存在文件的处理

**优先级:** 🟡 P1 (High)

**请求:**
```
DELETE /api/files/non_existent_id
```

**预期响应:**
```json
{
  "success": false,
  "error": {
    "code": "FILE_NOT_FOUND",
    "message": "File not found: non_existent_id"
  }
}
```

**通过条件:**
- HTTP 状态码 404

---

### TC-API-016: GET /api/files/:id/versions - 版本历史

**测试目标:** 验证获取文件版本历史

**优先级:** 🟢 P2 (Medium)

**请求:**
```
GET /api/files/file_abc123/versions
```

**预期响应:**
```json
{
  "success": true,
  "data": {
    "fileId": "file_abc123",
    "versions": [
      {
        "id": "ver_v1_abc123",
        "fileId": "file_abc123",
        "version": 1,
        "createdAt": "2026-03-23T10:00:00Z",
        "createdBy": "user_dev1",
        "comment": "初始版本",
        "isPinned": false
      },
      {
        "id": "ver_v2_abc123",
        "fileId": "file_abc123",
        "version": 2,
        "createdAt": "2026-03-23T11:00:00Z",
        "createdBy": "user_dev1",
        "comment": "添加了概述",
        "isPinned": false
      }
    ],
    "total": 2,
    "current": 2
  }
}
```

**通过条件:**
- HTTP 状态码 200
- versions 数组不为空
- 版本号递增
- current 为最新版本号

---

### TC-API-017: POST /api/files/:id/restore - 恢复版本

**测试目标:** 验证恢复到指定版本

**优先级:** 🟢 P2 (Medium)

**请求:**
```
POST /api/files/file_abc123/restore
Content-Type: application/json

{
  "version": 1
}
```

**预期响应:**
```json
{
  "success": true,
  "data": {
    "fileId": "file_abc123",
    "restoredVersion": 1,
    "newVersion": 5,
    "comment": "Restored from version 1",
    "timestamp": "2026-03-24T12:00:00Z"
  }
}
```

**通过条件:**
- HTTP 状态码 200
- 文件内容恢复到 version 1
- 创建新的版本记录（version 5）

---

### TC-API-018: POST /api/files/:id/restore - 版本不存在

**测试目标:** 验证恢复不存在版本的处理

**优先级:** 🟢 P2 (Medium)

**请求:**
```
POST /api/files/file_abc123/restore
Content-Type: application/json

{
  "version": 999
}
```

**预期响应:**
```json
{
  "success": false,
  "error": {
    "code": "VERSION_NOT_FOUND",
    "message": "Version 999 not found for file file_abc123"
  }
}
```

**通过条件:**
- HTTP 状态码 404

---

## 🔧 服务层单元测试

### TC-SVC-001: FileStorageService.readFile()

**测试目标:** 验证文件读取功能

**测试代码:**
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FileStorageService } from '@/services/file-storage.service';

describe('FileStorageService.readFile', () => {
  let service: FileStorageService;

  beforeEach(() => {
    service = new FileStorageService('/tmp/test-workspace');
  });

  it('should read file content successfully', async () => {
    const result = await service.readFile('file_123', 'proj_456');
    expect(result.content).toBeDefined();
    expect(result.metadata.id).toBe('file_123');
  });

  it('should return null for non-existent file', async () => {
    const result = await service.readFile('non_existent', 'proj_456');
    expect(result).toBeNull();
  });
});
```

---

### TC-SVC-002: FileStorageService.writeFile()

**测试目标:** 验证文件写入功能

**测试代码:**
```typescript
describe('FileStorageService.writeFile', () => {
  it('should write file and create initial version', async () => {
    const content = {
      metadata: {
        id: 'file_new',
        name: 'new.md',
        type: 'markdown',
        projectId: 'proj_1'
      },
      content: '# New File'
    };

    await service.writeFile(content);

    const result = await service.readFile('file_new', 'proj_1');
    expect(result.content).toBe('# New File');
    expect(result.metadata.currentVersion).toBe(1);
  });

  it('should create new version on update', async () => {
    await service.writeFile({
      metadata: { id: 'file_1', name: 'v1.md', type: 'markdown', projectId: 'proj_1' },
      content: 'Version 1'
    });

    await service.writeFile({
      metadata: { id: 'file_1', name: 'v1.md', type: 'markdown', projectId: 'proj_1' },
      content: 'Version 2'
    });

    const versions = await service.listVersions('file_1');
    expect(versions).toHaveLength(2);
  });
});
```

---

## ✅ 数据验证测试

### TC-DATA-001: FileMetadata 结构验证

**测试目标:** 验证 FileMetadata 包含所有必需字段

**测试代码:**
```typescript
describe('FileMetadata Validation', () => {
  it('should have all required fields', () => {
    const metadata: FileMetadata = {
      id: 'file_123',
      name: 'test.md',
      type: 'markdown',
      projectId: 'proj_456',
      path: '/test.md',
      size: 1024,
      createdAt: '2026-03-24T12:00:00Z',
      updatedAt: '2026-03-24T12:00:00Z',
      currentVersion: 1
    };

    expect(metadata.id).toBeDefined();
    expect(metadata.name).toMatch(/\.md$/);
    expect(['markdown', 'text', 'json', 'yaml']).toContain(metadata.type);
    expect(metadata.size).toBeGreaterThan(0);
  });

  it('should validate ISO 8601 timestamps', () => {
    const timestamp = '2026-03-24T12:00:00Z';
    expect(() => new Date(timestamp)).not.toThrow();
  });
});
```

---

## 🐛 错误处理测试

### TC-ERR-001: API 错误响应格式验证

**测试目标:** 确保所有错误返回统一格式

**测试用例:**
- FILE_NOT_FOUND (404)
- FILE_ALREADY_EXISTS (409)
- INVALID_FILE_NAME (400)
- PROJECT_NOT_FOUND (404)
- VERSION_NOT_FOUND (404)
- INTERNAL_ERROR (500)

**验证标准:**
```typescript
interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
  };
  timestamp: string;
}
```

---

## 📊 测试结果记录

| 执行日期 | API 测试通过率 | 服务测试通过率 | 数据验证通过率 | 整体通过率 |
|---------|--------------|--------------|--------------|-----------|
| - | - | - | - | - |

---

## 🚧 测试前置条件

- ✅ Epic 2 API 端点已实现
- ✅ FileStorageService 已实现
- ✅ 数据存储目录已创建
- ⏸️ 等待 Developer 实现 API

---

**QA Engineer Ready:** 一旦 API 实现完成，可立即开始测试执行。
