# 企业微信流式输出积压修复

epic-id: SENSE
story-id: SENSE.12
task-id: SENSE12-T5
owner: Codex
来源：docs/specs/epic-SENSE/story-SENSE.12/

## Why
用户在新文件回复测试包中确认企业微信流式输出仍慢。共享发送器逐片等待ACK，企微逐片发送累计全文；文件回传Task未修改此路径，因而积压仍存在。
## What Changes
- 合并等待ACK期间已积累的连续文本片段，首包不增加人为等待，保留终态/控制事件顺序。
- 每个原packetId仍保存真实投递回执，合并组重试内容稳定；磁盘失败不触发重复网络投递。
- 企微文本仅在ACK成功后提交累计状态，避免重试追加重复文字。
- 用受控ACK延迟比较请求数与完成尾延迟，回归飞书/钉钉文本及文件回复。
## Capabilities
### New Capabilities
- `channel-stream-delivery`：保持投递语义的流式文本积压合并。
### Modified Capabilities
无。
## Impact
Core ChannelOutputDispatcher及测试；企微插件及测试。无新增依赖、公共API、IPC或数据格式变更；仍使用现有ChannelDeliveryStore。平台SDK留在插件边界。
## 非目标、依赖与交付
不改变模型推理速度、不增加钉钉流式卡片、不改文件回传或平台配置。复用Node标准库和已安装企微SDK。通过Story验收、完整构建与实际包延迟脚本后合入dev并归档；回滚本Task恢复旧发送策略，回执格式兼容。
