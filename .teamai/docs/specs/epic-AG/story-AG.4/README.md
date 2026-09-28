# Story AG.4: 组件分层条款修订（CLAUDE.md 与现实对齐）

**Epic:** AG — 架构治理与围栏对齐
**状态:** 📋 Planning
**优先级:** 🟠 High
**估计工时:** 1 天
**依赖:** AG.2（shared 层位置确定后再写入 CLAUDE.md）；建议在 AG.3 关键迁移完成后合入

## 概述

修订 CLAUDE.md 的「组件分层」条款，使其与项目实际组件组织方式一致。当前 CLAUDE.md 要求「atoms / molecules / organisms」分层，但现实中 `atoms/` 不存在、`molecules/` 仅 2 文件、`organisms/` 仅 1 文件且为死代码候选 — 实际是按业务域分组（os/skills/solution/project 等）。

默认采用方案 A（合法化按业务域分组）：取消三段式强制要求，新增「基础 UI + 业务域分组」规则，新增 Layer 0 `lib/shared/` 定义，新增模块 UI 豁免与 ui-deps 注入条款，CLAUDE.md 版本升级至 v2.5.0。

## 文档导航

| 文档 | 内容 |
|------|------|
| [requirements.md](./requirements.md) | 用户故事、决策说明、验收标准、风险与回滚 |
| [architecture.md](./architecture.md) | 必做项（A-1~A-7）、修订内容草稿（diff blocks、新增条款） |
| [testing.md](./testing.md) | 测试策略、验收测试用例 |

## 状态

- [ ] 需求确认
- [ ] 架构设计
- [ ] 开发实施
- [ ] 测试验证
