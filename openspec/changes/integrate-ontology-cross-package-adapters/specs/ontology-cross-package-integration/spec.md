# Spec Delta

## Purpose

为 OriginOS 的 Web、Desktop 与多 Agent 运行链路提供一致的 ontology 调用和验收契约，确保各平台通过同一公共业务边界消费 canonical schema、facts/actions、执行契约与 context projection，并可在中断后安全恢复。

## ADDED Requirements

### Requirement: Web 与 Desktop 必须共享业务语义
系统 SHALL 通过同一 core 公共业务边界处理 Web API 与 Desktop IPC 请求；两个 transport 对等价输入 MUST 返回等价的成功数据、revision、回执和结构化错误，边界层不得复制 ontology 转换、校验、Action Gate 或恢复规则。

#### Scenario: 两种 transport 查询同一项目
- **WHEN** Web API 与 Desktop IPC 使用相同项目、ontology ID/version 和查询条件读取 facts
- **THEN** 两者返回相同的事实引用、revision 和分页语义

#### Scenario: 两种 transport 提交同一非法请求
- **WHEN** Web API 与 Desktop IPC 提交相同的旧 ontology version 或越权 Action
- **THEN** 两者返回相同的稳定错误 code 和字段定位，且不写入 intent、fact 或运行状态

### Requirement: 所有副作用必须绑定精确上下文
任何可写请求 MUST 在副作用前校验 project、ontology ID/version、contract ID/hash、task、session、branch、run、work item、attempt、lease epoch、request/operation ID、expected revision 和精确权限集合中适用于该操作的字段；缺失、过期或不一致 MUST fail closed。

#### Scenario: 旧执行者迟到提交
- **WHEN** 已重分配 work item 后，旧 attempt 或旧 lease epoch 通过任一 transport 提交结果
- **THEN** 系统拒绝提交、保留可审计拒绝信息，且不覆盖当前 attempt 的事实、Evidence 或投影

#### Scenario: 执行期间发布新契约
- **WHEN** 绑定 v1 契约的 run 仍在执行而 v2 已发布
- **THEN** 原 run 继续使用精确 v1 ontology/contract 引用，不隐式切换到 latest

### Requirement: 各事实源必须保持单一所有权
集成层 SHALL 将 ontology/facts/actions、方案契约、Task/Evidence、Run/WorkItem 和查询投影分别委托给其既有事实源；投影、缓存、HTTP 响应和 IPC payload MUST NOT 成为第二写入事实源，也不得直接修改底层 JSON/JSONL 或私有 session entries。

#### Scenario: 投影被删除
- **WHEN** 可重建的项目任务索引或 context projection 被删除后重新加载项目
- **THEN** 系统从权威契约、Task/Run ledger 与 ontology 引用重建投影，不重做已接纳 Action

#### Scenario: WorkItem 完成但 Evidence 不足
- **WHEN** 所有 WorkItem 自报完成但 Task Criterion 缺少合格 Evidence
- **THEN** 用户 Task 保持未完成，且集成层不得写入替代完成状态

### Requirement: 操作必须支持幂等对账与中断恢复
系统 MUST 使用持久化 request/operation ID、revision、cursor、attempt 和 lease epoch 对账；相同请求重试 SHALL 恢复原回执，不同内容复用 ID MUST 被拒绝。恢复 MUST 只补登记缺失的接纳或 Evidence，不得重复不可逆副作用。

#### Scenario: Action 接纳后 Evidence 前退出
- **WHEN** 进程在 ontology Action 已 accepted、Task Evidence 尚未登记时退出并重启
- **THEN** 系统识别既有 operation receipt，只补交缺失 Evidence，不再次执行 Action

#### Scenario: 外部副作用结果未知
- **WHEN** 外部操作已发出但没有可查询或幂等回执
- **THEN** 系统标记为待人工核对，不自动重发且不把任务判定为完成

### Requirement: 结构化错误不得泄露敏感内容
所有 transport SHALL 将业务拒绝、冲突、不可用和内部故障映射为稳定错误类别，保留可操作的引用与重试提示；响应和日志 MUST NOT 暴露其他项目正文、凭据、绝对路径、完整 prompt、附件字节或私有工具输出。

#### Scenario: 跨项目请求
- **WHEN** 调用方请求无权限项目的 ontology、Task 或 Run 引用
- **THEN** 系统在读取正文前拒绝，并返回不泄露目标是否存在的授权错误

#### Scenario: 前置能力不可用
- **WHEN** P2.8、9.42、9.43 或受控 Task adapter 的必需公共能力缺失或版本不兼容
- **THEN** 系统返回结构化 unavailable 并禁用对应正式入口，不使用 mock、legacy 私有读取或动态生成 Workflow 降级

### Requirement: 端到端验收必须使用真实持久化边界
ONT8-T1 的完成证据 MUST 覆盖访谈来源、方案发布、精确版本启动、多 Agent 执行、Verifier/Evidence、任务看板、并发控制和中断恢复；测试 MUST 使用临时项目中的真实文件持久化与实际公共 adapter，不得用内存 mock success 替代提交或恢复结果。

#### Scenario: 完整成功链路
- **WHEN** 已确认访谈生成 canonical ontology，完整方案发布后从 Web 或 Desktop 启动正式任务并通过 verifier
- **THEN** Task、Run、WorkItem、fact、decision、artifact 和 Evidence 可追溯到相同 ontology version、contract hash 与来源，且看板和协同图显示同一 revision

#### Scenario: 关键提交点故障注入
- **WHEN** 分别在 intent 后、Action 后、接纳后、Evidence 前后强制结束进程并恢复
- **THEN** 每个场景均可核对恢复，无重复 fact、Action、Evidence 或幽灵完成

#### Scenario: 旧项目兼容
- **WHEN** 未显式迁移的旧项目继续使用原有只读或 legacy 路径
- **THEN** 既有读取行为不被破坏，系统不在启动或读取时静默写入 canonical 数据

### Requirement: 支持平台必须通过等价验收
Desktop development、Windows x64、macOS x64 与 macOS arm64 的受支持构建 SHALL 能解析相同公共模块和 IPC contract；Web 与各 Desktop 平台 MUST 通过相同的契约夹具，并记录平台特有的进程退出与恢复证据。

#### Scenario: 支持平台恢复
- **WHEN** 在任一受支持 Desktop 平台关闭窗口或结束应用后重新打开原项目任务
- **THEN** 系统恢复相同 Task/Run 绑定与待处理审批，暂停任务不自动续跑，已取消任务不复活

#### Scenario: 打包模块缺失
- **WHEN** 打包产物无法解析公共 ONT 服务、preload channel 或运行时 adapter
- **THEN** 平台 smoke test 失败并阻止 ONT8-T1 验收，不把开发态通过视为平台通过

