## ADDED Requirements

### Requirement: 基础设施仅依赖同层或下层契约

系统 SHALL 将业务组装放在共享业务层；基础设施 MUST 不通过直接、重导出、类型或动态导入引用 features/modules。通用聊天 UI MUST 不依赖业务 UI。

#### Scenario: 生产边界清零
- **WHEN** 对修复后的生产源码运行既有完整边界扫描
- **THEN** 当前 34 处违规全部消除，命令退出 0，无新增违规且没有放宽规则、缩小范围或添加白名单

#### Scenario: 围栏仍阻止违规
- **WHEN** 执行检查器既有允许及禁止导入自测
- **THEN** 两种工作目录下全部案例仍符合原预期，禁止导入仍被报告

### Requirement: Agent 业务能力完整组装

系统 SHALL 在普通 Agent、RoleAgent、Project Agent、协作和 worker 的实际启动入口组装所需业务能力，保持会话创建、消息流和恢复行为。必需依赖未提供时 MUST 明确报错。

#### Scenario: 启动与恢复
- **WHEN** 在 Web 或 Desktop 启动会话、保存后重新加载该会话
- **THEN** 会话标识、历史记录、认知钩子和可用工具保持原行为，无重复注册

#### Scenario: 组装依赖缺失
- **WHEN** 需要持久记忆或会话服务的入口缺少必需依赖
- **THEN** 返回明确错误，不以成功状态跳过持久化

### Requirement: 记忆所有权与存储兼容

系统 SHALL 保持用户、项目和 Agent 所有权隔离、临时会话边界、Frozen Snapshot、既有记忆解析及配置读取语义；MUST 不迁移或更改现存数据格式。

#### Scenario: 不同所有者并发
- **WHEN** 两个不同 owner 的 Agent 并发记录和整理记忆
- **THEN** 各自只写入授权目录，快照保持启动时内容，重启能恢复各自数据

#### Scenario: 所有权错配与临时会话
- **WHEN** 持久上下文的 owner 与 memory ownership 错配，或创建仅 session scope 的临时会话
- **THEN** 错配请求被拒绝，临时会话不被错误组装为持久 owner

#### Scenario: 旧数据与解析边界
- **WHEN** 加载已有 JSON/JSONL、Memory.md、空记忆或带元数据的记忆块
- **THEN** 字段、块内容、限制值、数据路径和现有失败处理与调整前一致

### Requirement: 业务工具与跨进程兼容

系统 SHALL 保持文档、本体、定时任务等工具的名称、schema、scope 和授权语义，且开发与打包后的 worker 都可加载；IPC DTO 字段 MUST 保持兼容。

#### Scenario: 重复初始化与授权
- **WHEN** 多次初始化工具并使用不同 scope 查询工具或执行未授权调用
- **THEN** 工具不重复注册，可见工具集合与既有行为一致，未授权操作仍被拒绝

#### Scenario: 打包后执行
- **WHEN** 从桌面构建产物启动 worker 并调用代表性业务工具
- **THEN** 业务模块可解析且工具返回符合原协议的结果，主进程能正确处理响应

### Requirement: 通用聊天展示兼容

系统 SHALL 通过通用 UI 目录共享工具执行状态组件，并保持其输入契约和展示。

#### Scenario: 工具状态展示
- **WHEN** 聊天中存在运行中、完成或失败的工具执行记录
- **THEN** 通用聊天列表和 Agent 对话均显示正确状态及原有状态、名称与运行提示展示，空列表无异常
