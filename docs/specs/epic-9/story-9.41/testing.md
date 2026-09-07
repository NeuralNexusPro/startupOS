# 测试文档 - Story 9.41

**Story:** Agent/RoleAgent 任务入口与 pi-tasks 直接执行
**版本:** 2.1
**最后更新:** 2026-07-29

## 测试目标

验证 Agent/RoleAgent 可以在当前 Session 规划和执行 `pi-tasks` 正式任务，chat/task completion policy 严格互斥，Evidence 可验证，应用重启和并发竞态不会造成重复 Task、重复续跑或无声失败。

## 优先级

- **P0:** completion policy隔离、唯一Task、Evidence gate、取消/暂停、恢复一致性和可见错误。
- **P1:** waiting_user、预算/no-progress、UI状态、普通聊天回归和打包加载。
- **P2:** 性能、可访问性和诊断体验。

退出标准中的P0/P1以本文件每个TC标注为准。

## 测试策略

| 层级 | 范围 |
|------|------|
| 契约测试 | A-01公开task tool调用、state event、branch replay、schema兼容 |
| 单元测试 | adapter、projection、lease、policy、续跑、Evidence、预算、幂等 |
| 集成测试 | 当前Session Task、Pi events、取消、waiting_user、恢复、错误投递 |
| UI测试 | 草稿、planning、Task卡片、Step/Evidence/Blocker、输入路由 |
| E2E/脚本 | Agent与RoleAgent正式任务全流程 |
| 打包回归 | Windows/macOS中`pi-tasks`及其依赖加载、状态恢复 |

核心状态、policy路由和continuation分支覆盖率不低于80%，关键IPC/Session集成点100%覆盖。

## 测试基础设施

必须提供：

- 固定`PiTaskContractSnapshot` fixtures：planning、running、verifying、blocked、completed、cancelled。
- 固定Evidence fixtures：valid、missing artifact、hash mismatch、wrong task、stale revision、not_verified、duplicate。
- Fake task command gateway，记录toolName、args、scope、revision和requestId。
- 可重放Pi state event harness，支持乱序、重复、迟到和branch切换。
- 持久Session/lease临时目录，支持指定写入阶段模拟进程崩溃。
- deferred promise/barrier，用于确定性控制并发交错。
- Chat Guard和Task Runtime spy，记录每次prompt/continue的实际调用路径。
- 可控clock、token budget和continuation queue。

## 契约测试

### TC-C1 A-01公开命令边界（P0）

- 在相同Pi Session/branch执行`task_plan`、`task_update`、`task_evidence`、`task_resume`和`task_complete`。
- 每次调用通过公开extension/tool execution context和schema validation。
- Mutation后收到匹配taskId和递增revision的state event。
- 测试扫描依赖，禁止导入`pi-tasks`私有reducer/store或解析Session文件。

### TC-C2 branch replay与compaction（P0）

- 从current branch custom entries重放相同Task。
- compaction前后Task、Step、Criterion、Evidence和Blocker一致。
- 不同branch的Task状态不互相污染。
- active Task期间产品branch切换命令被拒绝。

### TC-C3版本与打包（P1）

- 版本不兼容时返回结构化错误并禁用任务入口。
- Windows/macOS打包态能加载扩展、依赖和state event。
- 缺失模块时普通聊天仍可运行，前台显示Task Runtime不可用。

## 单元测试

### TC-U1 草稿（P1）

- 点击入口只创建renderer草稿。
- 不调用Task、模型或Session API。
- 输入框原内容保持不变。
- 重复点击定位相同DOM草稿。
- 空标题、空目标和超长输入显示校验。

### TC-U2 Planning reservation与提交幂等（P0）

- 相同requestId重复提交只创建一个reservation和taskId。
- 不同requestId并发提交只有一个CAS成功。
- planning失败且未创建Task时释放lease并保留草稿。
- state event已到达但绑定taskId前崩溃，恢复后绑定原Task。

### TC-U3 Lease状态机（P0）

- chat -> task_planning -> task_running顺序合法。
- waiting_user、paused、recovering保持task_runtime。
- completed/cancelled -> chat。
- failed保留canonical Task诊断，不伪造completed。
- 旧modeEpoch、错误branch和错误expectedRevision命令被拒绝。

### TC-U4 completion policy入口互斥（P0）

对`prompt()`和`continue()`分别断言：

