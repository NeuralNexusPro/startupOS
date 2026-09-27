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

## 0.4.x 验收口径（2026-09-27）

执行契约统一采用 ONT.7/P2.8 的 canonical contract。旧 inputContract/outputContract/sopIO 仅为可读兼容，不能单独发布或执行。SOP 以精确 contractRef 的节点、FactType 边和显式 externalInputs 表达；字段覆盖通过完整 FactType schema 与版本精确匹配保证。循环校验由 Solution 公共 Validator 执行，本体引用与连通校验复用 ONT 公共 API。

新增闭环验收：生成的版本化设计 bundle 可直接进入发布校验；技能创建交接和元数据读取保留 canonical 契约；缺引用、错版本、断链与环明确拒绝，不静默转换旧方案。

## 0.4.x canonical 验收映射（2026-09-27）

本节替代早期仅按 `objectType/fields` 推断连通性的执行设计：新方案的唯一执行语义为 ONT canonical contract；旧 inputContract/outputContract/sopIO 只保留展示兼容，不触发猜测迁移。

| 原需求 | 当前落点 | 验证 |
|---|---|---|
| Skill/Agent I/O | 公共 canonical Agent/Skill contract，精确 ontology/version/concept/factType | 黄金三文件读取并发布成功 |
| 元数据保留 | SkillFrontmatter、SkillMetadata、Skill、AgentSkill、SolutionAgent；真实 loader 解析 JSON/嵌套 YAML | 读取创建样本及 legacy I/O；无效形状/重复键拒绝 |
| SOP 输入来源 | topologyViews nodes/edges + executionContract.externalInputs | REQUIRED_INPUT_UNBOUND 拒绝 |
| 字段覆盖 | 统一 FactType schema / propertyIds 表达；不按名称猜测字段 | ONT contract-validator 与版本不匹配回归 |
| 类型/版本一致 | 引用完整 tuple，复用 ONT validator | ONTOLOGY_VERSION_MISMATCH 拒绝 |
| 环路 | Solution DAG 门控；不支持隐式反馈环例外 | CYCLIC_TOPOLOGY 拒绝 |
| Stage 2.5/创建交接 | 三文件 contract 原样交接 project-skill-creator，frontmatter 保留 | golden fixture 加载到发布闭环 |
| 旧格式兼容 | 原文件可读、禁止自动授权或转换 | MISSING_NODE_CONTRACT；磁盘原文不变 |

生成样例不代表任意模型输出都正确；真正执行前仍必须通过发布检查，缺引用或缺策略即拒绝。
