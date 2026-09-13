## Context
SENSE12-T6：真实组件测试选择钉钉并填写草稿，5秒后台刷新后变为email，草稿清空，catalog请求从1次变2次。SenseCenter内部SourceList/RuleList/TargetList/EventList/HealthList函数每次render身份不同，以JSX组件渲染导致卸载重建。
## Goals / Non-Goals
后台更新保留当前用户输入和焦点，仍更新健康数据。显式取消/重开保持正常初始化。不暂停轮询、不新增持久化状态、不调整平台配置接口。
## Decisions
五个函数均无Hook，改名为renderXxx并直接调用返回JSX，保持同一树位置与类型；ConnectorForm既有key继续负责显式切换不同编辑对象。相较提取五个组件与大量props，这只改调用方式，不扩大状态流；相较缓存草稿或停轮询，直接消除重建根因。
独立感知窗体与顶部入口最终均加载SenseCenter，共用修复。数据和凭据仍仅在现有表单本地state，保存前不持久化。
## Risks / Trade-offs
用户主动切tab或关闭表单的既有卸载语义保持；本Task只保证后台store刷新不重建当前表单。render辅助函数禁止引入Hook，未来若需要Hook再提取为稳定模块级组件。
## Migration Plan
独立UI Task仅改SenseCenter.tsx和对应测试；真实store/5秒定时器复现并验证选择/草稿/焦点、健康更新、规则/权限表单与取消重开。通过Web类型/lint/架构/构建后合入dev。无数据迁移，回滚代码即可。