- chat模式：Chat Guard调用1次，Task Runtime调用0次。
- task_planning/running：Chat Guard调用0次，Task Runtime调用1次。
- 模式切换窗口、reload校准和terminal边界仍满足互斥。
- 同一turn不允许fallback到另一个policy。

### TC-U5 下一动作决策矩阵（P0）

- 有Step -> execute_step。
- 无Step但Evidence缺失/无效 -> verify_evidence。
- 有Blocker -> wait_for_user。
- 全部门控通过 -> attempt_complete。
- 用户停止/预算/usage limit -> pause。
- 不可恢复错误 -> fail并投递可见错误。

### TC-U6 Continuation exactly-once（P0）

- continuation携带scope、taskId、revision、modeEpoch和nonce。
- queued continuation存在时不重复派发。
- 用户消息到达后旧nonce失效。
- 重复settled event只派发一次。
- reload后dispatched/consumed nonce不重复执行。

### TC-U7 No-progress与预算（P1）

- 只比较canonical revision和有效Step/Evidence/Blocker变化。
- assistant text delta不参与判断。
- 连续达到阈值后进入paused并输出可见原因。
- 自动turn、elapsed time、token和usage limit分别分类。

### TC-U8 EvidenceVerifier（P0）

逐项断言：

- 有效测试退出码和结果hash通过。
- 文件存在且SHA-256匹配通过。
- 缺失文件、hash mismatch、越界路径拒绝。
- wrong task、stale revision、not_verified拒绝。
- 仅模型自报Evidence不能满足关键Criterion。
- 相同evidenceId重复登记只产生一条Evidence。
- 用户确认必须绑定当前session/task/criterion。

### TC-U9 task_complete门控（P0）

- pending Step拒绝完成。
- Step完成但Criterion无Evidence拒绝。
- Evidence存在但验证失败拒绝。
- 有未解决Blocker拒绝。
- 所有门控通过后只完成一次。
- 不存在force参数、UI命令或内部绕过。

### TC-U10 canonical与execution状态映射（P1）

- planning/queued/running/verifying/waiting_user/paused/recovering/failed映射正确。
- execution failed不改写canonical completed/cancelled。
- terminal canonical状态忽略迟到running事件。

### TC-U11 投影边界（P1）

- Evidence摘要包含必需字段，不包含大型正文。
- 列表和字符串按上限裁剪。
- payload不超过64KB。
- renderer按branchId + modeEpoch + revision去重。

### TC-U12 可见错误去重（P0）

- 错误同时进入Task projection和当前Session可见消息。
- 相同errorId只显示一次。
- stream关闭时走持久系统消息fallback。
- 错误正文脱敏，不包含凭据、完整prompt或工具大输出。

## 确定性并发与崩溃测试

### TC-R1 双提交竞态（P0）

使用barrier让两个提交同时通过前置校验：

- 只有一个planning reservation CAS成功。
- 只调用一次`task_plan`。
- 两个调用方获得相同taskId或明确conflict。
- 不产生孤儿Task。

### TC-R2 用户消息与continuation竞态（P0）

- continuation完成CAS但尚未入队时注入用户消息。
- 用户消息递增epoch/revision或使nonce失效。
- continuation最终不执行。
- 用户消息由Task Runtime处理，Chat Guard调用0次。

### TC-R3 取消与工具完成竞态（P0）

- 工具完成state event和取消命令同时到达。
- 取消成功后迟到Evidence/Step事件不恢复running。
- abort和cancel mutation各最多执行一次。

### TC-R4 重复/乱序事件（P0）

- 重复settled、重复state event不重复续跑。
- 新revision后到达旧revision被忽略。
- 新epoch后到达旧epoch，即使revision更高也被隔离并记录诊断。

### TC-R5 创建崩溃窗口（P0）

分别在以下位置模拟退出：

1. reservation落盘后、planning prompt前。
2. `task_plan`调用后、state event前。
3. state event后、taskId绑定前。
4. taskId绑定后、首次执行前。

恢复后断言最多一个Task、一个lease和一个首次continuation。

### TC-R6 Continuation崩溃窗口（P0）

分别在nonce落盘、入队、消费前后模拟退出，断言恢复后continuation最多执行一次且不会丢失可恢复状态。

## 集成测试

### TC-I1 Agent当前Session Task（P0）

