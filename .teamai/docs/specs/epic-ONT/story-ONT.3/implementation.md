# ONT.3 实施

1. 定义迁移输入、diagnostic、preview/result 和兼容 DTO。
2. 实现三种旧格式的校验与纯转换，保留已有 ID/时间并生成来源引用。
3. 扩展 store 的安全快照删除，实施备份、审计、写入和受保护回滚。
4. 从 ontology 公共入口导出 API。
5. 用旧项目样例覆盖 dry-run、正式迁移、失败和回滚路径。
6. 运行 core 测试/编译、lint、架构检查和 OpenSpec strict validation。
