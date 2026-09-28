# 架构设计 - Story 9.7

**Story:** 协作拓扑解析器
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-17

---

## 技术栈

- TypeScript 严格模式
- 图论算法（拓扑排序、循环检测）
- Solution Manifest JSON 解析

## 数据结构

### CollaborationTopology

- `agents`: Map<string, AgentNode>（ID → AgentNode）
- `edges`: CollaborationEdge[]（from/to/type/description）
- `entryPoints`: string[]（无入边的 Agent ID）
- `exitPoints`: string[]（无出边的 Agent ID）
- `executionMode`: 'workflow' | 'system'

### AgentNode

- id, name, type, responsibility, domain, skills, capabilities

### CollaborationEdge

- from, to, type（trigger/notify/depend）, description

## 模块设计

**文件：** `src/modules/collaboration-runtime/engine/topology-parser.ts`

## 代码变更

### 接口定义

```typescript
interface TopologyParser {
  parse(manifest: SolutionManifest): CollaborationTopology;
  detectCycle(topology: CollaborationTopology): string[][] | null;
  determineExecutionMode(topology: CollaborationTopology): 'workflow' | 'system';
}
```

- 新增 `engine/topology-parser.ts`：解析 Solution Manifest 为 CollaborationTopology
- 实现循环依赖检测（DFS）
- 实现执行模式自动判定
