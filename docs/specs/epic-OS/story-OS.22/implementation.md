# OS.22 实施计划

## 开发目标

复用现有 Agent Session 流式能力，建立覆盖单体及项目 Multi-Agent Runtime 的统一 Channel 消息主路径，并移除感知执行直接调用 `agent.prompt()`、读取 Session State 差值的过渡路径。

## 实施步骤

1. `OS22-T1`：定义 ChannelInboundMessage、RuntimeTarget、AgentOutputEvent、DeliveryReceipt，以及 FBP Packet、有界 Port、背压、取消和终态语义；补协议测试。
2. `OS22-T2`：从现有 Desktop Agent Session Service 提取 Message Ingress 与输出订阅，不改变 UI 行为。
3. `OS22-T3`：实现 Agent、RoleAgent、Project Agent、Skill Runtime adapters，统一消息持久化、恢复、取消和输出。
4. `OS22-T4`：实现 Project Multi-Agent/Collaboration Runtime adapter、项目级输出聚合及可见性过滤。
5. `OS22-T5`：实现 Session Binding Store、并发策略、过期/重置和迁移。
6. `OS22-T6`：将 OriginOS 输入框迁到统一 Ingress，保留现有流式 UI 与 Task Runtime 行为。
7. `OS22-T7`：将 Perception Router 改为调用 Ingress；WeCom 插件改为消费 OutputEvent，删除 `responseTexts`/Session 差值桥接。
8. `OS22-T8`：实现 reply/push、ACK、FBP fan-out 分支隔离、幂等、失败重试、Delivery receipt 和 HITL 降级。
9. `OS22-T9`：迁移其他渠道，完成全量测试、lint、依赖检查、Windows 打包和验证 Goal。

## 文件级范围

新增 `packages/core/src/modules/channel-runtime/**`；修改 pi-agent 公共适配、collaboration-runtime 公共 facade、perception router、Desktop Session IPC、Web hooks/services 和各渠道插件。禁止修改 `dist-electron`、`.next` 或 `node_modules`。

## 兼容与迁移

先让现有 UI 与企微双写/对照新事件协议，再切换主路径；保留既有 Session ID 与事件/规则/lease 关联。迁移期间 `responseTexts` 仅作兼容字段，稳定后删除。失败可回退旧 UI IPC，但不得删除 Binding、Session 或感知审计。

OS 输入框迁移前必须把 `routeAgentSessionUserMessage` 的 Task Runtime 判定与控制域处理提取为可注入执行 Port。Channel Adapter 不得直接绕过该入口调用 `agent.prompt()`；外部渠道和 UI 应共享该 Port，仅由展示层分别消费 FBP Packet。

## 审查要点

- Channel Runtime 不出现平台名称分支。
- 感知层不直接调用具体 Runtime 或读取消息快照。
- Multi-Agent 必须经项目编排器，不绕过 Collaboration Runtime。
- 一个入站消息只有一个主响应流；所有副作用可审计。
- UI 输入与外部渠道通过同一集成测试契约。
- Runtime producer 必须 await Port 写入以传播背压；禁止重新引入无界事件队列。
