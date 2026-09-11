## 1. 规格与批准

- [x] 1.1 AG5-T1-P：核实现行规约、active changes 和历史 AG.1 目标，完成根目录/Web 目录漏报复现及提案规格；依赖：无；串行；负责：提案维护者；写入范围：本提案、AG.5 文档；检查：CLI status 与源码只读扫描；证据：design.md 和 AG.5 testing.md 的基线。
- [x] 1.2 AG5-T1-A：完成 strict validation、提案审查并记录用户显式批准；依赖：1.1；串行；负责：提案维护者；写入范围：本提案状态记录；检查：openspec validate fix-monorepo-boundary-lint --strict；证据：校验结果与批准消息。2026-09-11 用户明确回复“批准”；strict validation 已通过。

## 2. 最小检查修复

- [ ] 2.1 AG5-T1-I：批准后从 Proposal 分支建立独立 proposal-task/fix-monorepo-boundary-lint-1-checks 分支/worktree，委派一个 subagent 修正配置、解析和扫描入口；依赖：1.2；串行（配置与自测共用规则源）；负责 subagent：架构工具工程师；写入范围：.eslintrc.json/.eslintrc.cjs、package.json、scripts/check-architecture-boundaries.cjs；必需检查：self-test、根目录与 Web 目录一致性、pnpm lint、pnpm lint:boundaries；证据：commit、检查输出和真实存量违规列表，不把存量失败标为通过。

## 3. 集成与验证

- [ ] 3.1 AG5-T1-V：审查并合并 Task 到 Proposal 分支，创建“通过 Story AG.5 的 AG5-T1 中定义的测试 case”自动化验证 goal，执行全部 T1 用例并记录结果；依赖：2.1；串行；负责：集成与验证维护者；写入范围：仅冲突处理、AG.5 文档、Epic AG 表、AGENTS.md 检查命令与版本、docs/changes；必需检查：self-test、lint、扫描基线、git diff --check；证据：goal 结果与基线报告。全量存量清零属于后续 Task，不得宣称完成整个 Story。
- [ ] 3.2 AG5-T1-C：再次 strict validation 和工作树审计，审查通过后合并到 dev，部署后归档 Proposal，清理已合并 Task/Proposal worktree；依赖：3.1；串行；负责：提案维护者；写入范围：OpenSpec/Git；检查：git 状态、合并提交、strict validation；证据：dev 提交、归档与清理记录。
