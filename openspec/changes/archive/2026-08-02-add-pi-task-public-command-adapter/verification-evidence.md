# A-02 与 Story 9.41 验证证据

## 验证目标

通过 Story 9.41 `testing.md` 中 A-02 已实现的公共边界测试，确认受控
`pi-tasks`、Runtime host invoke、OriginOS Adapter、桌面包布局和普通聊天回归符合
契约；对尚未实现的产品测试与仅能在目标平台执行的真包测试明确标记，不以本地
smoke 或文档接线替代通过证据。

## Goal Runtime 状态

2026-08-02 清理既存 paused goal 后，已创建并执行以下 verification goal：

`执行 Story 9.41 自动化验证：通过 A-02 已实现的 TC-C1、TC-C2、TC-C3 公共边界测试与普通聊天回归，并逐项记录尚未实施的 P0/P1 产品测试、Windows/macOS 真包人工验证步骤和剩余风险。`

所有 A-02 可执行自动化矩阵均在 goal 激活后重新运行并通过；未实施产品 case 与仅能
在目标平台执行的真包 case 已按下文分类记录，不计入虚假通过率。

## 已执行矩阵

| Story case / 门禁 | 结果 | 自动化证据 |
|---|---|---|
| TC-C1 公共命令边界 | PASS | Adapter audit/integration `22/22`；Core contract `13/13` |
| TC-C2 branch replay 与 compaction | PASS | 受控 Task package `40/40`；覆盖 restart、sibling branch、重复/乱序、checkpoint、compaction 与幂等 replay |
| TC-C3 开发态版本与包布局 | PASS | Desktop verifier `6/6`；development layout 通过，包含 290 条传递依赖、公共 export、受控 package fingerprint 与 Runtime patch fingerprint |
| TC-I12 普通聊天回归 | PASS | Agent、Completion Guard、AgentManager、Session restore 共 `64/64` |
| 仓库质量门 | PASS | 离线 frozen install 1236 packages、0 download；`pnpm lint` 0 error；`pnpm type-check`、`git diff --check`、OpenSpec strict validation 通过 |

执行命令：

```bash
pnpm --filter @originos/pi-tasks test
pnpm --filter @originos/pi-agent-adapter test
pnpm --filter @originos/core exec vitest run --config src/lib/integrations/pi-agent/__tests__/pi-task-runtime-boundary/vitest.contract.config.ts
pnpm --filter @originos/desktop test:pi-task-runtime-package
pnpm --filter @originos/desktop verify:pi-task-runtime
pnpm --filter @originos/core exec vitest run src/lib/integrations/pi-agent/core/__tests__/completion-guard.test.ts src/lib/integrations/pi-agent/core/__tests__/agent.test.ts src/lib/integrations/pi-agent/__tests__/agent-manager.test.ts src/lib/integrations/pi-agent/__tests__/session-restore.test.ts
```

## 尚未实施的 Story 产品测试

以下 case 依赖 Story 9.41 后续产品 Proposal，A-02 明确不实现对应能力，因此本次
结果为 `NOT_IMPLEMENTED`，不是 `PASS` 或 `FAIL`：

- TC-U1 至 TC-U8、TC-U10 至 TC-U12：草稿、planning reservation、lease、completion
  policy、续跑控制器、EvidenceVerifier、状态投影和前台错误。
- TC-U9 的 OriginOS 产品接线未实现；受控 reducer 的 Evidence Gate 负向与成功路径
  已在 package `40/40` 中通过。
- TC-R1 至 TC-R6：产品 lease、continuation、取消、创建与崩溃窗口竞态。
- TC-I1 至 TC-I11、TC-I13 至 TC-I15：Agent/RoleAgent 当前 Session 正式任务、
  waiting_user、暂停/取消、恢复、branch 限制与前台错误投递。
- TC-UI1 至 TC-UI6：任务入口、草稿卡片、Task 状态、错误、可访问性与渲染性能。
- TC-E2E1 至 TC-E2E4：完整成功、waiting_user、暂停恢复和取消路径。

这些 case 必须在 Story 9.41 产品实现后逐项自动化，不得由 A-02 contract suite 替代。

## Windows 与 macOS 真包步骤

GitHub release workflow 已在 Windows x64、macOS arm64、macOS x64 三个 job 中先执行：

```bash
pnpm --filter @originos/pi-agent-adapter build
pnpm --filter @originos/desktop test:pi-task-runtime-package
pnpm --filter @originos/desktop verify:pi-task-runtime
```

目标平台构建完成后继续执行：

- Windows x64：`pnpm --filter @originos/desktop verify:win-package`。
- macOS arm64/x64：`pnpm --filter @originos/desktop verify:mac-package`，随后执行
  `pnpm --filter @originos/desktop verify:mac-signing`。

验收时必须保存三个 job 的结构化 verifier 输出，确认 package source、public export、
受控 package fingerprint、Runtime patch fingerprint 和传递依赖 inventory 全部匹配。

## 剩余风险与结论

- A-02 公共边界与普通聊天非回归：**PASS**。
- Story 9.41 产品能力：**NOT_IMPLEMENTED**，Story 只能标记为 Ready，不能标记 Complete。
- Windows/macOS 真包：**PENDING_PLATFORM_EVIDENCE**，本地 Linux/WSL 无法替代。
- Verification goal：**COMPLETE**，A-02 已实现范围全部通过，未实施和平台待验证项已形成显式证据与后续步骤。
