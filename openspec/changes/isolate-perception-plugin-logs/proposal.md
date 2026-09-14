# 感知插件独立日志与渠道错误诊断

- epic-id: SENSE
- story-id: SENSE.12
- task-id: SENSE12-T7
- owner: OriginOS Team
- 来源：[Story SENSE.12](../../../../docs/specs/epic-SENSE/story-SENSE.12/README.md)
- 状态：已获用户批准（2026-09-14“继续”），本地实施及测试完成，未发布远端

## Why

企微、飞书等插件的SDK日志混在桌面日志，且渠道执行异常被转换为CHANNEL_RUNTIME_FAILED后丢失原因。用户要求插件包日志与现有日志独立记录，以便定位聊天、连接与投递失败。

## What Changes

- 邮箱、企微、飞书、钉钉按插件独立每日文件：应用日志目录/plugins/{插件名}/plugin-YYYY-MM-DD.log。
- Plugin SDK提供宿主绑定范围的日志端口；插件、SDK及宿主的插件诊断写入此出口，不经全局console重复进入desktop/llm。
- 记录生命周期、连接、事件接纳、执行及回复失败；关联pluginId、connectorId、eventId、sessionId和诊断ID，保留脱敏错误类别、原因与必要堆栈。
- 渠道执行异常不再吞掉；IM继续显示安全错误，审计保存诊断引用。缺失会话时仍可按事件定位。
- 沿用缓冲写入与日期轮转，覆盖文件失败、脱敏、并发归属和退出flush。

## Capabilities

### New Capabilities

- perception-plugin-logging：插件日志独立落盘、调用关联和脱敏诊断。

### Modified Capabilities

无。既有Agent模型失败语义、消息流终态及审计职责不变。

## Impact

影响core Plugin SDK/Host、channel-runtime/perception路由、desktop日志适配及四个插件包。无新依赖、数据库、用户IPC或业务数据迁移；桌面打包需验证新增运行模块。SDK端口可选以兼容既有插件，生产Desktop宿主必须注入。

依赖现有日志缓冲器、Plugin Host及统一渠道，不修改其他未完成Proposal的任务内容。非目标：修复所有网络/模型故障、建立日志UI、记录聊天正文或token流、引入独立日志服务。

上线随应用包交付；新日志首次事件时创建，旧日志保留。回滚撤回本次接线及模块，不删除历史日志、连接配置或会话。
