# 架构设计 - Story R.2

**Story:** 状态机解析与推进
**Epic:** R - RoleAgent pi-agent 循环重构
**最后更新:** 2026-04-27

---

## 🏗️ 技术实现

**新增文件：** `src/lib/integrations/pi-agent/role-agent/state-machine.ts`

### 数据结构

```typescript
export interface RolePhase {
  name: string;
  behavior: string;
  entryCondition: string;
  exitCondition: string;
}

export interface TransitionRule {
  from: string;
  to: string;
  condition: string;
}

export interface StateMachine {
  phases: RolePhase[];
  transitions: TransitionRule[];
  currentPhase: string;
}
```

### 依赖

- `@mariozechner/agent` 的 AgentMessage 类型
