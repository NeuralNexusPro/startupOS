# ONT.3 交互设计

ONT3-T1 无 UI。调用方先执行 dry-run 查看 canonical 预览和 diagnostics，再显式执行迁移。发现已有目标、越界路径或无效引用时直接失败；回滚在目标已变化时明确拒绝，不静默覆盖或删除。