1. 打开普通Agent当前Session。
2. 提交目标草稿。
3. 断言先进入planning并由当前Agent调用`task_plan`。
4. 断言只创建一个正式Task且含steps/criteria。
5. 断言未创建新Session。
6. 断言assistant/tool消息继续进入原Session。

### TC-I2 RoleAgent当前Session Task（P0）

- 复用RoleAgent身份、七层Prompt、工具权限、Pi branch和agentBaseDir。
- 不按Agent名称硬编码。
- Task结果写入正确工作目录。

### TC-I3 计划型stop（P0）

- 模型只回复“我将先读取资料并生成报告”并stop。
- Task仍有pending Step。
- Task Runtime继续当前Session。
- Chat Guard语义judge和recovery均未调用。

### TC-I4 无pending Step但Evidence不足（P0）

- 所有Step标记完成，但Criterion缺Evidence。
- 下一动作是verification，不是停止或attempt_complete成功。
- Evidence补齐后才允许完成。

### TC-I5 工具失败后继续（P1）

- 当前Step首次工具调用失败。
- Agent获得失败结果并尝试替代方法。
- 任务不无声结束。
- 恢复耗尽时前台显示失败工具摘要、原因和可恢复动作。

### TC-I6 Evidence Gate（P0）

- 创建含两个Step和两个Criterion的Task。
- 依次注入有效与无效Evidence fixtures。
- `task_complete`返回结构化rejection reasons。
- 全部Criterion有当前revision合格Evidence后Task完成。

### TC-I7 waiting_user（P0）

- Agent登记Blocker并停止自动续跑。
- 卡片显示具体问题。
- 用户通过原输入框答复并携带taskId/blockerId。
- Blocker解决state event到达后调用`task_resume`。
- 全程Chat Guard调用0次。

### TC-I8 停止、继续与取消（P0）

- 停止：abort、撤销continuation、进入paused并可继续。
- 继续：恢复相同Task和revision链。
- 取消：abort并标记canonical cancelled，不可继续。
- 三种命令对迟到事件均安全。

### TC-I9 预算和provider错误（P1）

- 自动轮数、时间或token预算到达后paused。
- provider transient error有限重试。
- provider usage limit映射为明确暂停原因。
- 不出现无限自动续跑。

### TC-I10 reload/resume（P0）

- 执行中重启应用。
- 恢复相同originSessionId、piSessionRef、branchId、Task和lease。
- 先显示recovering并完成reconciliation。
- 不重复创建Step、Evidence或continuation。
- pending用户消息优先于自动恢复。

### TC-I11 恢复异常（P0）

- 状态文件损坏、Pi branch缺失、Task ownership错误和版本不兼容分别测试。
- 不创建替代Task，不盲目续跑。
- Task卡片和Session消息均显示分类错误。

### TC-I12 普通聊天回归（P0）

- 无active Task时普通消息不创建/加载Task。
- 现有Chat Completion Guard仍按原逻辑处理聊天stop。
- Task完成/取消后新普通消息重新走chat_guard。

### TC-I13 不存在Workflow（P1）

- 草稿和Task命令不接受strategy/workflow字段。
- 运行中不创建CollaborationRun、Worker、DAG或子Session。
- `pi-tasks` Step只由当前Agent直接执行。

### TC-I14 前台错误投递（P0）

- runtime缺失、planning失败、工具恢复耗尽、Evidence拒绝和恢复失败各产生一次可见消息。
- 同时更新Task卡片。
- reload后错误仍可见。

### TC-I15 branch限制（P1）

- active Task期间fork/tree切换被拒绝并显示原因。
- Task完成或取消后branch操作恢复可用。

## UI测试

### TC-UI1 草稿卡片（P1）

- 标题、目标、上下文、提交和取消可键盘操作。
- 空值和超长输入显示原地校验。
- 提交失败后字段、焦点和DOM key保持。
- 输入框原文本保持不变。
- Agent和RoleAgent容器复用同一入口组件。

### TC-UI2 Planning原位切换（P1）

- 提交后同一UI item进入planning。
- state event后原位绑定taskId，不追加重复卡片。
- 双击提交只显示一个planning/Task项。
- planning失败恢复为可编辑草稿。

### TC-UI3 Task状态（P1）

- 展示Step、Criterion、Evidence、Blocker、canonical和execution状态。
- waiting_user原输入框显示答复上下文。
- 停止与取消任务是不同按钮和确认语义。
- 不显示force completion、Workflow或多Agent控件。

