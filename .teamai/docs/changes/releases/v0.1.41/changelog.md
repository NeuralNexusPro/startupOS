# OriginOS CE v0.1.41 Changelog

发布日期：2026-07-26

## 修复

- 修复 Windows 自定义角色上传附件时 `data/agents/{id}` 被错误解析并返回 `Access denied`。
- 统一处理 Windows 与 POSIX 路径分隔符，并保留数据目录沙箱边界。
- 拒绝路径分隔符、NTFS Alternate Data Stream、Windows 设备名等不安全上传文件名。
- 阻止 junction 或符号链接将附件写入 OriginOS 数据目录之外。
- 增加附件上传请求、目标目录解析和拒绝原因日志。

## 验证

- Windows 路径、尾分隔符、越界路径和文件名自动化测试。
- Desktop `WorkspaceService` IPC 实际写盘 smoke：正斜杠、反斜杠、重名改名、非法文件名和空请求。
- Desktop TypeScript 构建与 Web TypeScript 类型检查。
- 本地 Windows EXE/ZIP 完整构建。
- `verify:win-package` 校验 `app.asar`、运行时模块、资源与 ZIP 结构。
