# Spec Delta

## Purpose

让用户在解决方案设计阶段把已确认的语义模型、协作拓扑、Agent/Skill 契约和验证策略发布为可审计、不可变且可被运行时精确读取的执行契约。

## ADDED Requirements

### Requirement: 发布前严格检查

系统 SHALL 在发布前校验方案确认状态、ontology 版本、拓扑、I/O、Agent/Skill 引用、verifier、权限、预算和 HITL 策略，并以可定位的 `DesignGap` 返回全部阻断项。

#### Scenario: 存在设计缺口

- **WHEN** 用户检查或发布包含断链、类型不兼容、缺失 verifier 或越权 Action 的方案
- **THEN** 系统 MUST 拒绝发布、不得生成 contract 文件，并返回关联节点或字段的中文缺口说明

### Requirement: 显式兼容与完整语义策略

系统 SHALL 默认只读取版本化 solution bundle；legacy 文件只有在调用方明确选择兼容读取时才能进入相同发布门控。执行契约 SHALL 记录对象概念的确认或歧义状态、确认证据，以及每个必需输入 FactType 的状态和新鲜度策略，不得补默认值。

#### Scenario: 未选择 legacy 兼容读取

- **WHEN** 精确版本只有 legacy 文件且调用方未明确选择 `legacy_compatibility`
- **THEN** 系统 MUST 返回 `LEGACY_COMPATIBILITY_SELECTION_REQUIRED` 且不得隐式解析或发布

#### Scenario: 概念仍有歧义或 Fact 策略缺失

- **WHEN** 对象 Concept 未确认、确认证据不可追溯，或必需 FactType 缺失状态/新鲜度策略
- **THEN** 系统 MUST 返回可定位 `DesignGap` 并拒绝发布

### Requirement: 不可变发布

系统 SHALL 只允许 confirmed solution version 发布，并为规范化内容生成稳定 `contractId` 与 `contractHash`；同一版本发布后 MUST 拒绝覆盖。

#### Scenario: 成功发布确认版本

- **WHEN** 用户发布通过全部门控的 confirmed solution version
- **THEN** 系统 SHALL 原子保存 approved execution contract，并返回 solution version、contractId 和 contractHash

#### Scenario: 重复覆盖已发布版本

- **WHEN** 用户使用不同内容再次发布相同 solution version
- **THEN** 系统 MUST 拒绝覆盖且原 contract 字节与 hash 保持不变

### Requirement: 精确读取与撤销

系统 SHALL 按 project、solutionId 和 solutionVersion 精确读取执行契约并校验 hash，不得隐式替换为 latest；撤销记录 MUST 保留契约正文且阻止新 Run 使用。

#### Scenario: 新版本发布后旧 Run 读取旧版本

- **WHEN** v2 已发布而运行时继续读取绑定的 v1
- **THEN** 系统 MUST 返回原 v1 契约且不得热更新为 v2

#### Scenario: 读取被篡改或已撤销契约

- **WHEN** 契约 hash 校验失败或存在撤销记录
- **THEN** 系统 MUST 拒绝新执行并返回结构化原因

### Requirement: 用户可见发布状态

系统 SHALL 在解决方案设计界面提供检查和发布操作，分类显示缺口，并在成功后以只读方式显示契约版本、ID、hash 与撤销状态。

#### Scenario: 发布成功后查看状态

- **WHEN** 用户完成发布
- **THEN** 界面 SHALL 显示已发布状态和精确契约标识，并提示修改设计需创建新 solution version

### Requirement: 唯一业务实现边界

Web 与 Desktop 入口 MUST 只解析输入、注入数据根和映射响应；编译、校验、并发与持久化逻辑 SHALL 由 Core 公共服务统一实现。

#### Scenario: Web 与桌面消费同一版本

- **WHEN** 两种入口检查或读取同一 solution version
- **THEN** 它们 MUST 返回等价的 contract、DesignGap 和错误语义，且不得产生第二份契约事实源
