# P2.1 测试
## P21-T2 实施前验收
| 用例 | 成功或失败条件 | 自动化范围 |
|---|---|---|
| TC1 | 保存的项目、skill、solution-design 与请求一致可发送 | Core 真实归属校验 |
| TC2 | 跨项目或不同入口拒绝 | Core 负测 |
| TC3 | 旧技能缺失元数据保持原校验 | Core 回归 |
| TC4 | 自动开场仅一次，后续消息调用真流式接口 | SolutionDesign 组件 |
| TC5 | 初始化或发送失败可见，不永久等待 | 组件失败/挂载边界 |
| TC6 | 打包后合法项目技能仍可通过，非法仍拒绝 | 实际 ASAR 合成数据脚本 |
## 命令
Core/Web 对应 Vitest，pnpm lint、pnpm lint:boundaries、node scripts/check-architecture-boundaries.cjs --self-test、pnpm desktop:build 和 macOS 本地打包。
## 数据及人工验证
使用虚构项目和入口，不写实际用户数据，不调用远程模型。人工从项目打开 AI 解决方案，确认开场和后续消息；远程模型可用性与 GUI 联机保留人工步骤。结果在交付后追加。

## 最终联合交付验收（2026-09-13）
测试包：/Users/archersado/workspace/startupOS/release/session-fixes-20260913/mac-arm64/OriginOS CE.app。
联合 Core 47 项、Web 7 项通过；各 Task 与此前集成测试见前文。完整 desktop:build、macOS arm64 打包通过，架构扫描866文件0违规，自测43×2通过，lint0错误2966警告。日志 /private/tmp/solution-integrated-{core,web,build,pack,lint,boundaries,selftest}.log。
实际 ASAR：合法项目内 solution-design Skill 可发送，跨项目/入口拒绝；模型拒绝在关闭空回复重试时仍抛出；任务协调器与通过回归的编译文件哈希一致；skill/persistent worker 冷启动、工具授权和关闭通过；感知首次启用、版本重连、停用通过。日志 /private/tmp/solution-asar-{session,worker,perception}-check.log。
使用临时数据和本地模拟，不调用远程模型或发送外部消息。UI由组件集成测试覆盖，未声称人工GUI/真实平台联机通过。人工：打开此包，进入解决方案查看开场并继续发送；返回原Agent/Skill历史点击任务恢复/重试；模型拒绝应显示失败。远程402等拒绝仍需处理上游配置，未知Skill无回复案例未关联。本地包未签名、公证，未替换/Applications安装版；其他Epic/Story未完成工作保持原状态。
