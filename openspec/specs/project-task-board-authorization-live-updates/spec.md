# project-task-board-authorization-live-updates Specification

## Purpose
定义项目任务在授权边界内查询、控制和订阅的统一规则，并以同一权威事件源实时更新已加载投影，在缺口恢复、权限撤销和组件切换时保护用户输入与监听器生命周期。

## Requirements

### Requirement: 授权先于数据读取

系统 SHALL 在读取 Task、Run、WorkItem、ontology 引用或正文前，按 actorId、projectId 和 capability 调用 Core 授权端口；拒绝响应 MUST NOT 暴露资源是否存在。

#### Scenario: 未授权项目列表

- **WHEN** actor 请求无权访问的 projectId
- **THEN** 系统 MUST 返回固定 authorization error，且 Task/session/Run 存储读取次数为零

### Requirement: 项目范围实时订阅

系统 SHALL 复用 Task Runtime 与 collaboration 的公开事件源，发布 project-scoped、带 host instance、sequence、taskId 和 revision 的摘要事件。

#### Scenario: 已加载任务更新

- **WHEN** 当前项目某已加载 Task 获得更高 revision
- **THEN** 客户端 MUST 读取并合并该权威投影，不改变筛选、草稿、选择或焦点

### Requirement: 缺口恢复

消费者 SHALL 在 sequence gap、host instance 变化或事件 revision 冲突时重新读取权威页和当前详情，不自行补写状态。

#### Scenario: 丢失一个事件

- **WHEN** 客户端收到的 sequence 不连续
- **THEN** 系统 MUST 标记同步中并重读快照，完成前不得将推测状态显示为权威状态

### Requirement: 订阅生命周期清理

项目切换、组件卸载、窗口销毁和权限撤销 SHALL 释放对应监听器；系统 MUST NOT 在卸载后更新 UI。

#### Scenario: 切换项目

- **WHEN** 用户从项目 A 切换到项目 B
- **THEN** A 的 listener MUST 被释放，后续 A 事件不得进入 B 的页面状态
