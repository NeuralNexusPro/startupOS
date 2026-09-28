# 架构设计 - Story P2.7

**Story:** Agent–Skill 协作图谱与建模维度扩展
**Epic:** P2 - AI 解决方案设计
**最后更新:** 2026-05-18

---

## 数据结构

### solution.ts 更新建议

```typescript
export interface SolutionTopologyNode {
  id: string;
  type: 'agent' | 'skill';
  name: string;
  label?: string;
  domain?: string;
}
export interface SolutionTopologyEdge {
  source: string;
  target: string;
  type: 'trigger' | 'notify' | 'depend' | 'agent-skill';
}
export interface SolutionTopologyView {
  view: 'workflow' | 'team';
  nodes: SolutionTopologyNode[];
  edges: SolutionTopologyEdge[];
}
```

---

## 模块设计

### 实施建议

| 模块 | 文件位置 | 操作 |
|------|-----------|------|
| SolutionDesign | `src/components/solution/SolutionDesign.tsx` | 添加视图切换 Tab与渲染逻辑 |
| SolutionGraph | `src/components/solution/SolutionGraph.tsx` | 拓扑渲染支持 agent+skill 节点 |
| types | `src/types/solution.ts` | 扩展拓扑结构定义 |
| Skill 阶段 | `skills/solution-design/SKILL.md` | Stage 3.5: 输出 agent-skill 协作关系 |

---

## 代码变更

### 工作项

- [ ] 扩展 `solution-design` Skill 生成拓扑数据结构（含 Skill 调用）
- [ ] 更新 `SolutionGraph` 支持新节点与边类型
- [ ] 实现 Workflow/Team 切换 Tab UI
- [ ] 为 Skill 节点添加 hover 信息面板
- [ ] 测试性能（图谱加载 <5s）
