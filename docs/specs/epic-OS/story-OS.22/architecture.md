# OS.22 架构

## 设计目标

把 OriginOS 输入框与外部感知源视为同级 Channel Adapter，并在它们与所有 Agent Runtime 之间建立唯一的系统消息入口和输出事件流。

```text
Web UI / WeCom / Feishu / DingTalk / Email
                  │ ChannelInboundMessage
                  ▼
         Agent Message Ingress (Core)
      session binding · persistence · policy
                  │ RuntimeInvocation
     ┌────────────┼───────────────┐
 Agent/Role   Project/Skill   Project Multi-Agent
     │             │          Collaboration Runtime
     └────────────┼───────────────┘
                  │ FlowPacket<AgentOutputEvent>
                  ▼
        Channel Output Dispatcher
                  │
          UI render / plugin reply
```

## 影响模块

- `packages/core/src/modules/channel-runtime/`：协议、Ingress、Binding、Output Dispatcher、Delivery。
- `packages/core/src/lib/integrations/pi-agent/`：各单 Agent Runtime 的公共 invocation adapter。
- `packages/core/src/modules/collaboration-runtime/`：Project Multi-Agent adapter 与聚合输出。
- `packages/core/src/modules/perception-runtime/`：只保留路由与授权，调用 Channel Ingress。
- `packages/desktop/src/main/`：统一 IPC/流事件宿主、生命周期和持久化 Ports。
- `packages/web/src/services/`：OS UI Channel Adapter，替换重复发送逻辑。
- `packages/perception-plugins/*`：平台入站/出站 Adapter，原始 reply handle 留在插件内。

## 核心协议

```typescript
type RuntimeTarget =
  | { kind: 'agent' | 'role-agent' | 'project-agent' | 'skill'; id: string }
  | { kind: 'project-multi-agent'; projectId: string; runtime: 'collaboration' };

interface ChannelInboundMessage {
  id: string;
  connectorId: string;
  conversationId: string;
  actorId: string;
  content: { text?: string; attachmentRefs?: string[] };
  origin: 'originos-ui' | 'wecom' | 'feishu' | 'dingtalk' | 'email';
  replyHandle?: string;
  receivedAt: string;
}

type AgentOutputEvent =
  | { type: 'accepted'; sessionId: string }
  | { type: 'text_delta'; delta: string }
  | { type: 'assistant_message'; content: string }
  | { type: 'tool_status'; label: string; state: 'running' | 'completed' | 'failed' }
  | { type: 'hitl_request'; requestId: string; summary: string }
  | { type: 'completed'; resultRef: string }
  | { type: 'cancelled' }
  | { type: 'failed'; safeCode: string };

interface FlowPacket<T> {
  protocolVersion: '1.0';
  flowId: string;
  packetId: string;
  sequence: number;
  port: string;
  kind: 'data' | 'complete' | 'error' | 'control';
  emittedAt: string;
  payload?: T;
}
```

Ingress 接受结构化消息，但适配到当前 LLM 时只把允许的 content/provenance 生成用户消息；渠道元数据不冒充 System Prompt。Output Dispatcher 只接收 Runtime 公共事件，不读取 Session State 差值。

## FBP 流式模型

Channel 采用 Flow-Based Programming 的 Process/Port/Packet 模型。Ingress、授权/路由、Runtime Adapter、可见性过滤、审计和 Delivery 都是独立 Process；Process 只通过有类型的命名 Port 交换 `FlowPacket<T>`，不得共享可变会话状态。

- 每个 flow 内 `sequence` 单调递增，所有分支保留 `flowId`、`packetId` 和关联顺序。
- 数据 Port 为有界缓冲区；`send()` 在容量耗尽时等待消费方释放空间，把背压传播给上游 Runtime。
- fan-out 为每个分支配置独立有界 Port；慢分支按策略阻塞、超时或降级，不允许无限堆积。
- 每个流只允许一个终态包：`complete`、`error` 或 `control/cancelled`。终态后拒绝写入。
- 取消通过 `AbortSignal` 反向传播到 Runtime；错误包只携带安全码，不携带 Provider 异常或 Secret。
- 对现有只消费 `AgentOutputEvent` 的调用方提供解包兼容层，迁移完成后再移除旧接口。

```text
Channel Source(out) → Normalize(in/out) → Policy & Router(in/out) → Runtime(in/out)
                                                               ├→ Visibility → Delivery
                                                               └→ Audit
```

## 会话与投递

Binding 使用 `{origin, connectorId, conversationId, targetFingerprint}` 作为稳定键，JSON 存储在 `data/channels/bindings/`；Delivery receipt 存于 `data/channels/deliveries/`，遵循 DataFile/version/最近版本规则。replyHandle 只保存无敏感信息的 opaque ID，实际 frame/token 由插件进程内有界缓存管理。

## 多 Agent 约束

Project Multi-Agent Adapter 只能依赖 Collaboration Runtime 公共 API。Channel Runtime 不导入其 engine 内部实现；内部子 Agent 输出先由项目编排器聚合和可见性过滤，再变成公共 OutputEvent。

## 依赖与规约证明

依赖方向为 `desktop/web/plugins → core channel-runtime → session/storage/types`，Collaboration Runtime 通过公共 Port 注入，避免 Channel Runtime 反向依赖上层。无数据库、Express、Redux、CSS Modules、平台 SDK 下沉或生成目录修改，符合 AGENTS.md。

## 安全与性能

所有入站内容视为不可信数据；授权发生在 Runtime 调用前。首个 accepted 事件 <500ms；默认 Port 容量为 32，容量可注入但必须为正整数；输出使用背压与节流；单会话输出有序；Secret、思考和工具参数禁止出站。
