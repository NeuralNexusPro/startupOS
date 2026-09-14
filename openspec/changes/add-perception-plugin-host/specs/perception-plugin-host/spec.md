# Perception Plugin Host

## ADDED Requirements

### Requirement: 版本化可信插件
系统 MUST 只装载 catalog 中与 Host API 兼容且 manifest/schema 合法的 bundled plugin。

#### Scenario: 非法插件隔离
- **WHEN** 一个插件版本不兼容或清单非法
- **THEN** Host SHALL 拒绝该插件且其他插件继续运行

### Requirement: 最小权限运行上下文
系统 MUST 仅向插件提供已声明并获批的宿主 Ports，且 MUST 校验插件提交的事件。

#### Scenario: 插件越权
- **WHEN** 插件访问未授权凭据或提交非法事件
- **THEN** Host SHALL 拒绝操作并记录脱敏审计

### Requirement: 声明式配置
感知中心 SHALL 根据受控 schema 渲染配置，并 MUST 禁止插件注入任意 UI 代码。

#### Scenario: 配置 Secret
- **WHEN** 用户填写插件敏感字段
- **THEN** Secret SHALL 仅经 Desktop IPC 进入安全存储且永不回显

### Requirement: 兼容迁移
系统 MUST 幂等迁移既有四渠道配置并保持运行关联。

#### Scenario: 迁移旧连接
- **WHEN** Host 首次读取无 pluginId 的 Connector
- **THEN** 系统 SHALL 映射 bundled plugin 且保持 ID、source、enabled、cursor、rule 和 secretRef
