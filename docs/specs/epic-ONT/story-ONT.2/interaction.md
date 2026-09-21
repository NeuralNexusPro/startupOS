# ONT.2 交互设计

ONT2-T1 无用户界面。调用方通过 core 公共 API 保存/读取 ontology、追加记录和查询操作最新回执。路径非法或 JSONL 中间损坏时直接返回结构化 Error，不静默降级到旧文件。
