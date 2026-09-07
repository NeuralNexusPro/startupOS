## ADDED Requirements

### Requirement: 锁定 runtime 兼容性
OriginOS MUST 使用已提交的精确 Pi Runtime、`pi-tasks` 版本及其完整依赖图验证 Story 9.41。已提交的 Pi Runtime 前置依赖缺失、相对获批基线已废弃，或与选定 `pi-tasks` release 不兼容时，门禁 MUST 失败。

#### Scenario: 兼容版本可以重现
- **WHEN** A-01 compatibility suite 从 clean checkout 运行
- **THEN** 它从 lockfile 解析出获批的精确 Pi Runtime 和 `pi-tasks` 版本，并生成相同的 public export 和 dependency inventory

#### Scenario: Runtime 前置依赖缺失
- **WHEN** Proposal branch 不包含获批的 Pi Runtime upgrade
- **THEN** 门禁返回前置依赖错误，且不安装或替换无关 runtime version

#### Scenario: 拒绝未知兼容组合
- **WHEN** runtime 或 extension version 与获批 compatibility matrix 不同
- **THEN** Task Runtime integration 保持禁用，直到针对该版本组合重新执行 A-01

### Requirement: 受支持的 Task mutation 边界
OriginOS MUST 仅通过有文档记录的公共 command boundary 修改 `pi-tasks` state，并保持 Pi Session identity、current branch identity、tool schema validation、permission 和 custom entry semantics。

#### Scenario: 宿主调用已注册 task tool
- **WHEN** contract harness 通过获批公共边界，在隔离的 Pi Session 和 branch 中调用 `task_plan`
- **THEN** 调用使用已注册 tool schema 和 permission path，且只向该 Session 和 branch 写入 state

#### Scenario: 拒绝无效 tool arguments
- **WHEN** 宿主使用违反公共 schema 的 arguments 调用 task tool
- **THEN** 调用返回结构化 validation failure，且不创建 Task state revision

#### Scenario: 不存在受支持的公共 mutation 边界
- **WHEN** 公共 host tool invocation 和公共 `pi-tasks` command API 都无法保持所需 execution context
- **THEN** A-01 失败并停止产品实施，直到上游 API 或受控 fork 获得明确批准

#### Scenario: 检测到私有 state access
- **WHEN** source 或 dependency check 发现导入私有 `pi-tasks` reducer/store、解析 Pi Session file 或伪造 custom entry
- **THEN** 无论功能测试结果如何，strict validation 都必须失败

### Requirement: Mutation 与公共 state event 关联
每次成功的 task mutation MUST 由相同 Session、branch 和 Task 的公共 `pi-tasks` state event 确认，并携带单调递增的 revision。没有匹配 event 的 tool result MUST NOT 被视为已提交 state。

#### Scenario: Mutation 产生匹配 snapshot
- **WHEN** 当前 Task 的 `task_update` 成功
- **THEN** harness 观察到 Session、branch 和 Task 均匹配的公共 state event，且 revision 大于 mutation 前的 revision

#### Scenario: State event 缺失
- **WHEN** task tool 返回成功，但在有界 timeout 内没有匹配 state event
- **THEN** mutation 被分类为未确认，门禁失败

#### Scenario: Revision 回退
- **WHEN** active scope 收到早于最新已接受 revision 的 state event
- **THEN** 该 event 不得推进 state，并记录 contract violation

### Requirement: Evidence gate 完成契约
获批边界 MUST 保持 `pi-tasks` completion semantics，使未完成 Step、缺失或无效的 Criterion Evidence、未解决 Blocker 阻止任务完成。OriginOS MUST NOT 暴露或验证 force-completion path。

#### Scenario: 缺少 Evidence 时拒绝完成
- **WHEN** required Criterion 缺少有效 Evidence 时调用 `task_complete`
- **THEN** 公共 tool 使用结构化原因拒绝完成，Task 保持非终态

#### Scenario: Evidence 完整后成功完成
- **WHEN** 所有 required Steps 已完成、所有 Criteria 都有 accepted Evidence，且不存在未解决 Blocker
- **THEN** `task_complete` 只执行一次到公共 completed state 的转换

#### Scenario: 请求强制完成
- **WHEN** caller 尝试传入未公开 force flag 或绕过已注册 completion tool
- **THEN** command 被拒绝，且不写入 completed state

