# 需求 - Story P2.2

**Story:** Agent 规划编辑与迭代调整
**Epic:** P2 - AI 解决方案设计
**最后更新:** 2026-04-22

---

## 用户故事

作为方案设计者，
我想在 AI 生成初版 Agent 规划草稿后，能够调整 Agent 的职责边界、业务领域和协作关系，
以便让方案符合实际业务需求。

---

## 验收标准

- [ ] AC1: AI 生成初版 Agent 规划草稿（名称、职责、业务领域、协作关系）
- [ ] AC2: 用户可通过对话调整 Agent 职责边界
- [ ] AC3: 用户可通过对话修改业务领域划分
- [ ] AC4: 用户可通过对话修改 Agent 操作的本体对象
- [ ] AC5: 用户可通过对话修改协作关系类型（trigger / notify / depend）
- [ ] AC6: 每次调整后 AI 执行一致性检查（孤立 Agent、循环依赖、无入口）
- [ ] AC7: 草稿自动保存到 `solutions/solution-{version}.json`

---

## 依赖关系

### 已实现

| 内容 | 状态 | 说明 |
|------|------|------|
| Skill 阶段二：草稿生成 | ✅ | 按建模维度生成 Agent 列表 |
| Skill 阶段三：迭代调整 | ✅ | 对话式调整 + 一致性检查 |
| 文件保存逻辑 | ✅ | Skill 通过文件操作保存到 solutions/ |

### 缺失部分

| 缺失点 | 说明 | 优先级 |
|--------|------|--------|
| 结构化编辑 UI | PRD 要求「可以直接调整」而非仅通过对话；目前全靠对话 | Medium |
| 实时方案持久化 API | 无 `PUT /solutions/{id}` 接口，依赖 Skill 文件写入 | Low |

> **注意:** PRD 原文描述是对话引导式调整，Skill 当前实现已符合核心需求。结构化编辑 UI 属于体验增强，非 MVP 必须项。

### 一致性检查规则（Skill 已实现）

| 问题 | 处理方式 |
|------|---------|
| 孤立 Agent（无协作关系） | 警告，询问用户确认 |
| 循环依赖（A→B→A） | 错误，必须修正 |
| 无入口 Agent | 警告，询问用户确认 |

---

## 相关文档

- [Epic P2 README](../README.md)
- [PRD 3.3 方案编辑](../../../product/phase-2-ai-solution-design.md#33-方案编辑迭代式)
- [solution-design Skill 阶段二/三](../../../../skills/solution-design/SKILL.md)
- [SolutionAgent 类型](../../../../src/types/solution.ts)
