# 架构设计 - Story P2.5

**Story:** 方案版本管理与执行清单
**Epic:** P2 - AI 解决方案设计
**最后更新:** 2026-04-22

---

## 数据结构

### 执行清单格式（Skill 已生成）

```json
{
  "solutionId": "sol-xxx",
  "solutionVersion": "v1.0",
  "modelingDimension": "task",
  "businessGoal": "...",
  "agents": [
    {
      "id": "agent-001",
      "name": "订单处理 Agent",
      "type": "agent",
      "responsibility": "...",
      "domain": "订单管理",
      "ontologyObjects": [{ "name": "Order", "operations": ["create", "update"] }],
      "collaborations": [{ "targetAgentId": "agent-002", "type": "trigger", "description": "..." }]
    }
  ],
  "topology": { "nodes": [...], "edges": [...] },
  "generatedAt": 1713600000000
}
```

### 类型定义

- `ExecutionManifest` — 执行清单完整结构
- `SolutionStatus` — 方案状态枚举：`draft` / `reviewing` / `confirmed`

---

## 模块设计

### API 设计（待实现）

#### 必要 API（后端）

- `GET /api/projects/{id}/solutions` — 列出所有方案版本
- `GET /api/projects/{id}/solutions/{version}` — 获取单个方案
- `GET /api/projects/{id}/solutions/{version}/manifest` — 获取执行清单
- `PUT /api/projects/{id}/solutions/{version}` — 更新方案状态

### 前端组件（待实现）

#### 版本列表 UI

- `SolutionList` 组件：读取方案列表，展示版本、状态、Agent 数
- 在 `SolutionDesign.tsx` 左侧接入 `SolutionList`
- 点击版本切换查看逻辑

#### 清单管理

- confirmed 方案展示「查看执行清单」按钮
- 执行清单 JSON 可查看（代码格式化展示）
- 提供下载功能（可选）

---

## 代码变更（待实现）

### API 路由

```typescript
// src/app/api/projects/[id]/solutions/route.ts
export async function GET(request: Request, { params }: { params: { id: string } }) {
  // 读取 solutions/ 目录下所有方案文件
}

// src/app/api/projects/[id]/solutions/[version]/route.ts
export async function GET(request: Request, { params }: { params: { id: string; version: string } }) {
  // 获取单个方案
}

export async function PUT(request: Request, { params }: { params: { id: string; version: string } }) {
  // 更新方案状态
}

// src/app/api/projects/[id]/solutions/[version]/manifest/route.ts
export async function GET(request: Request, { params }: { params: { id: string; version: string } }) {
  // 获取执行清单
}
```

### 前端组件

```typescript
// src/components/solution/SolutionList.tsx
export function SolutionList({ projectId, onVersionSelect }: Props) {
  // 读取方案列表，展示版本、状态、Agent 数
}
```
