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
