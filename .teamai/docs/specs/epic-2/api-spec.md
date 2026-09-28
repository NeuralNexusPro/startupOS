# Epic 2: API Specification

**Document Version**: 1.0
**Date**: 2026-03-23
**Author**: Architect (CTO)

---

## 📋 API Overview

Epic 2 定义了文件管理的 RESTful API 接口，支持文件的 CRUD 操作、版本控制和项目管理。

### Base URL
```
/api/files
```

### 通用响应格式

#### 成功响应
```typescript
{
  success: true,
  data: T,
  timestamp: string  // ISO 8601
}
```

#### 错误响应
```typescript
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

## 🔌 API Endpoints

### 1. List Files (文件列表)

**Endpoint**: `GET /api/files`

**Description**: 获取工作空间中的文件列表

**Query Parameters**:

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| projectId | string | 否 | all | 过滤项目 ID |
| type | string | 否 | all | 文件类型过滤 |
| sortBy | string | 否 | date | 排序字段: name, date, size |
| sortDir | string | 否 | desc | 排序方向: asc, desc |
| search | string | 否 | - | 搜索关键词 |
| limit | number | 否 | 50 | 返回数量限制 |
| offset | number | 否 | 0 | 偏移量 |

**Response**:
```json
{
  "success": true,
  "data": {
    "files": [
      {
        "id": "file_abc123",
        "name": "project-plan.md",
        "type": "markdown",
        "projectId": "proj_xyz789",
        "path": "/project-plan.md",
        "size": 2048,
        "createdAt": "2026-03-23T10:00:00Z",
        "updatedAt": "2026-03-23T11:30:00Z",
        "currentVersion": 3
      }
    ],
    "total": 1,
    "page": 1,
    "pageSize": 50
  },
  "timestamp": "2026-03-23T12:00:00Z"
}
```

**Error Codes**:
- `INTERNAL_ERROR`: 服务器内部错误

---

### 2. Get File Details (文件详情)

**Endpoint**: `GET /api/files/:id`

**Description**: 获取文件的元数据和内容

**Path Parameters**:
- `id` (string, required): 文件 ID

**Response**:
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
      "size": 2048,
      "createdAt": "2026-03-23T10:00:00Z",
      "updatedAt": "2026-03-23T11:30:00Z",
      "currentVersion": 3
    },
    "content": "# 项目计划\n\n## 概述\n..."
  },
  "timestamp": "2026-03-23T12:00:00Z"
}
```

**Error Codes**:
- `FILE_NOT_FOUND`: 文件不存在
- `INTERNAL_ERROR`: 服务器内部错误

---

### 3. Create File (创建文件)

**Endpoint**: `POST /api/files`

**Description**: 创建新文件

**Request Body**:
```json
{
  "name": "new-document.md",
  "type": "markdown",
  "projectId": "proj_xyz789",
  "path": "/new-document.md",
  "content": "# 新文档\n\n开始写作...",
  "tags": ["draft"]
}
```

**Response**:
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
      "createdAt": "2026-03-23T12:00:00Z",
      "updatedAt": "2026-03-23T12:00:00Z",
      "currentVersion": 1
    },
    "content": "# 新文档\n\n开始写作..."
  },
  "timestamp": "2026-03-23T12:00:00Z"
}
```

**Error Codes**:
- `FILE_ALREADY_EXISTS`: 文件名已存在
- `INVALID_FILE_NAME`: 文件名无效
- `PROJECT_NOT_FOUND`: 项目不存在
- `FILE_TOO_LARGE`: 文件过大
- `INTERNAL_ERROR`: 服务器内部错误

---

### 4. Update File (更新文件)

**Endpoint**: `PUT /api/files/:id`

**Description**: 更新文件内容和元数据

**Path Parameters**:
- `id` (string, required): 文件 ID

**Request Body**:
```json
{
  "content": "# 更新后的内容\n\n已修改...",
  "name": "renamed-document.md",
  "comment": "更新了第一部分"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "file_def456",
    "metadata": {
      "id": "file_def456",
      "name": "renamed-document.md",
      "type": "markdown",
      "projectId": "proj_xyz789",
      "size": 512,
      "updatedAt": "2026-03-23T12:05:00Z",
      "currentVersion": 2
    },
    "content": "# 更新后的内容\n\n已修改..."
  },
  "timestamp": "2026-03-23T12:05:00Z"
}
```

**Auto-save Behavior**:
- 当请求中包含 `autoSave: true` 时，不创建新版本
- 自动更新当前版本的 `updatedAt` 时间戳

**Error Codes**:
- `FILE_NOT_FOUND`: 文件不存在
- `FILE_ALREADY_EXISTS`: 重命名时新文件名已存在
- `INTERNAL_ERROR`: 服务器内部错误

---

### 5. Delete File (删除文件)

**Endpoint**: `DELETE /api/files/:id`

**Description**: 删除文件及其所有版本历史

**Path Parameters**:
- `id` (string, required): 文件 ID

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "file_def456",
    "deletedAt": "2026-03-23T12:10:00Z"
  },
  "timestamp": "2026-03-23T12:10:00Z"
}
```

