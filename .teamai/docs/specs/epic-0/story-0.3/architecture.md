# Story 0.3: 工具能力注册系统 - 架构设计

**Story 编号:** 0.3
**Epic:** Epic 0 - 技术架构实施层
**状态:** ✅ Complete
**最后更新:** 2026-03-04

---

## 🎨 技术实现要点（参考 openclaw）

本 Story 的工具注册系统参考了 openclaw 项目的工具定义模式，采用 `@sinclair/typebox` 进行参数 Schema 定义，通过统一的 `AgentTool` 接口描述工具。

---

## 📁 文件位置

| 文件 | 职责 |
|------|------|
| `src/lib/integrations/pi-agent/tools/file-tools.ts` | 文件操作工具 (read_file, write_file, list_files, delete_file) |
| `src/lib/integrations/pi-agent/tools/ontology-tools.ts` | 本体操作工具 (query_ontology, create_domain, create_ontology_node) |
| `src/lib/integrations/pi-agent/tools/system-tools.ts` | 系统工具 (get_system_info) |
| `src/lib/integrations/pi-agent/tools/registry.ts` | 工具注册表实现 |
| `src/types/pi-agent.ts` | AgentTool 类型定义（统一，避免重复） |

---

## 🔧 数据结构

### AgentTool 接口

```typescript
interface AgentTool<TParams = any> {
  name: string;              // 工具唯一标识
  label: string;             // 工具显示名称
  description: string;       // 工具描述（供 LLM 理解）
  category?: string;         // 工具分类 (file/ontology/graph/skill/system)
  enabled?: boolean;         // 是否启用
  parameters: TParams;       // TypeBox Schema 定义的参数
  execute: (
    toolCallId: string,
    params: any,
    signal?: AbortSignal,
    onUpdate?: (partial: AgentToolResult) => void
  ) => Promise<AgentToolResult>;
}

interface AgentToolResult {
  content: Array<{ type: string; text: string }>;
  details?: Record<string, unknown>;
}
```

---

## 📐 openclaw 工具定义模式

```typescript
// src/agents/pi-tools.ts (openclaw 参考)
import { Type } from '@sinclair/typebox';
import type { AgentTool } from '@mariozechner/pi-agent-core';

export function createOntologyTools(ontologyService: OntologyService) {
  const tools: AgentTool<any>[] = [
    {
      name: 'create_ontology_node',
      label: '创建本体节点',
      description: '在项目中创建新的本体节点（实体、类、关系）',
      parameters: Type.Object({
        name: Type.String({ description: '节点名称' }),
        type: Type.String({
          description: '节点类型',
          enum: ['entity', 'class', 'relation'],
        }),
        description: Type.Optional(Type.String({
          description: '节点描述',
        })),
        parentId: Type.Optional(Type.String({
          description: '父节点ID（用于层级结构）',
        })),
      }),
      execute: async (toolCallId, params, signal, onUpdate) => {
        try {
          // 进度更新
          onUpdate?.({
            content: [{ type: 'text', text: `Creating ontology node: ${params.name}...` }],
            details: { progress: 0 },
          });

          const node = await ontologyService.createNode({
            name: params.name,
            type: params.type,
            description: params.description,
            parentId: params.parentId,
          });

          return {
            content: [{ type: 'text', text: `Successfully created node: ${node.id}` }],
            details: { nodeId: node.id, name: node.name },
          };
        } catch (error) {
          throw new Error(`Failed to create ontology node: ${error}`);
        }
      },
    },
    // ... 更多工具
  ];

  return tools;
}
```

---

## 📝 工具定义示例

```typescript
// src/lib/integrations/pi-agent/tools/file-tools.ts
import { Type } from '@sinclair/typebox';
import type { AgentTool } from '@/types/pi-agent';

export const readFileTool: AgentTool = {
  name: 'read_file',
  label: '读取文件',
  description: '读取指定路径的文件内容',
  parameters: Type.Object({
    path: Type.String({ description: '文件路径' }),
  }),
  execute: async (
    toolCallId: string,
    params: { path: string },
    signal?: AbortSignal,
    onUpdate?: (partial: AgentToolResult) => void
  ) => {
    const content = await fileManager.read(params.path);

    return {
      content: [{ type: 'text', text: content }],
      details: { path: params.path, size: content.length },
    };
  },
};

export const createOntologyNodeTool: AgentTool = {
  name: 'create_ontology_node',
  label: '创建本体节点',
  description: '在项目中创建新的本体节点',
  parameters: Type.Object({
    name: Type.String({ description: '节点名称' }),
    type: Type.String({ description: '节点类型 (entity/class/relation)' }),
    description: Type.String({ description: '节点描述' }),
  }),
  execute: async (toolCallId, params, signal, onUpdate) => {
    const node = await ontologyService.createNode(params);
    return {
      content: [{ type: 'text', text: `Created node: ${node.id}` }],
      details: { nodeId: node.id },
    };
  },
};
```

---

## 🗂️ 工具注册器

```typescript
// src/lib/integrations/pi-agent/tools/registry.ts
class ToolRegistry {
  private tools: Map<string, AgentTool<any>> = new Map();

  register(tool: AgentTool<any>) {
    this.tools.set(tool.name, tool);
  }

  unregister(name: string) {
    this.tools.delete(name);
  }

  getAll(): AgentTool<any>[] {
    return Array.from(this.tools.values());
  }

  get(name: string): AgentTool<any> | undefined {
    return this.tools.get(name);
  }
}

export const toolRegistry = new ToolRegistry();
```

---

## 🔑 实施中发现并修复的问题

| # | 问题 | 修复方式 |
|---|------|---------|
| 1 | 类型重复定义（registry.ts vs types.ts） | 统一在 types.ts |
| 2 | onUpdate 和 signal 参数未实现 | 实现 sendProgress(), checkAbort() |
| 3 | toolCallId 未使用 | 传递到所有工具 |
| 4 | 自动初始化副作用 | initializeBuiltInTools() 显式调用 |
| 5 | ontology-tools.ts 函数定义顺序错误 | getOntologyIdDir 移到顶部 |

---

## 📚 相关文档

- [需求文档](./requirements.md) - 功能需求与验收标准
- [测试计划](./testing.md) - 完整测试用例与验收检查清单
- [pi-agent-core Tools Documentation](../../../pi-mono/packages/agent/README.md#tools)
