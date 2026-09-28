# Story AG.1: 死代码与死路径清理

**Epic:** AG — 架构治理与围栏对齐
**状态:** 📋 Planning
**优先级:** 🔴 Critical（清场作业，先于 AG.2/AG.3 完成）
**估计工时:** 1–2 天
**依赖:** 无（独立可执行）

## 概述

清除当前仓库中存在的死路径 import、被标 `@deprecated` 但仍被引用的模块、以及没有任何引用方的孤立组件。本 Story 聚焦纯删除/纯解绑操作，不引入新依赖、不重组目录、不动业务语义，是后续 AG.2（边界修复）和 AG.3（目录迁移）的"清场"前置。

关键清理目标包括：`collaboration-runtime-bridge` 死路径 re-export、`collaboration-runtime-service` deprecated 服务壳、`CommandInterface` 孤立组件，以及通过 ts-prune/knip 识别的已废弃未删条目。

## 文档导航

| 文档 | 内容 |
|------|------|
| [requirements.md](./requirements.md) | 用户故事、验收标准、风险与回滚、相关文档 |
| [architecture.md](./architecture.md) | 必做项（A-D）、技术细节、扫描命令、涉及文件清单 |
| [testing.md](./testing.md) | 测试策略、验收测试用例 |

## 状态

- [ ] 需求确认
- [ ] 架构设计
- [ ] 开发实施
- [ ] 测试验证
