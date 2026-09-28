# OriginOS CE v0.1.42 Changelog

发布日期：2026-07-26

## 修复

- 修复 Pi Agent 正常生命周期日志被错误记录为 ERROR 的问题。
- 工具返回 `success: false` 或非零退出码时记录明确错误原因。
- 修复工具执行失败后，Agent 仅承诺继续却提前结束会话的问题。
- 自动恢复无法完成时，向用户返回失败工具、退出码、错误原因和处理建议。
- 保留自动恢复前后的完整会话历史，隐藏内部恢复控制消息。
- 修复 Agent Worker 普通日志污染 stdout JSON Line 协议的问题。
- 修复更新元数据上传后因 CDN 缓存尚未刷新而立即终止发布的问题。

## 优化

- 向 Pi Agent 注入实际操作系统、架构、路径分隔符和默认命令 Shell。
- Windows 根据 PowerShell、cmd 或 Bash 提供对应命令语法约束。
- 保留正常回复的实时流式输出。
- API 凭据和可能包含认证参数的模型 URL 日志完成脱敏。

## 验证

- Pi Agent 日志、环境注入、工具失败和完成守卫自动化测试：53 项通过。
- Desktop TypeScript 构建通过。
- 全量 lint 通过，无新增错误。