### Requirement: Current-branch replay 与隔离
Integration MUST 通过公共 current-branch replay 重建 canonical Task state，并 MUST 保持 branch isolation。Process-local cache MUST NOT 被视为 canonical。

#### Scenario: 重启后 replay state
- **WHEN** harness process 在 task mutation 后退出，并针对相同 Pi Session 和 branch 重启
- **THEN** replay 在不依赖 cache 的情况下重建相同 Task、Steps、Criteria、Evidence、Blockers、status 和 latest revision

#### Scenario: Branch 发生分叉
- **WHEN** Pi Session 创建两个 branches，且只有其中一个 branch 修改 Task
- **THEN** 另一个 branch 的 replay 不包含该 mutation

#### Scenario: 尝试修改错误 branch
- **WHEN** command scope 与 Task current branch 不匹配
- **THEN** command 被公共 runtime 拒绝或隔离，且不能修改原 branch state

### Requirement: Compaction 保持状态
锁定的 Pi Runtime 和 `pi-tasks` 组合 MUST 在受支持的公共 compaction lifecycle 中保持 canonical Task contract。

#### Scenario: Task 在 compaction 后保持一致
- **WHEN** 包含非终态 Task 的 Session 通过受支持 lifecycle 完成 compaction 并 replay
- **THEN** Task identity、Step state、Criteria、Evidence、Blockers、status、branch identity 和 revision continuity 保持等价

#### Scenario: 无法重现 compaction 行为
- **WHEN** 不存在受支持的确定性 lifecycle 来证明 Task preservation
- **THEN** A-01 保持失败，并在 ADR 中记录该限制

### Requirement: Electron 模块加载
选定 dependency graph MUST 在 Electron 开发态以及 Windows/macOS packaged application 中通过受支持 exports 加载。验证 MUST 覆盖 CJS/ESM resolution、transitive runtime dependencies 和 ASAR placement。

#### Scenario: 开发态加载 Task packages
- **WHEN** Electron development main process 加载获批 public runtime 和 task extension exports
- **THEN** 所有 runtime imports 正常解析，不使用 private path，不产生影响执行的 dynamic dependency warning，也不存在 missing module

#### Scenario: Windows package 解析依赖
- **WHEN** Windows package verification script 检查并 smoke-load packaged application
- **THEN** Pi Runtime、`pi-tasks` 和所有 required transitive runtime dependency 都能从 packaged layout 解析

#### Scenario: macOS package 解析依赖
- **WHEN** macOS package verification job 检查并 smoke-load 两种受支持 architecture
- **THEN** Pi Runtime、`pi-tasks` 和所有 required transitive runtime dependency 都能从 packaged layout 解析

#### Scenario: Packaged module 缺失
- **WHEN** package 中缺少 required export 或 transitive module
- **THEN** A-01 失败，并明确指出 module、platform、architecture 和 resolution path

### Requirement: 有界且安全的契约诊断
Contract harness MUST 使用有界等待和有界脱敏诊断。执行结束后 MUST 清理 subscription 和临时 Session，并且 MUST NOT 记录 credential、prompt、task content、user home path 或完整 tool output。

#### Scenario: Event wait 超时
- **WHEN** required public event 未在配置 timeout 内到达
- **THEN** harness 终止等待、移除 subscription、报告脱敏 timeout，并以非零状态退出

#### Scenario: 发布诊断证据
- **WHEN** contract 或 packaging check 完成
- **THEN** report 在配置大小限制内包含 version、capability、platform、result、revision metadata 和 hash，且不包含敏感内容

### Requirement: 显式门禁决策
A-01 MUST 产生 ADR，记录选定 public command boundary、精确 compatibility matrix、evidence links、limitations、migration policy、rollback policy 和 ownership。Story 9.41 产品实施 MUST NOT 在 strict validation 通过且 Proposal 获得显式批准前开始。

#### Scenario: 门禁通过
- **WHEN** 所有强制 contract、replay、compaction 和 platform checks 通过，且 ADR 选择了可维护边界
- **THEN** A-01 被标记为通过，后续 Story 9.41 Proposal 可以依赖该边界

#### Scenario: 门禁失败
- **WHEN** 任一 P0 contract 失败，或 ADR 无法选择可维护公共边界
- **THEN** A-01 被标记为失败，候选 dependency 可以回滚，且后续产品实施保持 blocked
