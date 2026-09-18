## 1. 审查与公共能力

- [x] 1.1 P0（串行，父代理，范围Proposal/Story文档）：完成strict validation、审查和用户明确批准；批准前不得创建源码Task工作区。
- [x] 1.2 T1（依赖P0，Core/Desktop子代理，独立Task worktree）：修改core Plugin SDK/Host、channel-runtime错误诊断、perception路由及desktop日志writer/宿主接线；通过PL01/03/04/05/06/07/08，提供改动文件、测试日志和commit。公共接口合入Proposal后冻结。

## 2. 插件接线

- [x] 2.1 T2（依赖T1，与T3可并行，插件子代理，独立Task worktree）：只改packages/perception-plugins/wecom及feishu的SDK logger、连接/接纳/回复日志和测试；通过PL01/02/03/05及现有插件回归，提供commit和测试证据。
- [x] 2.2 T3（依赖T1，与T2可并行，插件子代理，独立Task worktree）：修改packages/perception-plugins/email及dingtalk的受控诊断、SDK出口及测试，以及专属SDK日志patch、package.json补丁声明和pnpm-lock.yaml；通过PL01/02/05/06及现有插件回归，提供commit和测试证据。

## 3. 集成与交付

- [x] 3.1 T4（依赖T2/T3，父代理，范围集成及文档）：审查并逐个合并Task；同步AGENTS、Story和changes；定向回归、类型检查、lint、boundaries/self-test及打包入口验证。
- [x] 3.2 T5（依赖T4，父代理）：创建通过SENSE.12 SENSE12-T7测试case的验证goal，执行PL01–PL08；记录无法本机执行的平台步骤和剩余风险，不以mock替代进程/文件验证。
- [x] 3.3 T6（依赖T5，父代理）：再次strict validation与最终审查通过，测试包及证据已保留在release/plugin-logs-20260914。

验收后的交付操作：按授权合入dev，清理已合并Task/Proposal工作区；合并与清理结果以Git合并记录及worktree list为准，不提前把尚未执行的Git操作记作完成。发布另按授权执行。
