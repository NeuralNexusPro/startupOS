# Changelog - v0.4.9

本版本修复 OriginOS CE 桌面发布构建中的本体运行时校验失败问题。

## 2026-11-04 — fix：同步 packaged ontology runtime 校验夹具

**类型**：fix

**影响模块**：桌面打包校验、本体运行时发布门禁

**摘要**：为 frozen WorkItem smoke verifier 的任务运行时夹具补齐 `getSnapshot()`，并让持久化会话与运行时共享包含绑定步骤的任务投影，恢复桌面发布构建校验；不改变生产运行时行为。
