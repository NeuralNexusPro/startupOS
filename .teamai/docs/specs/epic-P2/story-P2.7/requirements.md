# 需求 - Story P2.7

**Story:** Agent–Skill 协作图谱与建模维度扩展
**Epic:** P2 - AI 解决方案设计
**最后更新:** 2026-05-18

---

## 用户故事

作为方案设计者，
我希望解决方案窗体中的图谱不仅展示 Agent 之间的协作，还能同时显示 Agent 与 Skill 的调用关系，
并区分 **Workflow（流程协作）** 与 **Team（组织协作）** 两种建模维度，
以便更直观理解方案结构的业务与能力构成。

---

## 功能需求

### 1. 图谱节点扩展

- 新增节点类型：`Skill`
  - 以圆角矩形展示
  - 颜色区分：Agent（blue-600），Skill（green-600）
- Skill 节点来源：`solution-design Skill` 中每个 Agent 所引用的技能（`AgentSkill` 列表）

### 2. 拓扑边扩展

- 新增边类型：`agent-skill`（表示调用关系）
- 保留已有协作边类型：`trigger` / `notify` / `depend`
- Edge 区分：
  - Agent→Skill：调用关系（绿色）
  - Skill→Agent：反向更新或输出（灰色）

### 3. 建模维度映射

- **Workflow 模型**：以任务流为核心，边类型主要为触发关系（`trigger`）
- **Team 模型**：以角色层次为核心，边类型主要为协作关系（`depend` / `notify`）
- 图谱顶部切换 Tab：`Workflow View` 与 `Team View`
  - Workflow View：展示任务流程路径、Skill 节点内嵌步骤
  - Team View：展示角色间协作结构与技能共享关系

---

## 验收标准

- [ ] AC1: 图谱中同时显示 Agent 与 Skill 节点
- [ ] AC2: Agent–Skill 边在拓扑中正确渲染
- [ ] AC3: Workflow 与 Team 两种视图可自由切换
- [ ] AC4: 切换视图时动画平滑且性能 < 5s
- [ ] AC5: Skill 节点点击可查看契约信息（input/output）
- [ ] AC6: 同步 solution manifest 格式，保持兼容
- [ ] AC7: 无循环依赖与断链错误（继承 P2.6 校验）

---

## 依赖关系

- [Story P2.3 协作拓扑可视化](../story-P2.3/README.md)
- [Story P2.6 SOP I/O 契约](../story-P2.6/README.md)
- [solution-design Skill](../../../../skills/solution-design/SKILL.md)
- [src/types/solution.ts](../../../../src/types/solution.ts)
