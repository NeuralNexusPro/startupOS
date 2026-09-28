# 架构设计 - Story R.1

**Story:** 角色上下文加载器
**Epic:** R - RoleAgent pi-agent 循环重构
**最后更新:** 2026-04-27

---

## 🏗️ 技术实现

**新增文件：** `src/lib/integrations/pi-agent/role-agent/role-context.ts`

### 数据结构

```typescript
export interface RoleContext {
  agentMd: string;
  roleMd: string | null;
  tasteMd: string | null;
  memoryMd: string | null;
  toolMd: string | null;
  currentPhase: string;
  installedSkills: SkillInfo[];
  allowedTools: string[];
}
```

### 依赖

- `fs` / `path`（Node.js 标准库）
- 无 pi-agent 内部依赖（Layer 1 模块，符合单向依赖原则）
