# OriginOS CE v0.1.48 Changelog

发布日期：2026-08-19

## 新增与修复

- 完善 Goal/Task Runtime 的规划、执行、完成与结果消息交付，确保任务最终成果回到消息流并向用户展示。
- 修复 Task Runtime bridge epoch、任务工具调用契约、完成证据校验和重复消息渲染问题。
- 增加桌面端 `open_file` 系统工具，使用 macOS、Windows 或 Linux 的默认应用直接打开本地文件。
- 优化 Agent 会话退出时的后台进程清理，以及长程任务入口和任务表单交互。

## Runtime 与发布

- 保持受控 Pi Task Runtime 的版本、patch fingerprint、依赖闭包和桌面安装包校验。
- 本版本由 Desktop Release workflow 构建 Windows、macOS arm64/x64 和 Linux 产物，并同步 GitHub Release。
- 不上传 `.zip.blockmap`；保留自动更新所需的 EXE/DMG blockmap 与更新元数据。

## 验证

- 运行 Desktop、Core/Web TypeScript 与 Task Runtime 相关测试。
- 发布 workflow 完成三平台构建、安装包校验、七牛同步和 GitHub Release 资产上传后视为发布完成。
