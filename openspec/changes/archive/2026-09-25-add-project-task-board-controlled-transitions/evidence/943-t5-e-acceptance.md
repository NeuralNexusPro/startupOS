# 943-T5-E 集成验收

**日期：** 2026-09-25

**范围：** Story 9.43 的 B04、B05、B06、B10；不替代 T6–T9 或 ONT.8 的最终联合验收。

## 验收结论

| 矩阵 | 结果 | 权威证据 |
|---|---|---|
| B04 | 通过 | Core 分别验证缺失 Step/Criterion/Task Evidence、WorkItem 已完成不能替代 Task Evidence，以及 unresolved Blocker；所有拒绝均返回可定位 gap，mutation port 调用次数为零，Task revision/status 不变。 |
| B05 | 通过 | 组件故障注入让拖拽 `done` 返回 `EVIDENCE_GATE_FAILED`；卡片保留原列，搜索/Agent/优先级筛选、详情、转换草稿和选择不丢失，焦点回到原卡，`aria-live` 播报具体 Blocker。 |
| B06 | 通过 | 两个客户端以同一 revision/lease 并发请求 `blocked` 与 `cancelled`，权威 Runtime CAS 至多接受一个；另一个冲突，最终 revision 只增加一次。旧 revision、旧 lease、歧义和 unavailable 均在 mutation 前零写入拒绝。 |
| B10 | 通过 | 拖拽、键盘可操作“移动到”选择框和详情操作快捷键共用 `requestProjectTaskTransition`；相同目标发送等价 project/task/target/revision/lease，处理中卡片不换列，拒绝后焦点可见。 |

## 定向测试

```text
Core:    3 files / 39 tests passed
Web:     2 files / 21 tests passed
Desktop: 1 file  / 15 tests passed
```

执行命令：

```bash
pnpm --filter @originos/core exec vitest run \
  src/lib/features/project/__tests__/task-board.test.ts \
  src/lib/features/project/__tests__/project-task-source.test.ts \
  src/lib/features/project/__tests__/ontology-cross-package-service.test.ts
pnpm --filter @originos/web exec vitest run \
  src/components/os/workspace/project-task-board/__tests__/ProjectTaskBoard.test.tsx \
  src/services/__tests__/project-task-board.test.ts
pnpm --filter @originos/desktop exec vitest run \
  src/main/services/__tests__/ontology-cross-package-ipc.test.ts
```

新增的故障与交互覆盖：

- unresolved Blocker 在证据齐全时仍阻止 `done`，并证明拒绝后 Task 未写入；
- 并发不同目标状态复用同一权威 revision/lease CAS；
- 拖拽拒绝时同时验证原列、草稿、筛选、选择、详情、焦点和 `aria-live`。

## 工程门禁

- Core、Web、Desktop 三包 `tsc -p tsconfig.json --noEmit`：通过。
- `pnpm lint`：通过，0 errors；3174 条为仓库存量 warning。
- `pnpm lint:boundaries`：940 个生产文件，0 条诊断。
- `node scripts/check-architecture-boundaries.cjs --self-test`：根目录与 Core 包目录均通过，43 个导入用例 × 2 个 CWD。
- `openspec validate add-project-task-board-controlled-transitions --strict`：通过。
- 增量补丁 `git apply --check` 与 `git diff --check`：通过。

## 范围边界

本次只关闭 943-T5。恢复、创建、Agent/优先级写入、授权订阅和 ONT.8 平台联合验证仍由 943-T6–T9 与 ONT8-T1 继续完成，Story 9.43 保持 `In Progress`。
