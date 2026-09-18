## Context

ONT1-T1 已定义 canonical ontology 与结构化 validation DTO，ONT2-T1/ONT3-T1 已建立存储和迁移，但当前没有 canonical validator。旧 `ontology-data-store` validator 绑定旧磁盘格式、抛出文本错误且允许部分未声明关系，不能作为新 Action Gate。

## Goals / Non-Goals

**Goals:**

- 以纯函数校验 canonical ontology 的唯一 ID、层级和全部可表达交叉引用。
- 在 ontology 合法后校验一次 Action 请求的本体版本、Action/Concept、业务状态和权限。
- 返回稳定错误码、字段路径和可选引用，供后续 API/UI/runtime 映射。

**Non-Goals:**

- 不解释或执行 `CanonicalRule.expression`。
- 不查询 Facts、实例存储或 revision，不执行和提交 Action。
- 不接入 Web/Desktop/P2/runtime，不改旧 validator。

## Decisions

1. **两个纯函数。** `validateCanonicalOntology(ontology)` 负责静态模型；`validateCanonicalAction(input)` 先调用静态校验，通过后再执行请求门控。相比 service/class，无状态函数更容易被各边界复用和测试。
2. **一次建索引后收集全部问题。** 对各集合建立 `Set`/`Map`，按模型数组顺序输出 issues；时间复杂度 O(n)，调用方一次可看到完整修复清单。
3. **稳定错误码。** 静态问题使用 `DUPLICATE_ID`、`MISSING_REFERENCE`、`INVALID_STATE_BINDING` 等；请求门控使用 `ONTOLOGY_ID_MISMATCH`、`ONTOLOGY_VERSION_MISMATCH`、`ACTION_NOT_FOUND`、`ACTION_CONCEPT_MISMATCH`、`STATE_REQUIRED`、`STATE_NOT_ALLOWED`、`PERMISSION_DENIED`。`path` 指向具体字段。
4. **静态失败短路 Action Gate。** 无效 ontology 不继续推断 Action 请求结果，避免在损坏模型上产生误导性授权判断。
5. **权限采用精确集合包含。** Action 声明的每个 permission 都必须在调用方 permissions 中；不增加通配符、角色继承或策略语言。
6. **Rule 只校验引用。** 当前 expression 为 `unknown`，没有稳定 evaluator；本 Task 验证 Action/Transition 对 Rule 的引用存在，不虚构执行语义。Rule evaluation 留给明确 schema 后续 Task。

替代方案：复用旧 validator 会引入旧路径和异常格式；引入 schema engine 或策略依赖超出 MVP；fail-fast 会增加设计修复轮次，均不采用。

## Risks / Trade-offs

- [Rule expression 未执行] → API 明确只提供结构与请求门控，不命名为 rule evaluator。
- [大型 ontology 校验成本] → Set/Map 线性扫描；当前模型规模无需缓存，测量后再增加。
- [下游误把校验当 Action 提交] → 函数无写入和副作用，文档明确 ONT5 才负责执行与回执。

## Migration Plan

新增公共 API，不改变现有调用。ONT5/ONT6 后续显式消费；回滚只需删除新增 validator、测试和导出，无数据迁移。

## Open Questions

无。Rule expression schema 与 evaluator 不属于 ONT4-T1。

## Subagent 实施边界

单一 `ont4-core` subagent 仅写 `packages/core/src/lib/features/ontology/` 及测试。Proposal worktree 负责规格、合并、回归和归档。
