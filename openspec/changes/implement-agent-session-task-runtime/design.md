## Context

Story 9.41 已经完成 Pi Runtime `0.80.10`、`@originos/pi-tasks@0.2.0-originos.1` 与 `@originos/pi-agent-adapter/task-runtime` 的公共边界验证，但产品运行链路仍只支持普通聊天。Agent 与 RoleAgent 缺少正式任务入口、canonical Task 状态、证据门控、受控续跑和重启恢复。

当前产品 Agent 基于 `packages/core/src/lib/integrations/pi-agent/core/agent.ts` 封装低层 Pi Agent；Desktop 主进程负责 Session IPC 和持久化；Web 的 `AgentDialogContent` 与 `ChatInputBar` 负责 Agent/RoleAgent 共同会话界面。该变更跨越 adapter、Core、Desktop 与 Web，因此必须保持单向依赖，并确保普通聊天路径零行为变化。

数据所有权分为三层：

- `@originos/pi-tasks` 当前 branch entries 是 Task plan、step、criterion、evidence、blocker 和完成状态的唯一事实源。
- OriginOS Session 只持有 Task Runtime execution lease、幂等 request 映射、Pi branch 引用、续跑计数和有界 UI projection。
- renderer 只持有未提交的任务草稿；草稿不写入 Session，也不创建正式 Task。

主要使用者是 Agent/RoleAgent 用户；运行时维护者负责 Pi 兼容性、恢复和 completion policy；Web 维护者负责任务卡片与输入入口；Desktop 维护者负责 IPC 和进程边界。

## Goals / Non-Goals

**Goals:**

- 在 Agent 与 RoleAgent 的输入框工具栏提供创建任务入口，并在消息区完成草稿确认。
- 在原 Session、原 Agent execution context 和原 branch 内创建、执行并恢复一个正式 Task。
- 通过受控 `pi-tasks` 工具和公共 adapter 执行任务规划、状态更新、证据记录与完成门禁。
- 让普通聊天与 Task Runtime 使用互斥 completion policy，避免两个自动续跑机制相互干扰。
- 提供有界、可诊断、可停止、可恢复的续跑控制和用户可见失败反馈。
- 保持 Agent 与 RoleAgent 共用同一实现，保证 Windows、macOS 与开发态行为一致。

**Non-Goals:**

- 不在运行时引入 Workflow、DAG、Worker、subagent 或多 Agent 编排。
- 不创建独立 Session 或后台常驻任务。
- 不允许普通聊天自动升级为 Task Runtime。
- 不复制或改写 canonical Task plan、criteria 或 evidence。
- 不开放绕过 Evidence Gate 的强制完成能力。
- 不实现 Story 9.42 的多 Agent Task 协作。

## Decisions

### 1. 以 `pi-tasks` branch entries 为唯一 Task 事实源

正式 Task 的 plan、step、criterion、evidence、decision、blocker 与状态全部由 `@originos/pi-tasks` extension 生成和 replay。OriginOS 不建立第二套 Task reducer，仅保存 actual branch entries 的持久化载体以及 execution lease。

选择原因：Evidence Gate 和状态迁移必须由一个 reducer 决定；双写 plan 会产生 revision 漂移和恢复歧义。

考虑过的替代方案：在 Core 中定义 OriginOS Task JSON 并把 `pi-tasks` 当校验器。该方案会形成第二事实源，因此拒绝。

### 2. 在 adapter 内提供产品级 Session host，Core 只调用公共边界

`packages/agent` 新增 Session host，负责加载受控 extension、注册公开 tools/lifecycle hooks、replay branch entries、执行 CAS 校验并返回 canonical snapshot。Core 通过 `@originos/pi-agent-adapter/task-runtime` 公共类型和方法使用该 host，不直接依赖 `@originos/pi-tasks` 内部文件。

选择原因：依赖方向保持为 Core integration 到 adapter；Pi extension API、event API 和 compaction 兼容性集中在 adapter 边界。

考虑过的替代方案：Core 直接 import `@originos/pi-tasks`，或读取 extension 私有 store。前者扩大上游耦合，后者违反 A-02 公共 API 门禁，因此拒绝。

### 3. Task tools 仅在 Task execution mode 动态可见

Session 有且仅有一个 execution mode：`chat`、`task_planning` 或 `task_running`。提交草稿后进入 `task_planning`，运行时临时安装受控 task tools；规划成功后进入 `task_running`；结束、取消或失败后卸载 task tools 并回到 `chat`。

