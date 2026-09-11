## ADDED Requirements

### Requirement: 工作目录无关的边界判定

架构检查 MUST 基于仓库路径判定源文件与目标文件，SHALL 正确解析相对路径、包内 alias 和 workspace 公共导出。

#### Scenario: 根目录和包目录一致
- **WHEN** 分别从仓库根与 Web 目录检查服务模块导入一个存在的 UI 模块
- **THEN** 两次均报告相同的服务层反向依赖，不能漏报

#### Scenario: 类型导入和导出重定向
- **WHEN** 被禁止的目标通过 import type、export from 或字面量动态 import 引入
- **THEN** 与普通静态 import 一样报告边界违规

### Requirement: 现行依赖方向与合法路径

检查 SHALL 遵守 AGENTS.md 的当前 package 分层；MUST 识别 Core 到 Web/Desktop、基础设施到 features/modules、Web 服务状态到 UI/app、基础 UI 到业务组件、插件到 Web/Desktop 的违规。

#### Scenario: Core 反向依赖
- **WHEN** Core 模块通过相对路径引入真实 Web 组件
- **THEN** 报告对应包边界违规

#### Scenario: 合法公共 API
- **WHEN** Web app 调用 Core 公共 API，或 feature 调用 storage/shared
- **THEN** 不报告架构违规

#### Scenario: 合法 UI 组合
- **WHEN** 业务组件调用 ui 或 molecules 组件
- **THEN** 不报告架构违规；反方向导入业务组件则报告违规

### Requirement: 可信扫描与可运行验收

独立架构命令 SHALL 扫描约定的生产源码并输出诊断；真实违规或配置失败 MUST 返回非零。原 lint SHALL 保持既有非架构规则及兼容级别。自测 MUST 使用实际 ESLint 检查而非只比较配置。

#### Scenario: 存量违规
- **WHEN** 全量扫描发现既有违规
- **THEN** 输出真实文件、位置、原因并非零退出，记录为未解决基线，不自动豁免

#### Scenario: 配置错误或空扫描
- **WHEN** 解析器无法加载或扫描集合为空
- **THEN** 明确失败，不能报告通过

#### Scenario: 排除产物与测试
- **WHEN** node_modules、编译目录、运行数据或测试文件包含模拟越界代码
- **THEN** 生产扫描不把它们计入违规，但自测夹具仍被显式检查
