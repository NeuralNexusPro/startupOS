# Design：Perception Plugin Host

Core 定义纯契约、Registry、Host 和 schema/事件校验；Desktop 注入 Credential、Network、Schedule、Health、Audit Ports；Web 只消费 manifest/schema。bundled plugins 只依赖 core 公共 SDK，不依赖宿主内部实现。

状态事实源为 `data/perception/connectors` 和编译期 bundled catalog。Host 按 plugin/connector 隔离生命周期与凭据命名空间，单插件失败不传播。Connector 新增 pluginId/pluginVersion，迁移采用幂等双读写。

替代方案：继续平台硬编码（扩展成本高）；允许插件自带 React（供应链与样式风险高）；执行 data 目录 JS（不可信代码风险高）。因此首期采用可信编译期插件和声明式 UI。

实施边界：Core SDK/Host、Web schema UI、WeCom+Email、Feishu+DingTalk 可在互不重叠 Task worktree 开发，最后由集成任务处理迁移和清理。
