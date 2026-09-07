# @originos/pi-tasks

OriginOS 维护的受控 `pi-tasks` fork。包内保留上游 Task、Step、Criterion、Evidence、
Blocker 与 reducer 规则，并增加 branch-safe revision/cursor、requestId 幂等、CAS、
mutation receipt 与不可绕过的 Evidence Gate。

该 package 是 Task 领域状态的唯一事实源；OriginOS Adapter 不得复制 reducer 或直接读取
其私有 store。

## Evidence Gate

- Task 只有在 Step 已完成、Criterion 已满足、Blocker 已解决，且关联 Evidence 明确通过质量门控后才能完成。
- Step、Criterion 与 completion 关联的 Evidence 使用同一质量规则；缺失、`null`、`unknown`、failed 或不可复现的 Evidence 均不能证明完成。
- v2 tool、mutation request 与 ledger event 不接受 `forceWithReason` 或等价字段。
- v1 ledger 或旧 snapshot 中的 forced completion 仅迁移为 `legacy_forced_completion` 只读审计记录；Task 不恢复为可信 `done`，该记录也不计作 Evidence。

## Ledger 与 Session Cursor

- `expectedCursor`、receipt 的 `cursorBefore` 和 envelope 的 `parentCursor` 都表示调用前真实 Session branch leaf。
- receipt 的 `cursorAfter` 与 state-event scope cursor 表示新写入的 Task Session entry。
- store metadata 的 `cursor` 只表示最近 Task ledger entry；Task revision/ledger cursor 负责 Task 事件顺序，不能替代 Session leaf CAS。
- 每次 mutation/checkpoint 都会先将内存投影与当前 `SessionManager.getBranch()` 重放结果对齐；切换到 sibling branch 后，旧 store 即使 revision 相同也会以 `BRANCH_STATE_STALE` fail closed。
- 已提交 request 的幂等重试先验证当前 branch 是否包含原 mutation receipt；跨 branch 不复用 receipt。

## Compaction 幂等窗口

Pi Session branch 是 append-only；正常 compaction 只裁剪发送给模型的上下文，不删除 branch 上已有的 Task custom entry。因此正常 restart/compaction 恢复必须重放完整 current branch，历史 requestId 继续由原 mutation envelope 提供幂等。

Checkpoint payload 上限为 64KB，receipt 使用 `latest_revision_window` 策略，最多保留最近 128 条，并在接近上限时继续从最旧记录开始缩减。仅从单个 checkpoint 恢复属于降级路径：窗口内 requestId 保持幂等，已被窗口淘汰的旧 requestId 不再提供幂等保证。该边界由 `receiptWindow` 的 retained/omitted 数量和 revision 范围明确记录。

如果 canonical Task state 自身已超过 64KB，checkpoint 会返回 `CHECKPOINT_TOO_LARGE`，不会写入部分 snapshot。状态分片或外部引用不属于当前受控 fork 范围。

Checkpoint hash 覆盖 revision、ledger/session parent、snapshot event 和 checkpoint payload，用于发现意外损坏、部分写入和字段漂移。本地 Session JSONL 是可信 canonical storage；该 hash 不用于对抗能够任意修改本地文件并重新计算 hash 的攻击者。
