# 开发文档 - Story M.8

**Story:** 记忆链路收敛 — 围栏修复 + 新旧合并 + DataFile 对齐
**版本:** 1.0
**最后更新:** 2026-09-09

## 开发目标

将现有 memory-core 收敛为唯一记忆实现，消除反向依赖和运行时双写，并兼容读取旧存储格式。

## 实施步骤

### Phase 1：围栏与类型

- [x] 清除 `packages/core/src/modules/memory-core/` 中的 `any`。
- [x] 验证 memory-core 不依赖 Web、Desktop 或 pi-agent feature 内部实现。
- [x] 复用公共类型和依赖注入，不新增平行抽象。

### Phase 2：存储格式

- [x] `blocks.json` 使用 DataFile envelope，并兼容读取旧数组格式。
- [x] `entries.jsonl` 每行使用 DataFile envelope，并兼容读取旧 entry。
- [x] 旧 `Memory.md` 迁移保留可恢复备份且幂等。

### Phase 3：运行链路

- [x] RoleAgent、ProjectAgent、PersistentAgent、协作 worker 均通过 MemoryCore。
- [x] Dream 保持兼容薄壳，唯一长期整理入口为 MemoryConsolidator。
- [x] 固定 prompt 注入顺序并覆盖回归测试。

### Phase 4：验证与文档

- [x] 执行 Story M.8 testing.md 中的单元、集成、围栏和类型检查。
- [x] 更新 Epic M 中 M.1–M.8 的真实实施状态。

## 文件级范围

- `packages/core/src/modules/memory-core/`：类型、DataFile 兼容、迁移与测试。
- `packages/core/src/lib/integrations/pi-agent/role-agent/`：仅保留兼容薄壳。
- `packages/core/src/lib/integrations/pi-agent/{agent-manager,persistent-agent-manager}.ts`：运行时装配。
- `packages/core/src/modules/collaboration-runtime/sandbox/agent-worker.mts`：协作运行时装配。
- `docs/specs/epic-M/`、`docs/design/memory-core.md`：状态和结构同步。

## 兼容与审查

- 不删除用户现有 Memory/Archival/Recall 数据。
- 新格式写入使用原子替换；旧格式只读兼容并在安全时迁移。
- core 不反向依赖 Web/Desktop；API/IPC 只负责边界映射。
- 不新增第三方依赖。