### TC-UI4 前台错误（P0）

- Task Runtime不可用、创建失败、no-progress、预算耗尽和恢复失败均可见。
- 错误包含可执行动作并只显示一次。
- 不允许只在后台日志出现错误而前台停止。

### TC-UI5 可访问性（P2）

- 焦点顺序、键盘操作、aria-label和aria-live正确。
- 状态不只靠颜色表达。
- 小窗体和长文本不溢出。

### TC-UI6 性能（P2）

测试条件：

- 10分钟运行、至少500个Task state event、50条长消息。
- projection事件以100ms-250ms节流。
- 单次payload不超过64KB。
- Task卡片不因token delta整体重渲染。
- Electron main event-loop p95 lag不超过50ms。
- renderer输入和停止按钮交互p95不超过100ms。

## E2E场景

### TC-E2E1 Agent完整成功路径（P0）

草稿 -> planning -> steps执行 -> Evidence验证 -> `task_complete` -> 返回chat。

### TC-E2E2 RoleAgent waiting_user路径（P0）

草稿 -> planning -> blocked -> 原输入框答复 -> resume -> Evidence验证 -> completed。

### TC-E2E3 暂停和重启恢复（P0）

running -> 用户停止 -> paused -> 应用重启 -> recovering -> 用户继续 -> completed。

### TC-E2E4 取消路径（P1）

running -> 取消确认 -> cancelled -> 迟到事件被忽略 -> 可创建新Task。

## 验收标准映射

| AC | 主要TC |
|----|--------|
| AC1 | U1, UI1 |
| AC2 | U2, R1, R5, I1, I2 |
| AC3 | U4, R2, I3, I7, I12 |
| AC4 | U5, U8, U9, I4, I6 |
| AC5 | U9, I6, E2E1 |
| AC6 | I7, E2E2 |
| AC7 | R3, I8, I9, E2E3, E2E4 |
| AC8 | R5, R6, I10, I11 |
| AC9 | I12 |
| AC10 | C1, C2, C3 |

## 回归测试

必须运行：

- Pi Agent core、AgentManager、SessionStore和消息流测试。
- Chat Completion Guard现有测试。
- Agent/RoleAgent launcher、七层Prompt和工作目录测试。
- 统一流式渲染和错误消息投递测试。
- Desktop IPC与Web store测试。
- Windows/macOS package module smoke。

基础命令：

```bash
pnpm lint
pnpm --filter @originos/core test
pnpm --filter @originos/web test
pnpm --filter @originos/desktop test
```

根据package实际脚本跳过不存在的命令时，验证Goal必须记录原因和替代命令。

## 自动化测试验证Goal

实施完成后必须创建：

```text
目标：通过Story 9.41 testing.md中定义的P0/P1测试用例，验证Agent/RoleAgent当前Session的pi-tasks任务入口、公开集成边界、Evidence门控、completion policy互斥、受控续跑、暂停/取消、并发幂等和重启恢复符合验收标准。
```

Goal输出必须包含：

- 每个AC/TC的测试Evidence。
- 执行命令和结果摘要。
- 失败测试及修复后的重跑结果。
- 无法自动化的项目及原因。
- 人工验证步骤。
- 剩余风险。

## 退出标准

- A-02 受控公共边界通过，并有 ADR-010、契约与集成 Evidence。
- 所有P0/P1用例通过。
- 同一turn只有一种completion policy。
- 无Evidence gate或force completion绕过路径。
- 并发/崩溃测试证明唯一Task、唯一lease和continuation最多一次。
- reload恢复相同Pi branch和Task。
- 任务运行不创建Workflow、多Agent或新Session。
- 普通聊天回归通过。
- lint、核心测试和Windows/macOS打包模块smoke通过。

## 变更历史

| 日期 | 变更 |
|------|------|
| 2026-07-28 | 创建初版 |
| 2026-07-28 | 改写为 `pi-tasks` 当前Session直接任务测试 |
| 2026-07-28 | Workflow和多Agent测试迁移到Story 9.42 |
| 2026-07-29 | 增加A-01契约、Evidence负向、policy入口、确定性竞态、崩溃窗口和量化性能测试 |
| 2026-08-01 | A-02 公共边界回归通过，更新 verification goal 前置证据 |
