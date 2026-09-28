# 架构设计 - Story 9.5

**Story:** Agent 注册表
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-17

---

## 技术栈

- TypeScript 严格模式
- Solution Manifest JSON 解析
- 复用现有 `persistent-agent.ts` 解析逻辑

## 数据结构

### AgentRegistry 接口

```typescript
interface AgentRegistry {
  loadFromManifest(manifestPath: string): Promise<AgentNode[]>;
  loadAgentDefinition(projectDir: string, agentId: string): Promise<AgentNode>;
  getAgent(id: string): AgentNode | null;
  listAgents(): AgentNode[];
}
```

## 模块设计

**文件：** `src/modules/collaboration-runtime/bridge/agent-registry.ts`

## 代码变更

- 新增 `bridge/agent-registry.ts`：实现 Agent 注册表
- 复用 `persistent-agent.ts` 中的 `parseAgentDefinition`、`parseToolDefinition`、`parseSkillDefinition`
- 仅做元数据收集，不实例化 PersistentAgent
