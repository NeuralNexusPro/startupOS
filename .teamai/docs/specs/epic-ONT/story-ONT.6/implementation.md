# ONT.6 实施

1. 定义最小 contract flow node/edge/external input DTO。
2. 实现单 contract ontology、facts、actions、重复和权限校验。
3. 实现 flow node/edge 引用、生产消费兼容与 required input 连通性校验。
4. 从 ontology 公共入口导出并补定向测试。
5. 更新 Story/Epic/AGENTS/changelog，运行完整门禁并归档 Proposal。

审查重点：按完整引用精确匹配；不做名称推断、自动转换、DAG 环检测或运行时调用。