选择原因：普通聊天不应看到或调用 task tools，也不应受 Task Runtime continuation 影响。

考虑过的替代方案：始终向 Agent 暴露 task tools，再用 prompt 约束。该方式无法形成硬隔离，因此拒绝。

### 4. completion policy 由 prompt 调用显式选择且互斥

`OriginOSAgent.prompt/continue` 接受内部 execution policy。`chat` 只运行现有 Chat Completion Guard；`task_planning/task_running` 禁用 Chat Completion Guard，并由 `TaskContinuationController` 在完整 Agent turn settle 后决策。

Task controller 只依据 canonical snapshot、最新工具结果、Agent idle、pending user input、预算和 no-progress 计数作出：`continue`、`verify`、`wait_user`、`pause`、`fail`、`complete`。它不分析 `text_delta`，也不根据局部流式文本触发续跑。

选择原因：两个 guard 并存会重复注入 continuation，破坏 Session 顺序；完整 turn 决策能避免流式阶段误判。

### 5. 使用版本化 execution lease 和 CAS 防止重复创建

Task 创建请求包含 `requestId`。Session execution state 使用 schema version、`bridgeEpoch`、`expectedRevision`、`expectedCursor` 与 lease owner。相同 `requestId` 返回同一 Task；不同请求在已有 active/planning Task 时得到冲突响应。每次控制命令必须通过 revision/cursor/epoch 校验。

选择原因：renderer 重试、IPC 重放、窗口重复点击和应用恢复都可能产生重复请求。

### 6. Task 卡片是 canonical snapshot 的有界投影

Core 将 snapshot 投影为稳定 UI 模型，只包含 Task 标识、目标、状态、ordered steps、criteria evidence 状态、blocker、进度、可执行 actions 和 revision。单字段文本和列表数量都有上限；原始 tool output、完整 conversation 和内部 entry 不通过 IPC 广播。

选择原因：避免大 payload 阻塞 Electron 主进程或 renderer，同时不泄露内部状态。

### 7. 受控续跑只能在当前 Session 空闲边界触发

续跑必须同时满足：execution mode 为 `task_running`、Task 未终态、Agent idle、无待处理用户消息、lease/revision/epoch 匹配、预算未耗尽、no-progress 未触发。每个 Task 有自动续跑次数和连续无进展上限；达到上限转为 `paused` 或 `failed` 并输出用户可见原因。

选择原因：长期任务需要继续推进，但不能覆盖用户输入、无限循环或在旧 turn 上推进新 Task。

### 8. Session 恢复先 replay，再决定是否续跑

应用重载或窗口重开时，Desktop 从 Session JSON 读取 execution state 和 branch entries，adapter replay 得到 canonical snapshot。若 lease 与 snapshot 一致且 Agent idle，则恢复 Task 卡片；只有明确为 `task_running` 且保护条件满足时才续跑。若数据损坏、版本不兼容或 branch 不存在，进入 `failed`/`paused`，保留普通聊天能力。

选择原因：UI projection 可能过期，恢复必须以 replay 结果为准。

### 9. IPC 使用命令/快照/事件三类版本化契约

Desktop 提供创建、读取、停止/恢复 Task 的 command；查询返回 snapshot；状态变化通过单一 Task Runtime event 推送。所有请求带 `sessionId`、`requestId` 和 protocol version。Core 定义公共 DTO，Desktop 只做参数校验、调用与响应映射，Web 只通过 Core client service/hook 消费。

选择原因：避免 Web 直接依赖 Electron main，实现开发态和打包态一致边界。

### 10. 并行实施采用不重叠 worktree 范围

- Task A：`packages/agent/**`、`packages/core/src/lib/integrations/pi-agent/task-runtime/**` 及必要的 Core Agent/Session 公共契约。
- Task B：`packages/desktop/src/main/**` 中的 IPC 与 Session 服务接入。
- Task C：`packages/web/src/components/**` 与 Core client hook 的 UI 接入；若需要修改 Core client 文件，由 Task A 先提供契约，Task C 只修改 Web。
- Task D：新增测试、Story/OpenSpec 文档和验证脚本，不修改 A/B/C 已拥有的实现文件。

