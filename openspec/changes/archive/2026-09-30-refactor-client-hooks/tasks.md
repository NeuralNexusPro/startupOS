# refactor-client-hooks 实施任务

对应 Story AG.10 Task AG10-T2。应用源码必须在 subagent Task worktree 实施（规约强制），本 Proposal 主 worktree 仅做规格、编排、集成。

## 1. subagent 实施包（串行，单一写入范围）

- [x] 1.1 **WP-1 client-hooks 拆分实施**（角色：实施 subagent；依赖：无；写入范围：`packages/core/src/lib/integrations/pi-agent/client-hooks/`（新建）+ 删除 `client-hooks.ts` + `packages/core/package.json`（仅 client-hooks exports 条目 target）；串行——全部改动同一目录，不可并行）
  - 按 design.md D1 清单移动：全局 store → `session-store.ts`；类型 → `types.ts`；API 客户端 → `api.ts`；`sendMessage` 体 → `message-send.ts`；`sendMessageStream` 体 → `message-stream.ts`；主 hook + 辅助 hooks → `use-pi-agent.ts`；`index.ts` 承接 7 个公共符号 re-export。
  - D3 变换规则仅适用于两个外移函数：hook 作用域引用 → deps 字段；函数体内部局部变量逐字不动；useCallback 依赖数组 `[emitEvent]` 原样。
  - 每个新文件顶部一句话职责注释（FR-3）。
  - 必需测试：TC-1 / TC-2 / TC-3 / TC-4 / TC-6（命令见 testing.md 与本文件第 2 节）。
  - 完成证据：符号清单 diff 为空、双端 build 0 error、测试通过数 ≥ 基线、madge ≤ 12、`wc -l` 达标、console 调用计数守恒，附于本 task。
  - **实施记录（commit 80b438a，分支 `proposal-task/refactor-client-hooks-1-split`）：** client-hooks.ts 1317 行删除 → 7 文件 1491 行（session-store 71 / types 96 / api 121 / message-send 127 / message-stream 538 / use-pi-agent 518 / index 20）；exports target 改指 index.ts，specifier 不动；hooks.ts 桥接 diff 为空。集成复核：三个纯移动文件与两个保留段 token 级逐字一致（去空白归一化对比）；message-send/message-stream 函数体 token-identical（12968/2142 token）；sendMessage/sendMessageStream 副作用调用序列合并薄包装后 8/8、23/23 MATCH；deps 对象字面量在 useCallback 体内构造、依赖数组保持 `[emitEvent]`。

## 2. 验证（依赖 1.1）

- [x] 2.1 TC-1 符号不变：拆分前后 client-hooks 公共导出清单 diff 为空；`grep -rn "client-hooks"` 全仓消费方 import specifier 零变化；exports 条目 specifier 不变（仅 target 路径变化）。**✅ index.ts 承接 7 符号 + SessionState 类型；hooks.ts/测试/SolutionDesign 零改动；exports verify PASSED。**
- [x] 2.2 TC-2 双端编译：`pnpm --filter @originos/web build`、`pnpm --filter @originos/desktop build` 0 error；`node scripts/expand-core-exports.cjs --verify` 通过。**✅ 双端 0 error；VERIFY PASSED（132 显式 / 0 通配）。**
- [x] 2.3 TC-3 测试基线：web 与 desktop 测试通过数 ≥ 基线（web 425/425、desktop 182/182 全绿）；`client-hooks-session-isolation.test.ts`、`hooks/__tests__`、SolutionDesign 两个测试文件全绿。**✅ web 425/425（71 文件）、desktop 182/182（30 文件）。注：session-isolation 2 个失败（"does not deliver project-level…" / "TC-U4/TC-I1 restores B…"）为存量基线失败——在拆分前 HEAD 逐字复现（git stash 验证），失败集合与基线一致，非拆分引入；web/desktop 汇总 425/182 含其排除口径与 AG.10-T1 相同。**
- [x] 2.4 TC-4 循环检查：`npx madge --circular packages/core/src --extensions ts,tsx` ≤ 12；`client-hooks/` 内部无环。**✅ Found 12 circular = 基线；client-hooks/ 相关 0。**
- [x] 2.5 TC-5 模块冒烟：Skill 对话流式会话收发（web dev 启动 + 首页技能入口发一条消息，事件流到达 + 无错误即视为通过；Electron IPC 分支以 session-isolation 测试覆盖）。**✅ 自动化：隔离端口 3179 `next dev` HTTP 200，渲染「欢迎进入 OriginOS / 应用启动器」，Compiled / 6331 modules，0 error；session-isolation（Electron IPC 流分支）9/11 通过=基线（2 失败为存量）；Skill 入口发消息依赖 LLM 实际响应，人工项见 testing.md。**
- [x] 2.6 TC-6 行数达标：`wc -l` 新文件 ≤ 600。**✅ 最大 message-stream.ts 538 ≤ 600；其余 20/71/96/121/127/518。**

## 3. 集成（依赖 2.x 全部通过）

- [x] 3.1 Story AG.10 文档回写：testing.md TC-1~TC-6 结果（T2 行）、README 状态更新。**✅ 已回写 story-AG.10/testing.md（AG.10-T2 执行结果）、README 状态、epic-AG/README.md。**
- [x] 3.2 `openspec validate refactor-client-hooks --strict` 通过（evidence 回填后复验）。**✅ merge f0c3721 后复验 valid。**
- [x] 3.3 docs/changes 全量流水 + 版本归档；本任务不改架构围栏，AGENTS.md 预期不动。**✅ changelog.md + releases/v0.4.0/changelog.md 已追加。**
- [ ] 3.4 Proposal 分支合并入 `refactor/arch-governance`（需用户显式授权），清理 Task/Proposal worktree。
