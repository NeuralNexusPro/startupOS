## 兼容矩阵

本矩阵是 A-02 Task Runtime 能力的 fail-closed 基线。只有表中所有版本、公共契约版本
和 fingerprint 同时匹配时，Adapter 才能启用 Task capability；普通聊天不依赖本矩阵。

| 层级 | Package / Contract | 精确版本 | Fingerprint / Contract | Owner |
|---|---|---:|---|---|
| Runtime core | `@earendil-works/pi-agent-core` | `0.80.10` | patch SHA-256 `10bda90bbb3ff426f6057312464e2cdb470fe61acd4f9e37ffc8436755e644a6` | Agent Runtime |
| Runtime host | `@earendil-works/pi-coding-agent` | `0.80.10` | patch SHA-256 `7d70e7b71db29280df41ddf1f8701c9ae56c98e9e48b85ee11700c4ca66c11b4`；host invoke contract `1` | Agent Runtime |
| Runtime patch set | 两个 Runtime patch 的有序清单 | `1` | composite SHA-256 `213b1f2db610720ca0dde1853abbe02975185ad37c95eb517031844631371674` | Agent Runtime |
| Task extension | `@originos/pi-tasks` | `0.2.0-originos.1` | public API `1`；event `2`；state event `2`；schema `originos-pi-tasks/v1:event-v2:cas:receipt:evidence-gate-no-force`；32-file package SHA-256 `c900eb1fc776fd0c2ed28d076374a0253d6cb01963590f0930591725b9bb99e0` | Task Extension |
| Adapter | `@originos/pi-agent-adapter/task-runtime` | adapter package `0.80.10` | adapter contract `1`；snapshot `1`；state event `pi-tasks:state@2`；Task commit `10b87be` | Agent Runtime |

### Fingerprint 计算规则

Runtime patch set 对两个小写十六进制 patch SHA 按下列 UTF-8 文本计算 SHA-256，末尾包含
换行符：

```text
core:10bda90bbb3ff426f6057312464e2cdb470fe61acd4f9e37ffc8436755e644a6
coding-agent:7d70e7b71db29280df41ddf1f8701c9ae56c98e9e48b85ee11700c4ca66c11b4
```

Task extension fingerprint 从 `npm pack --dry-run --json` 返回的发布文件清单生成。文件路径按
ASCII 升序排列，每行格式为 `<file-sha256><两个空格><relative-path>\n`，再对完整 UTF-8
manifest 计算 SHA-256。当前 32 个发布文件的结果为
`c900eb1fc776fd0c2ed28d076374a0253d6cb01963590f0930591725b9bb99e0`；不得使用 Git
commit、时间戳、本地绝对路径或 tarball metadata 作为 fingerprint。

### 静态校验

- Runtime package version 必须全部为 `0.80.10`。
- `AgentSession.prototype.invokeRegisteredTool` 与 core `invokeRegisteredToolCall` 必须可解析。
- `@originos/pi-tasks` 必须公开 extension factory、event/state contract 与 replay API。
- Adapter 只允许公共 `task-runtime` 子路径，不得导入 Task extension 私有 reducer/store。
- Adapter bridge 必须绑定 Session id、bridge epoch、current branch membership、host abort 与
  public EventBus；缺少任一宿主回调时 fail closed。
- 任一字段缺失或不匹配时返回 `INCOMPATIBLE_RUNTIME`，不得尝试降级执行 mutation。

### 回滚边界

回滚时按 Adapter、Task extension、Runtime patch 的逆序移除：

1. 移除 `@originos/pi-agent-adapter/task-runtime` export 和调用方 wiring。
2. 移除 `@originos/pi-tasks` workspace package 与 package verification。
3. 移除两个 pnpm patch 和 `patchedDependencies` lockfile 记录。
4. 恢复 ADR-009 的 blocked 结论；普通聊天、既有 Session 和用户数据保持不变。

本 Proposal 不启用产品 Task Runtime，因此回滚不需要迁移 Task 用户数据。
