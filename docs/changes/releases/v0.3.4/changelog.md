# OriginOS CE v0.3.4

发布日期：2026-09-25

## 项目本体与多 Agent 协作

- 修复 canonical Action 已接纳后 WorkItem 与 Evidence 未同步的问题；Desktop 与 Web 现在统一通过协作运行时完成受控回写。
- 增加跨进程恢复与幂等重放：中断后可继续补齐 Evidence，同一回执不会重复写入事实、执行尝试或证据。
- 补强 WorkItem 的项目、版本、租约与外部回执校验，避免过期 Worker 或未知回执推进任务状态。
- 项目任务源支持分页、并发 revision 冲突保护和千条任务规模验证。

## 安全与发布验证

- Agent 配置日志中的凭据统一完全脱敏，不再输出密钥前缀。
- macOS 与 Windows 安装包校验新增 ONT 跨包模块、Desktop IPC 和暂停／恢复／取消状态持久化验证。

## 验证

- Core、Web、Desktop 的 ONT 跨包、任务看板、协作账本和恢复专项测试通过。
- TypeScript 编译、架构边界检查与安装包 ONT 运行时校验纳入发布流程；三平台产物由 Desktop Release 工作流构建并发布。
