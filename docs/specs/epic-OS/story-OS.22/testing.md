# OS.22 测试

## 自动化验证 Goal

功能实施完成后必须创建并完成目标：“通过 OS.22 中定义的统一 Channel 消息入口、全部 Runtime、双工输出、Session Binding 与安全隔离测试 case”。

## 测试用例

| ID | 层级 | 场景 | 预期 |
|---|---|---|---|
| OS22-UT-01 | Core | 入站/输出协议校验 | 非法 origin、target、事件顺序、reply handle 被拒绝 |
| OS22-UT-02 | Core | Session Binding | 同会话同目标复用；过期、重置、目标变化新建 |
| OS22-UT-03 | Core | 主回复仲裁 | 多规则仅一个主回复流，后台结果仍审计 |
| OS22-IT-01 | Agent | 普通 Agent | 消息持久化并按序输出标准事件 |
| OS22-IT-02 | Agent | RoleAgent | 状态/记忆加载保持，输出协议一致 |
| OS22-IT-03 | Agent | Project Agent | 项目 CWD、知识快照和 Session 保持 |
| OS22-IT-04 | Skill | Standalone/继承 Skill | 认知归属正确且输出协议一致 |
| OS22-IT-05 | Multi-Agent | Project Collaboration Runtime | 经项目编排器执行，聚合用户可见结果返回 |
| OS22-IT-06 | Desktop | OS 输入框 | 迁移前后消息、流式、工具状态、Task Runtime 一致 |
| OS22-IT-07 | Perception | 规则到 Ingress | 不直接 `agent.prompt()`，事件/规则/lease/session 可追溯 |
| OS22-PLG-01 | WeCom | 双工回复 | 同一 reply handle 有序发送，末帧结束且有 receipt |
| OS22-ERR-01 | Runtime | 执行失败/取消 | 输出安全码，Session 可恢复，不重复执行 |
| OS22-ERR-02 | Channel | 断线/句柄过期 | 有界重试或安全降级，不丢审计、不泄密 |
| OS22-SEC-01 | Security | 不可信输入/敏感输出 | 无 prompt 提权；思考、工具参数、Secret 不出站 |
| OS22-PERF-01 | Performance | 首状态与背压 | accepted <500ms，高频 delta 节流且顺序稳定 |
| OS22-FBP-01 | Core | 有界 Port 背压 | 缓冲区满时生产者等待，消费后恢复，内存不无限增长 |
| OS22-FBP-02 | Core | Packet 顺序与终态 | sequence 单调递增，且 complete/error/cancelled 仅出现一次 |
| OS22-FBP-03 | Core | 取消传播 | 消费方取消后 Runtime 收到 AbortSignal，终态后拒绝新数据 |
| OS22-FBP-04 | Core | fan-out 隔离 | 快慢分支顺序一致；慢分支按配置阻塞或安全降级，无静默丢包 |
| OS22-E2E-01 | E2E | UI 连续对话 | 同 Session 连续上下文与流式回复正确 |
| OS22-E2E-02 | E2E | 企微到 Multi-Agent | 入站、规则、项目编排、聚合回复、receipt 全链路通过 |

## 测试策略与覆盖

Core 单元覆盖率 ≥80%；五类 Runtime 集成点 100%；OS UI、企微与项目 Multi-Agent 关键路径 E2E 100%。执行 Vitest、Web/Desktop typecheck、lint、循环依赖扫描、Windows 构建及真实企微人工验收。真实平台不可自动化部分需记录脱敏时间戳、健康状态、消息 ID、receipt、人工步骤和剩余风险。

## 边界数据

覆盖空文本、20MB 附件引用、超长 UTF-8 回复、重复 messageId、两条并发消息、多个匹配规则、Binding 过期、Runtime 重启、Channel 断线、HITL 超时、Port 容量 1、终态后写入和项目内部 Agent 部分失败。
