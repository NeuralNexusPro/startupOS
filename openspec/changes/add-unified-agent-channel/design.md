# Design：统一 Agent Channel

Channel Adapter 将平台输入转为结构化消息；Core Message Ingress 负责 Session Binding、持久化、授权后调用 Runtime Port；Agent/Role/Project/Skill adapters 与 Collaboration adapter 产出同一 FBP Packet 流；Output Dispatcher 将用户可见事件交给 UI 或插件 Delivery Port。

流式边界采用 Flow-Based Programming 的 Process/Port/Packet 范式。每个 Packet 携带 flowId、packetId、sequence、命名 port、类型和时间戳；Port 使用有界缓冲并通过异步 send 传播背压。取消使用 AbortSignal 反向传播，每个 flow 只允许 complete、error、cancelled 三者之一作为唯一终态。Delivery 与 Audit 通过独立分支 Port 消费，禁止共享无界队列。

感知层是 Channel 前置策略，不承担 Agent 生命周期。项目 Multi-Agent 必须通过 Collaboration Runtime 公共 facade，由编排器聚合输出。插件只保存 opaque reply handle 到原始 frame/token 的有界内存映射，Core 不接触平台 SDK。

依赖保持 `desktop/web/plugins → core channel-runtime → session/storage/types`；具体 Runtime 通过 Port 注入，防止 channel-runtime 与 feature/engine 循环依赖。
