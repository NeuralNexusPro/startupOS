# refactor-client-hooks 实施任务

对应 Story AG.10 Task AG10-T2。应用源码必须在 subagent Task worktree 实施（规约强制），本 Proposal 主 worktree 仅做规格、编排、集成。

## 1. subagent 实施包（串行，单一写入范围）

- [ ] 1.1 **WP-1 client-hooks 拆分实施**（角色：实施 subagent；依赖：无；写入范围：`packages/core/src/lib/integrations/pi-agent/client-hooks/`（新建）+ 删除 `client-hooks.ts` + `packages/core/package.json`（仅 client-hooks exports 条目 target）；串行——全部改动同一目录，不可并行）
  - 按 design.md D1 清单移动：全局 store → `session-store.ts`；类型 → `types.ts`；API 客户端 → `api.ts`；`sendMessage` 体 → `message-send.ts`；`sendMessageStream` 体 → `message-stream.ts`；主 hook + 辅助 hooks → `use-pi-agent.ts`；`index.ts` 承接 7 个公共符号 re-export。
  - D3 变换规则仅适用于两个外移函数：hook 作用域引用 → deps 字段；函数体内部局部变量逐字不动；useCallback 依赖数组 `[emitEvent]` 原样。
  - 每个新文件顶部一句话职责注释（FR-3）。
  - 必需测试：TC-1 / TC-2 / TC-3 / TC-4 / TC-6（命令见 testing.md 与本文件第 2 节）。
  - 完成证据：符号清单 diff 为空、双端 build 0 error、测试通过数 ≥ 基线、madge ≤ 12、`wc -l` 达标、console 调用计数守恒，附于本 task。

## 2. 验证（依赖 1.1）

- [ ] 2.1 TC-1 符号不变：拆分前后 client-hooks 公共导出清单 diff 为空；`grep -rn "client-hooks"` 全仓消费方 import specifier 零变化；exports 条目 specifier 不变（仅 target 路径变化）。
- [ ] 2.2 TC-2 双端编译：`pnpm --filter @originos/core build`（如无可跳过，以 web/desktop build 为准）、`pnpm --filter @originos/web build`、`pnpm --filter @originos/desktop build` 0 error；`node scripts/expand-core-exports.cjs --verify` 通过。
- [ ] 2.3 TC-3 测试基线：web 与 desktop 测试通过数 ≥ 基线（web 425/425、desktop 182/182 全绿）；`client-hooks-session-isolation.test.ts`、`hooks/__tests__`、SolutionDesign 两个测试文件全绿。
- [ ] 2.4 TC-4 循环检查：`npx madge --circular packages/core/src --extensions ts,tsx` ≤ 12；`client-hooks/` 内部无环。
- [ ] 2.5 TC-5 模块冒烟：Skill 对话流式会话收发（web dev 启动 + 首页技能入口发一条消息，事件流到达 + 无错误即视为通过；Electron IPC 分支以 session-isolation 测试覆盖）。
- [ ] 2.6 TC-6 行数达标：`wc -l` 新文件 ≤ 600。

## 3. 集成（依赖 2.x 全部通过）

- [ ] 3.1 Story AG.10 文档回写：testing.md TC-1~TC-6 结果（T2 行）、README 状态更新。
- [ ] 3.2 `openspec validate refactor-client-hooks --strict` 通过（evidence 回填后复验）。
- [ ] 3.3 docs/changes 全量流水 + 版本归档；本任务不改架构围栏，AGENTS.md 预期不动。
- [ ] 3.4 Proposal 分支合并入 `refactor/arch-governance`（需用户显式授权），清理 Task/Proposal worktree。
