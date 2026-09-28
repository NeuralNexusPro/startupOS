# ONT.5 实施

1. 定义 facts query、Action submission、输出草稿、审计和判别联合结果类型。
2. 实现绑定当前 ontology 的 facts 过滤与 latest 选择。
3. 实现 Action Gate、输入存在性、输出 FactType 和 revision 检查。
4. 实现 operation 请求指纹、单实例串行、intent 恢复与 accepted 回执。
5. 从 ontology 公共入口导出，补一组最小而完整的文件存储测试。
6. 更新 Story/Epic/AGENTS/变更记录并运行完整门禁。

审查重点：拒绝必须发生在 intent 前；恢复不得重复 facts；metadata 不参与授权；不执行 Rule 或外部副作用。
