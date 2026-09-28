# OS.22 需求

## 需求来源

OriginOS 输入框本质是一个消息渠道；外部感知源不应建立平行的 Agent 调用链。当前企微过渡实现经 `events.submit()` 同步等待目标并读取 Session State 回复，未复用系统输入框的消息持久化与流式协议，也未覆盖项目 Multi-Agent Runtime。

## 详细需求

1. 定义渠道无关的结构化入站消息、来源上下文、回复句柄和附件引用。
2. 定义统一消息入口，解析或创建 Session，持久化 user message，并调用目标 Runtime。
3. 目标类型必须覆盖 `agent`、`role-agent`、`project-agent`、`skill`、`project-multi-agent`/`collaboration-runtime`。
4. 定义统一输出事件：文本增量、Assistant 消息、工具状态、行动请求、HITL、完成、取消与失败。
5. OS UI 和插件渠道消费同一输出事件；渠道 Adapter 负责平台格式、ACK、reply/push 和投递回执。
6. 感知 Router 仅执行规则、授权、幂等和目标选择，再调用统一入口；禁止直接调用具体 Agent Runtime。
7. 使用 `connectorId + conversationId + target` 建立可持久化、可过期、可重置的 Session Binding。
8. 项目 Multi-Agent 输入进入项目的编排入口，由 Collaboration Runtime 管理参与 Agent；渠道不得绕过项目编排器直接选取内部 Agent。
9. 原始 frame、reply token 和平台 Secret 不进入通用事件、Session 或 Prompt，只以插件内 opaque `replyHandle` 关联。
10. 同一消息只允许一个主回复流；其他匹配规则可执行后台行动，但不得产生竞争回复。
11. Channel 流必须遵循 FBP 的 Process/Port/Packet 模型；Packet 携带 flow/packet/sequence/port 标识，Port 有界并通过异步写入传播背压。
12. 流必须支持向 Runtime 传播取消；`complete`、`error`、`cancelled` 是互斥且唯一的终态，终态后禁止继续写入。

## Given / When / Then 验收标准

- Given OS 输入框或任意插件收到消息，When 发送到统一入口，Then 使用同一 Session 消息持久化与输出协议。
- Given 目标分别为五类 Runtime，When 接收相同标准消息，Then 均能执行并输出标准事件，Channel 不包含类型分支业务逻辑。
- Given 目标为 Project Multi-Agent，When 渠道消息进入，Then 项目编排器接管任务并将聚合输出返回原渠道。
- Given 同一会话连续发送消息，When Binding 未过期，Then 复用相同 Session；重置或过期后创建新 Session。
- Given Agent 产生文本、工具、HITL 和错误事件，When Channel 消费输出，Then 只外发允许的用户可见事件。
- Given 同一事件命中多规则，When 多目标执行，Then 仅主响应目标可回复，后台目标结果写审计。
- Given Runtime 输出速度超过渠道消费速度，When Port 达到容量，Then 上游等待容量释放或执行显式降级策略，不无限缓存或静默丢包。
- Given 消费方取消流，When Runtime 尚未结束，Then 取消信号反向传播且全流只产生一次 cancelled 终态。

## 边界与异常

- Channel 断开不取消已获准的后台行动；无法投递的回复进入有界重试或死信。
- 回复句柄过期时不得尝试复用原 frame，可按渠道能力降级为主动推送或记录不可投递。
- 不向外部渠道发送思考内容、System Prompt、工具参数、Secret 或未脱敏异常。
- 空文本、重复 messageId、超长内容、附件缺失、会话并发、用户取消和 Runtime 崩溃必须有确定语义。
- 每个 Session 同时只允许一个有序主输出流；需要定义排队或忙碌响应。
- Port 容量必须是正整数；容量为 1、慢消费者、分支消费者失败和终态竞态必须有确定语义。

## 非功能需求

- 消息入口接受并返回首个状态事件 <500ms；不得等待完整 Agent 执行才 ACK。
- 核心逻辑覆盖率 ≥80%，所有 Runtime 集成点 100%，关键 UI/企微流程 E2E 100%。
- 仅使用 JSON 文件存储 Binding/Delivery，不引入数据库或后端框架。
- 严格 TypeScript，禁止 `any`；日志、审计和持久化不得包含渠道 Secret。

## 依赖关系

前置：OS.20、SENSE.12、现有 Agent Session、Project Agent 与 Collaboration Runtime。后续渠道插件及系统通知可统一消费本协议。
