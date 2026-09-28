# 需求 - Story P2.6

**Story:** SOP I/O 契约（本体数据流）
**Epic:** P2 - AI 解决方案设计
**最后更新:** 2026-05-18

---

## 用户故事

> 作为方案设计师，我需要在 SOP 规划时明确每个步骤和 Skill 的本体输入输出契约，这样 Agent 执行时能自动知道拿什么本体数据、做什么操作、产出什么结果，并且系统能验证步骤间数据流连通性。

---

## 功能需求

1. **Skill I/O 契约** — 每个 Skill 声明 `inputContract`（从本体读什么）和 `outputContract`（向本体写什么）
2. **SOP 步骤级 I/O** — 每个 SOP 步骤声明输入来源（本体 / 上游步骤 / 用户）和输出去向
3. **数据流验证** — 上游 `outputContract.produces` 必须匹配下游 `inputContract.requires`
4. **断链检测** — 发现"断流"步骤（需要的数据没有来源）
5. **循环依赖检测** — A→B→C→A 的产出依赖环
6. **solution-design Skill 扩展** — Stage 2.5 规划 Skill 时自动生成 I/O 契约
7. **manifest JSON 格式更新** — `ontologyObjects` 从 `string[]` 改为 `Record<string, string[]>`，新增契约字段

---

## 验收标准

- [ ] `AgentSkill` 接口支持 `inputContract` / `outputContract` / `sopIO` 字段
- [ ] `SkillMetadata` 接口支持 `inputContract` / `outputContract` 字段
- [ ] `ontologyObjects` 格式从 `string[]` 改为 `Record<string, string[]>`
- [ ] 现有 manifest JSON 仍有效（新字段 optional，向后兼容）
- [ ] solution-design Skill Stage 2.5 生成 I/O 契约
- [ ] TypeScript 编译无错误：`npx tsc --noEmit`

---

## 数据流验证规则

| 规则 | 条件 | 动作 |
|------|------|------|
| 连通性 | 步骤 N 的 `requires` 无来源 | 标记断链错误 |
| 类型匹配 | `produces` 的 `objectType` 与 `requires` 不一致 | 标记类型不匹配 |
| 字段覆盖 | `produces.fields` 不包含 `requires.fields` | 标记字段不足 |
| 循环依赖 | SOP DAG 中存在环 | 标记循环依赖 |

---

## 依赖关系

- Epic P2: AI 解决方案设计
- PRD: Phase 2 AI 解决方案设计 §2.3, §2.4, §3.8