**Error Codes**:
- `FILE_NOT_FOUND`: 文件不存在
- `INTERNAL_ERROR`: 服务器内部错误

---

### 6. Get File Versions (获取版本历史)

**Endpoint**: `GET /api/files/:id/versions`

**Description**: 获取文件的版本历史列表

**Path Parameters**:
- `id` (string, required): 文件 ID

**Query Parameters**:

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| limit | number | 否 | 20 | 返回数量限制 |
| offset | number | 否 | 0 | 偏移量 |

**Response**:
```json
{
  "success": true,
  "data": {
    "fileId": "file_abc123",
    "versions": [
      {
        "id": "ver_v3_abc123",
        "fileId": "file_abc123",
        "version": 3,
        "createdAt": "2026-03-23T11:30:00Z",
        "createdBy": "user_dev1",
        "comment": "添加了详细描述",
        "isPinned": false
      },
      {
        "id": "ver_v2_abc123",
        "fileId": "file_abc123",
        "version": 2,
        "createdAt": "2026-03-23T10:45:00Z",
        "createdBy": "user_dev1",
        "comment": "更新了计划",
        "isPinned": false
      },
      {
        "id": "ver_v1_abc123",
        "fileId": "file_abc123",
        "version": 1,
        "createdAt": "2026-03-23T10:00:00Z",
        "createdBy": "user_dev1",
        "comment": "初始版本",
        "isPinned": false
      }
    ],
    "total": 3
  },
  "timestamp": "2026-03-23T12:00:00Z"
}
```

**Error Codes**:
- `FILE_NOT_FOUND`: 文件不存在
- `INTERNAL_ERROR`: 服务器内部错误

---

### 7. Get Specific Version (获取特定版本)

**Endpoint**: `GET /api/files/:id/versions/:version`

**Description**: 获取文件的特定版本内容

**Path Parameters**:
- `id` (string, required): 文件 ID
- `version` (number, required): 版本号

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "ver_v1_abc123",
    "fileId": "file_abc123",
    "version": 1,
    "content": "# 项目计划\n\n## 概述\n这是一个初始版本...",
    "createdAt": "2026-03-23T10:00:00Z",
    "createdBy": "user_dev1",
    "comment": "初始版本",
    "isPinned": false
  },
  "timestamp": "2026-03-23T12:00:00Z"
}
```

**Error Codes**:
- `FILE_NOT_FOUND`: 文件不存在
- `VERSION_NOT_FOUND`: 指定版本不存在
- `INTERNAL_ERROR`: 服务器内部错误

---

### 8. Restore Version (恢复版本)

**Endpoint**: `POST /api/files/:id/restore`

**Description**: 将文件恢复到指定版本（创建新版本）

**Path Parameters**:
- `id` (string, required): 文件 ID

**Request Body**:
```json
{
  "version": 1,
  "comment": "恢复到 v1 版本"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "fileId": "file_abc123",
    "restoredFromVersion": 1,
    "newVersion": 4,
    "metadata": {
      "id": "file_abc123",
      "updatedAt": "2026-03-23T12:15:00Z",
      "currentVersion": 4
    },
    "content": "# 项目计划\n\n## 概述\n这是一个初始版本..."
  },
  "timestamp": "2026-03-23T12:15:00Z"
}
```

**Error Codes**:
- `FILE_NOT_FOUND`: 文件不存在
- `VERSION_NOT_FOUND`: 指定版本不存在
- `INTERNAL_ERROR`: 服务器内部错误

---

### 9. Pin Version (固定版本)

**Endpoint**: `PUT /api/files/:id/versions/:version/pin`

**Description**: 将某个版本标记为固定（不会被自动删除）

**Path Parameters**:
- `id` (string, required): 文件 ID
- `version` (number, required): 版本号

**Request Body**:
```json
{
  "pinned": true
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "ver_v1_abc123",
    "fileId": "file_abc123",
    "version": 1,
    "isPinned": true
  },
  "timestamp": "2026-03-23T12:00:00Z"
}
```

**Error Codes**:
- `FILE_NOT_FOUND`: 文件不存在
- `VERSION_NOT_FOUND`: 指定版本不存在
- `INTERNAL_ERROR`: 服务器内部错误

---

### 10. Get Projects (获取项目列表)

**Endpoint**: `GET /api/projects`

**Description**: 获取工作空间中的项目列表

**Response**:
```json
{
  "success": true,
  "data": {
    "projects": [
      {
        "id": "proj_xyz789",
        "name": "OriginOS 开发项目",
        "description": "AI Native 操作系统开发",
        "icon": "🚀",
        "color": "#3B62F0",
        "fileCount": 5,
        "createdAt": "2026-03-20T09:00:00Z",
        "updatedAt": "2026-03-23T11:30:00Z"
      }
    ]
  },
  "timestamp": "2026-03-23T12:00:00Z"
}
```

---

### 11. Create Project (创建项目)

**Endpoint**: `POST /api/projects`

**Description**: 创建新项目

**Request Body**:
```json
{
  "name": "新项目",
  "description": "项目描述",
  "icon": "📁",
  "color": "#10B981"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "proj_ghi012",
    "name": "新项目",
    "description": "项目描述",
    "icon": "📁",
    "color": "#10B981",
    "fileCount": 0,
    "createdAt": "2026-03-23T12:00:00Z",
    "updatedAt": "2026-03-23T12:00:00Z"
  },
  "timestamp": "2026-03-23T12:00:00Z"
}
```

**Error Codes**:
- `PROJECT_ALREADY_EXISTS`: 项目名已存在
- `INVALID_PROJECT_NAME`: 项目名无效
- `INTERNAL_ERROR`: 服务器内部错误

---

## 🔐 Authentication & Authorization

### MVP Phase
所有 API 端点无需认证。

### Post-MVP
- 使用 JWT Token 认证
- Header: `Authorization: Bearer <token>`
- 基于项目的访问控制

---

## 📊 Rate Limiting

### MVP Phase
无速率限制。

### Post-MVP
- 每个用户每分钟最多 60 个请求
- 文件上传限制：每分钟最多 10 个文件

---

## 🧪 API Testing

### Example: cURL Commands

```bash
# 获取文件列表
curl -X GET http://localhost:3000/api/files