各 Task branch 从 Proposal integration branch 创建，合并回 Proposal branch 后统一回归，禁止并行写同一文件。

## API 与状态模型

execution state 使用版本化可选字段，旧 Session 不迁移即可读取：

```typescript
interface AgentTaskExecutionStateV1 {
  schemaVersion: 1;
  mode: 'chat' | 'task_planning' | 'task_running';
  status: 'idle' | 'planning' | 'running' | 'waiting_user' | 'paused' | 'failed' | 'completed' | 'cancelled';
  requestId?: string;
  taskId?: string;
  bridgeEpoch: number;
  expectedRevision: number;
  expectedCursor?: string;
  branchId?: string;
  continuationCount: number;
  noProgressCount: number;
  lastProgressFingerprint?: string;
  lastError?: { code: string; message: string };
  projection?: AgentTaskProjectionV1;
  updatedAt: string;
}
```

状态写入遵循单 Session 串行队列与 CAS。Task command 不跨 Session，不接受 renderer 提供的文件路径、tool 名称或任意 branch id。

## 性能与安全

- Task event 与普通流式消息使用不同 channel；Task event 只在 revision 变化时发送。
- projection 限制 steps/criteria/evidence 数量和单字段长度，避免 IPC 大对象与 React 重渲染。
- continuation 使用微任务/异步调度，不在 Electron 主线程执行同步轮询或文件遍历。
- 所有错误输出做凭据脱敏；不向 renderer 暴露 raw tool result、API key 或 Session 内部路径。
- `task_complete` 必须经过上游 Evidence Gate；OriginOS 不提供 bypass 参数。
- 兼容矩阵不匹配、adapter 公共能力缺失或 replay 失败时 fail closed，仅禁用 Task Runtime。

## Risks / Trade-offs

- [Task extension 与低层 Agent tool 生命周期存在适配复杂度] → 在 adapter Session host 集中转换，使用真实 extension contract test 和打包 smoke。
- [Session JSON 中 actual branch entries 可能增长] → 仅保存 canonical entries，依赖公共 compaction event；projection 始终有界。
- [自动续跑可能产生额外 token 成本] → 设置默认 turn budget、no-progress guard、用户停止入口和清晰状态。
- [窗口重开时旧 projection 短暂显示] → 恢复先标记 `recovering`，replay 完成后一次性替换。
- [Task planning 失败后用户无法继续] → 保留草稿内容，显示失败原因和重试/返回聊天操作。
- [多窗口同时控制同一 Session] → 通过 requestId、revision、cursor 和 bridgeEpoch CAS 拒绝 stale command。

## Migration Plan

1. 发布 adapter Session host 与 contract tests，保持旧 adapter exports 向后兼容。
2. 发布 Core Task Runtime types/coordinator，并将 Session execution 字段设为可选。
3. 接入 Desktop IPC 和恢复路径，默认 capability 可配置关闭。
4. 接入 Agent/RoleAgent UI 入口和 Task 卡片；Skill 与普通聊天不启用入口。
5. 执行 adapter、Core、Desktop、Web、Windows package 与 macOS module-resolution 回归。
6. 开启 capability；旧 Session 在首次创建 Task 前保持无 execution state。

回滚时关闭 capability 并回滚产品接入提交。已存在的 canonical entries 保留在 Session 文件中，不执行破坏性迁移；普通聊天继续可用。

## Open Questions

- 当前 Proposal 默认每个 Session 同时只允许一个 active Task；并行 Task 与任务队列留给后续 Story。
- 公共 compaction trigger 在所有平台的确定性 contract test 由 A-02 已验证的 adapter harness 模拟；产品 E2E 只验证 replay 结果，不依赖私有强制压缩 API。
- 默认自动续跑上限在实现时以常量集中配置，并由测试固定；本 Proposal 不开放用户级预算设置界面。

## AGENTS.md 合规证明

- Web 仅承载组件和展示适配，不在 `packages/web/src/app/` 添加业务逻辑。
- Task 状态机、投影和协调逻辑位于 Core integration；Desktop 仅承载 Electron IPC/服务边界。
- Core 不依赖 Web、Desktop 或 service；Core 通过 adapter 公共 API 使用 Pi extension。
- 不引入数据库、后端框架、Redux、CSS Modules 或生成目录源码修改。
- 测试覆盖成功、失败、边界、持久化、跨进程与恢复，并在完成后创建自动化验证 goal。
