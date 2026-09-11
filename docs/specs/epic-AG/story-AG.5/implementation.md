# 开发文档 - Story AG.5

**Story:** 自动化架构检查
**版本:** 1.0
**最后更新:** 2026-09-11

## 开发目标

AG5-T1 修复 Monorepo 边界检查，后续工具链另建 Task。提案：fix-monorepo-boundary-lint，AG5-T1 已验证完成；完整 AG.5 仍有后续任务。

## 实施步骤

1. 审查批准提案后创建独立 subagent Task worktree。
2. 转换现有配置为 cjs，固定根路径和 resolver，保留无关规则。
3. 复用同一规则源增加一个扫描/自测脚本及 package scripts。
4. 按 testing.md 的 T1 用例验证，记录全量存量基线。
5. 更新规约中的检查命令、变更记录、Epic/Story Task 状态；完成验证 goal 后集成。

## 文件范围

`.eslintrc.json` → `.eslintrc.cjs`、`package.json`、`scripts/check-architecture-boundaries.cjs`、本 Story、Epic AG、AGENTS.md、docs/changes。禁止修改业务源码和运行时数据。

## 迁移、审查与回滚

配置文件不可同时保留两份；验证根目录和包目录发现同一规则，确认不混入 unrelated warnings。复用现有依赖，原 lint 保持兼容。回滚本提案提交即可，无数据迁移。