# 获取文件详情
curl -X GET http://localhost:3000/api/files/file_abc123

# 创建文件
curl -X POST http://localhost:3000/api/files \
  -H "Content-Type: application/json" \
  -d '{
    "name": "test.md",
    "type": "markdown",
    "projectId": "proj_xyz789",
    "content": "# Test\n\nContent"
  }'

# 更新文件
curl -X PUT http://localhost:3000/api/files/file_abc123 \
  -H "Content-Type: application/json" \
  -d '{
    "content": "# Updated\n\nNew content"
  }'

# 删除文件
curl -X DELETE http://localhost:3000/api/files/file_abc123

# 获取版本历史
curl -X GET http://localhost:3000/api/files/file_abc123/versions

# 恢复版本
curl -X POST http://localhost:3000/api/files/file_abc123/restore \
  -H "Content-Type: application/json" \
  -d '{
    "version": 1,
    "comment": "恢复到初始版本"
  }'
```

---

## 📝 Implementation Notes

### Version Cleanup Strategy

当文件版本数超过 `maxVersionsPerFile` 时：

```typescript
async function cleanupOldVersions(fileId: string, maxVersions: number) {
  const versions = await getVersions(fileId);
  const pinnedVersions = versions.filter(v => v.isPinned);
  const unpinnedVersions = versions.filter(v => !v.isPinned);

  if (unpinnedVersions.length <= maxVersions - pinnedVersions.length) {
    return; // 不需要清理
  }

  const toDelete = unpinnedVersions.slice(
    0,
    unpinnedVersions.length - (maxVersions - pinnedVersions.length)
  );

  for (const version of toDelete) {
    await deleteVersion(version.id);
  }
}
```

### Auto-save Implementation

```typescript
let autoSaveTimer: NodeJS.Timeout | null = null;

function scheduleAutoSave(fileId: string, content: string, interval: number) {
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
  }

  autoSaveTimer = setTimeout(async () => {
    await fetch(`/api/files/${fileId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content,
        autoSave: true
      })
    });
  }, interval * 1000);
}
```

---

## 🚀 API Roadmap

### Phase 1 (Current)
- 基础文件 CRUD
- 简单版本历史

### Phase 2 (Post-MVP)
- 文件夹层级支持
- 文件搜索优化
- 批量操作

### Phase 3 (Future)
- 文件共享
- 协作编辑
- 外部存储集成

---

**文档状态**: Draft
**审核状态**: 待审阅
