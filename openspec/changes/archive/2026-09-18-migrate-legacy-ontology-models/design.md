## Context

旧项目可能保存三层 `Ontology`、访谈 `OntologyModel` 或两种 `business-model.json`。现有 Web/Desktop 转换会直接写旧 ontology 路径，缺少预览、备份、回滚和统一来源引用。canonical ontology 与 store 已由 ONT1-T1、ONT2-T1 提供。

## Goals / Non-Goals

**Goals:**

- 在 core ontology feature 内完成三种旧格式的确定性转换和输入校验。
- dry-run 与正式迁移使用同一转换函数；正式迁移显式备份、审计且不覆盖已有 canonical 快照。
- 回滚只删除仍与本次迁移结果一致的新快照，保留源文件和备份。
- 为仍依赖旧 DTO 的读取方提供纯函数只读投影。

**Non-Goals:**

- 不自动扫描、启动时迁移或双写。
- 不修改 Web/Desktop 调用方，不删除旧文件。
- 不为旧数据猜测业务规则、Action 或正式状态机语义。

## Decisions

1. **一个 core 入口，三种显式 source kind。** 迁移器接收 `projectId`、位于 data root 内的 `sourcePath` 和 `sourceKind`，读取后按 kind 校验。相比在各调用方维持转换器，这能消除重复逻辑；相比自动识别，显式 kind 能拒绝歧义输入。
2. **纯转换与文件编排分离。** 纯转换接收 `unknown` 和显式时间，返回 canonical ontology 与 diagnostics；文件编排仅负责安全路径、备份、store 写入和审计。dry-run 因而不会写任何文件，也不会与正式转换漂移。
3. **迁移只创建，不覆盖。** 若 canonical 快照存在即拒绝。迁移开始前将原始字节复制到 `data/ontology/backups/{projectId}/{migrationId}.json`，再写 canonical snapshot，并向 migrations JSONL 追加状态。
4. **保守映射。** 旧三层模型保留原 ID 和时间；业务模型使用稳定的索引 ID，并把 lifecycle 映射为状态/转换；无法表达或缺少引用的内容产生 diagnostics，不静默补规则。所有导入对象带 `sourceType: import` 来源引用。
5. **只读兼容投影是纯函数。** canonical 到旧 `Ontology` / `OntologyModel` 的投影不提供保存接口。业务模型不是可逆格式，因此不提供反向投影。
6. **回滚带并发保护。** 完成记录保存目标快照的 DataFile `updatedAt`；回滚仅在当前快照仍匹配时删除，并追加 `rolled_back`。这避免删除迁移后已被修改的数据。

替代方案：读取时自动兼容会长期维持多个事实源；原地改写旧文件增加数据丢失风险；引入通用迁移框架超出当前三个确定格式，均不采用。

## Risks / Trade-offs

- [旧 JSON 变体超出已知形状] → 返回带路径的诊断并停止写入，保留样例扩展入口。
- [备份完成后进程退出] → canonical 仍未写入，重新迁移生成新 migrationId；遗留备份可安全保留。
- [快照写入后完成审计前退出] → canonical 已存在，后续迁移拒绝覆盖并由人工核对 migrationId；本 Task 不宣称跨文件事务。
- [只读投影损失 canonical 扩展字段] → 投影明确只用于旧读取方，canonical 继续作为唯一写入事实源。

## Migration Plan

1. 调用 dry-run 并展示 diagnostics。
2. 无错误后显式执行迁移：校验路径和目标不存在、备份原始字节、记录 started、写 canonical、记录 completed。
3. 调用方逐步切换到 canonical public API；旧文件继续只读。
4. 如需回滚，核对目标 `updatedAt` 未变化后删除 canonical snapshot并记录 rolled_back。

## Open Questions

无。Web/Desktop 接线和批量迁移由后续独立 Proposal 处理。

## Subagent 实施边界

单一 core 工作包负责 `packages/core/src/lib/features/ontology/` 及其测试。Proposal 主 worktree 仅维护规格、集成、回归和归档，避免与其他模块交叉写入。
