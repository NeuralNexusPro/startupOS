## Context
SENSE12-T4：IM 触发的 Agent/Skill 需要把工作目录资产发回当前会话。没有统一资产 ID 注册表，不新建一套索引。企微/飞书已有文件 SDK；钉钉需真实 Stream 与 OpenAPI。
## Goals / Non-Goals
显式 send_file、真实回执、路径/并发隔离、三平台可用。非目标见 proposal：不做资产面板分享或自动发送 artifact_changed。
## Decisions
### 调用上下文
下层 integrations/pi-agent/channel-file-reply.ts 使用 Node AsyncLocalStorage，导出 ChannelReplyFile（fileName:string、bytes:Uint8Array）与 withChannelFileReply(sender,operation)、withChannelFileWorkingDirectory(cwd,operation)、requireChannelFileReply()。sender 接收文件、toolCallId 和可选 AbortSignal，返回 Promise<void>；由平台回执判断成功。上下文共享 active lease，整个调用结束后 finally 撤销，禁止 disable 全局实例。
Perception ChannelTriggerExecutionAdapter 只有在授权路由和有效 supportsFiles 回复注册下绑定 sender，并在 ALS 内创建且完整消费异步流。PiAgent gateway 包裹完整 executeMessage/prompt，绑定持久化 session.projectContext.currentPath；没有可信目录则拒绝发送，不使用全局默认工具上下文或 process.cwd。
### 工具与安全
业务工具 send_file 只接受 filePath，不接受收件人、URL 或连接 ID。文件以当前会话真实目录解析；允许该根内的相对或绝对路径，拒绝越界/符号链接逃逸/目录/空文件。用异步、受限读取，最大20_000_000字节；检查中止和 lease。只把文件名与安全结果返回模型，不把字节或真实凭据写日志。
### 插件回复协议
PluginReplyEvent 新增 {type:'file';file:ChannelReplyFile}，从 Plugin SDK 导出该类型；不扩展 AgentOutputEvent，避免字节进入聊天持久化/renderer。
PluginReplyPort.register 第三个可选参数 {supportsFiles?:boolean}，旧调用默认不支持文件。Desktop 回复服务提供 canSendFile 与 sendFile，复用原注册表。以 replyHandle 与 toolCallId 的哈希作为文件投递 ID，复用 ChannelDeliveryStore 保存无内容回执，成功重入跳过；未确认的发送不自动重试并明确失败，不能宣称 exactly-once。插件能力新增 outbound-files，Host 限制只有声明该能力的注册能启用文件。
### 三平台
企微：uploadMedia(Buffer,{type:'file',filename}) 后 replyMedia(frame,'file',media_id)，等待 ACK。
飞书：LarkChannel.send(chatId,{file:{source:Buffer,fileName}},{replyTo:messageId})。
钉钉：固定官方 dingtalk-stream（版本需通过发布包握手中停止测试后锁定，不把未发布 main 当作依赖），凭据 appId/appSecret，robotCode 配置与回调匹配；debug:false、subscriptions:[]，SDK 管理 WS 心跳重连。健康检查 connected && registered，停止清理注册、调度和客户端。
钉钉文件使用应用 token、media/upload、群 groupMessages/send 或单聊 oToMessages/batchSend，msgKey sampleFile；单聊只使用 senderStaffId，检查 invalidStaffIdList/flowControlledStaffIdList。格式 xlsx/pdf/zip/rar/doc/docx，其他格式明确提示先生成 ZIP；不偷偷改文件格式。文本使用官方 sampleText，增量本地累积后按已有终态发出，避免逐字请求。
### 钉钉接纳确认
PluginEventPort.submit 的可选第二参数包含 onAccepted 回调；Host 完成事件落盘后调用，再执行耗时路由。钉钉据此及时 SDK ACK，不等 Agent 完成，不在落盘前确认。其余调用无需变更。连接失败不得显示 healthy。
### 依赖与写入
Core/Host 工作包先完成上述契约及 send_file，合入 Proposal 后，企微飞书与钉钉两工作包并行。插件只导入 Core Plugin SDK；平台 SDK 及 fetch 在各插件，Core 不依赖上层。钉钉只新增一个官方 SDK，复用 Node fetch/FormData 发送。
## Risks / Trade-offs
ACK/HTTP 超时可能已被平台接受，避免应用层盲重试，报告未确认；成功回执持久化不等于收件人已读。首次真实平台认证/权限仍需人工账号验收，自动化使用模拟 SDK/HTTP，绝不发送用户文件。
## Migration Plan
旧 Connector 保持可读；钉钉缺凭据应引导重新绑定而非假健康。无数据库或文件资产迁移。回滚提交恢复旧能力。

审查补充：宿主以在途Promise合并相同投递ID并发；读取过程硬限limit+1；lease使用共享AbortController，字节file事件可附短期AbortSignal，插件上传后发送前检查中止和连接实例仍有效。重复落盘也调用onAccepted；ACK异常安全记录后继续路由，落盘失败不ACK。铉钉旧连接的延迟ACK不得发到新连接。
