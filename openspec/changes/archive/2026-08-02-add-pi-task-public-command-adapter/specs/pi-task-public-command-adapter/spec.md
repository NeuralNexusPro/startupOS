## ADDED Requirements

### Requirement: 公共宿主工具调用管线
Adapter MUST 通过版本化公共 API 在指定 Pi Session 的 current branch 调用已注册且
已激活的 task tool，并 MUST 复用模型工具调用使用的参数准备、schema validation、
`beforeToolCall`、permission、执行、`afterToolCall` 和标准 tool execution events。

#### Scenario: 合法 task command
- **WHEN** 宿主在 idle Session 中以匹配的 Session/branch scope 调用获批 task tool
- **THEN** command 通过标准管线执行，并返回稳定的 toolCallId、结构化结果和错误标记

#### Scenario: 参数不符合 schema
- **WHEN** 宿主提交不符合已注册 tool schema 的参数
- **THEN** command 返回结构化 validation failure，不执行 tool，且不写入 task event

#### Scenario: permission 拒绝
- **WHEN** `tool_call` permission handler 拒绝 command
- **THEN** command 返回 blocked 结果，仍产生配对的 start/end events，且不执行 tool

#### Scenario: 非激活或未获批工具
- **WHEN** command 指向不存在、未激活或不在 task allowlist 中的工具
- **THEN** adapter 拒绝调用，不访问 `ToolDefinition.execute()`

### Requirement: Session 与 branch scope 隔离
每个 command MUST 携带 expected Session identity 和 expected branch leaf identity。
Session 正在 streaming、compacting、reload、switch、fork 或执行另一个 host command
时，adapter MUST 拒绝并发 mutation。

#### Scenario: Scope 匹配
- **WHEN** expected Session id 和 branch leaf id 与调用时、提交后均一致
- **THEN** mutation 只写入该 current branch

#### Scenario: Stale branch
- **WHEN** expected branch leaf id 与 current branch 不一致
- **THEN** command 在执行前返回 stale scope，不写入任何 reservation 或 task event

#### Scenario: 调用期间 branch 改变
- **WHEN** tool 执行期间 Session branch identity 发生改变
- **THEN** adapter 将结果标记为 contract violation，禁止把该 mutation 确认为成功

#### Scenario: Session busy
- **WHEN**模型 turn、compaction、reload 或另一个 host command 正在运行
- **THEN** adapter 返回 busy，不与现有执行交错

### Requirement: 稳定 revision 与 cursor
受控 Task extension MUST 在 canonical `pi-tasks:event` envelope v2 中持久化 revision、
requestId、parent cursor 和 payload hash，并以 Session entry id 作为稳定 cursor。
Revision MUST 在同一 branch 内单调递增，且重启 replay MUST 得到相同
revision/cursor。

#### Scenario: Mutation 产生 revision
- **WHEN** task mutation 追加一个新的 `pi-tasks:event`
- **THEN** result 包含比 mutation 前更大的 revision 和该 entry 的 cursor

#### Scenario: Mutation 没有 task event
- **WHEN** tool 返回成功但没有新的 `pi-tasks:event`
- **THEN** adapter 将 mutation 标记为未确认并返回 contract failure

#### Scenario: 重启 replay
- **WHEN**进程重启后从相同 Session current branch 恢复 adapter
- **THEN** adapter 从公共 branch entries 重建相同的 latest revision 和 cursor

#### Scenario: 重复或乱序 event
- **WHEN** adapter 收到已接受 cursor 的重复 event 或早于 latest revision 的 event
- **THEN** adapter 忽略该 event并记录有界诊断，不回退 snapshot

### Requirement: 公共状态桥接
受控 Task extension MUST 通过公共 Pi extension event bus 输出
`pi-tasks:state` v2。Adapter MUST 将其映射为版本化 OriginOS contract snapshot。
Snapshot MUST 绑定 Session、cursor、revision、state hash 和可选 mutation receipt，
且 MUST NOT 暴露 extension 私有 store/reducer。

#### Scenario: Mutation 与 state event 关联
- **WHEN** task command 成功追加 event 并发出对应 `pi-tasks:state`
- **THEN** adapter 仅在 event scope、task id、revision 和 cursor 可关联时确认 mutation

#### Scenario: State event 超时
- **WHEN** mutation 后在有界时间内没有可关联的 public state event
- **THEN** adapter 取消订阅并返回 state event timeout，不把 tool result 视为已提交

#### Scenario: Snapshot 有界
- **WHEN** adapter 输出 task snapshot
- **THEN** payload 使用版本化 schema、限制列表和字符串大小，且不包含 prompt、凭据或完整工具输出

### Requirement: request id 幂等
每个 mutation MUST 要求 requestId。受控 Task extension MUST 在 current branch 的
canonical event envelope 中持久化 requestId 和 payload hash，使重复请求、进程崩溃
和恢复不会创建重复 task mutation。Adapter MUST NOT 另建会与 task ledger 双写的
reservation/commit 事实源。

