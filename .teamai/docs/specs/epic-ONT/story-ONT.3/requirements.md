# ONT.3 需求

- FR1：显式选择旧格式并确定性生成 canonical ontology 与 diagnostics。
- FR2：dry-run 不产生文件；错误诊断包含字段路径。
- FR3：正式迁移限制在 data root 内，备份源文件原始字节并拒绝覆盖已有目标。
- FR4：记录 started/completed/failed/rolled_back 迁移状态。
- FR5：仅在目标仍与迁移结果一致时允许回滚。
- FR6：提供旧 `Ontology` 与 `OntologyModel` 的只读兼容投影。

非目标：自动迁移、Web/Desktop 接线、删除旧数据、双写、复杂迁移框架。
