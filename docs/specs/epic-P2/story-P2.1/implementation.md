# P2.1 实施
P21-T2 对应 fix-solution-session-start。Core 子任务修改 session-restore.ts 与归属测试；Web 子任务修改 SolutionDesign.tsx 与组件测试，两者并行。父代理审查、集成、构建、实际包验证后合入 dev 并归档。保持旧技能推导，不迁移用户数据；回滚提交恢复旧行为。必须先完成 testing.md 用例再实施。

## 最终联合交付验收（2026-09-13）
测试包：/Users/archersado/workspace/startupOS/release/session-fixes-20260913/mac-arm64/OriginOS CE.app。
联合 Core 47 项、Web 7 项通过；各 Task 与此前集成测试见前文。完整 desktop:build、macOS arm64 打包通过，架构扫描866文件0违规，自测43×2通过，lint0错误2966警告。日志 /private/tmp/solution-integrated-{core,web,build,pack,lint,boundaries,selftest}.log。
实际 ASAR：合法项目内 solution-design Skill 可发送，跨项目/入口拒绝；模型拒绝在关闭空回复重试时仍抛出；任务协调器与通过回归的编译文件哈希一致；skill/persistent worker 冷启动、工具授权和关闭通过；感知首次启用、版本重连、停用通过。日志 /private/tmp/solution-asar-{session,worker,perception}-check.log。
使用临时数据和本地模拟，不调用远程模型或发送外部消息。UI由组件集成测试覆盖，未声称人工GUI/真实平台联机通过。人工：打开此包，进入解决方案查看开场并继续发送；返回原Agent/Skill历史点击任务恢复/重试；模型拒绝应显示失败。远程402等拒绝仍需处理上游配置，未知Skill无回复案例未关联。本地包未签名、公证，未替换/Applications安装版；其他Epic/Story未完成工作保持原状态。