#### Scenario: 重复已完成请求
- **WHEN**相同 requestId、tool name 和 input hash 再次提交
- **THEN** adapter 返回原 mutation 的 revision/cursor/result 摘要，不再次执行 tool

#### Scenario: requestId 内容冲突
- **WHEN**相同 requestId 携带不同 tool name 或 input hash
- **THEN** adapter 返回 idempotency conflict，不执行 tool

#### Scenario: Task event 后响应前崩溃
- **WHEN**进程在 canonical task event 写入后、mutation receipt 返回前退出
- **THEN**恢复逻辑从 event envelope 重建原 receipt，不再次执行 tool

### Requirement: Evidence gate 不可绕过
受控 Task extension MUST 保留标准 Evidence gate，并 MUST 从 command schema、event
schema 和 reducer completion validation 中删除 `task_complete.force_with_reason`
或任何等价的强制完成旁路。

#### Scenario: 缺少 Evidence
- **WHEN** required Criterion 缺少合格 Evidence 时调用 `task_complete`
- **THEN** task 保持非终态并返回结构化拒绝原因

#### Scenario: 请求强制完成
- **WHEN**宿主或模型调用 `task_complete` 并携带 `force_with_reason`
- **THEN**schema validation 在 tool 执行前拒绝调用，不写入 completed event

#### Scenario: 迁移旧强制完成记录
- **WHEN**replay 读取 v1 ledger 中的 forced completion
- **THEN**记录只读保留并标记 `legacy_forced_completion`，不得作为可信 Evidence

#### Scenario: Evidence 满足
- **WHEN**所有 Step、Criterion、Evidence 和 Blocker gate 均满足
- **THEN** `task_complete` 通过标准管线完成一次，并产生新的 revision/cursor

### Requirement: 对话历史保持合法
Host command MUST NOT 向对话历史追加没有对应 assistant tool call 的孤立
toolResult message，也 MUST NOT 伪造 `agent_start`、`turn_start` 或 assistant message。
Task extension 自身的 custom entry MUST 正常持久化。

#### Scenario: Host command 完成
- **WHEN**宿主调用 task tool 完成
- **THEN** Session 消息历史不增加孤立 assistant/toolResult pair，task custom entries 正常存在

#### Scenario: 模型工具调用回归
- **WHEN**模型在普通 agent loop 中调用任意工具
- **THEN**既有 message、turn、tool event 顺序和持久化行为保持不变

### Requirement: Compaction 与 branch replay
Adapter 的 revision、idempotency entries 和 task snapshot MUST 在公共 compaction
lifecycle 与 current-branch replay 中保持一致，不得依赖 process-local cache 作为事实源。

#### Scenario: Compaction 后恢复
- **WHEN**非终态 Task 完成 compaction 并重新 replay
- **THEN** Adapter 从 append-only current branch（包含 compaction 前的 Task custom entries）
  恢复 Task contract、latest revision/cursor 和全部已提交 requestId，不能把 LLM context
  裁剪误当成 Session ledger 删除

#### Scenario: 仅 checkpoint 降级恢复
- **WHEN**恢复输入只剩一个合法 checkpoint、缺少 compaction 前的历史 custom entries
- **THEN** Adapter 只对 checkpoint `receiptWindow` 明示的 requestId 提供原 receipt replay，
  并暴露 retained/omitted 边界，不得声称等价于正常 full-branch replay

#### Scenario: Branch 分叉
- **WHEN** Session 从旧节点创建另一个 branch
- **THEN**新 branch 仅继承共同祖先上的 task 与 adapter entries，不读取原分支后续 mutation

### Requirement: 版本、打包与失效保护
Public adapter MUST 锁定精确 Pi Runtime 和 `@originos/pi-tasks` compatibility matrix，并在
Electron development、Windows x64、macOS x64 和 macOS arm64 中可解析。Runtime
版本或 patch hash 不匹配时，Task adapter MUST fail closed，普通聊天 MUST 保持可用。

#### Scenario: 兼容组合加载
- **WHEN**开发态或受支持平台 package 加载 `@originos/pi-agent-adapter/task-runtime`
- **THEN** public export、runtime patch、受控 Task extension 和 transitive dependencies 均可解析

#### Scenario: Patch 或版本不匹配
- **WHEN**安装的 runtime version、受控 Task extension version 或 patch hash 与兼容矩阵不同
- **THEN**adapter 返回 incompatible runtime 并禁用 Task capability，不影响普通聊天

#### Scenario: 私有边界扫描
- **WHEN**strict verification 扫描 adapter 和调用方源码
- **THEN**不存在 `pi-tasks` 私有 reducer/store import、Session 文件解析或 node_modules 直接修改
