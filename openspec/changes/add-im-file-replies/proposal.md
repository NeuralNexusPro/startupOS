# IM 会话文件回传
epic-id: SENSE
story-id: SENSE.12
task-id: SENSE12-T4
owner: Codex
来源：docs/specs/epic-SENSE/story-SENSE.12/

## Why
用户已确认先在企业微信、飞书、钉钉 IM 对话中让 Agent 将生成的文件发回当前会话。当前只有文本回复，插件 attachments 声明不代表文件出站；钉钉还缺少真实连接及回复实现。

## What Changes
- 增加 send_file 工具，按当前授权会话的真实工作目录校验并发送文件，等待实际平台回执后报告结果。
- 通过当前调用的短期上下文固定收件会话；文件字节走插件回复接口，不写入聊天事件、历史或持久化回执。
- 企微和飞书复用已安装 SDK 的上传/文件回复；钉钉补齐安全凭据、真实接收及官方文件消息。
- 覆盖并发隔离、路径边界、发送失败、结束后失效和打包验收。

## Capabilities
### New Capabilities
- `im-file-replies`：当前 IM 会话内的受控文件回传。
### Modified Capabilities
无。

## Impact
Core 工具、渠道调用与插件 SDK；Desktop 回复宿主；三个平台插件。仅 JSON 文件存储，禁止上层反向依赖；不增加数据库或后端框架。

## 非目标与依赖
本 Task 不做资产面板手动分享、任意收件人选择、自动发送所有写入文件，也不改企微流式排队算法。企微积压是独立已定位问题。依赖现有平台 SDK、配置宿主和授权路由；钉钉真实连接按核验后的官方 SDK 接入。

## 交付与回滚
通过 Story 回归、架构检查、完整构建和实际包验证后合入 dev、同步归档。测试使用模拟平台，不发送真实文件。回滚源码恢复文本能力，保留配置兼容；新增凭据通过 safeStorage 存储，不写明文。
