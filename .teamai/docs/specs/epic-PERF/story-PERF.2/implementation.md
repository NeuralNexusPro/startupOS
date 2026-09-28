# 开发文档 - Story PERF.2

**Story:** IPC 流式长内容输出性能优化  
**版本:** 1.0  
**最后更新:** 2026-07-27

## 开发目标

先建立端到端性能基线并确认主要耗时，再分层减少 IPC 消息、renderer 状态提交、Markdown 全量重解析和滚动布局开销，使 500 KB 长内容流期间窗体保持响应。

## 实施步骤

### 1. 建立基准与 profiler 证据

- [ ] 创建 100 KB、500 KB Markdown fixtures，包含中文、表格和代码块。
- [ ] 创建 1 至 8 字符高频 delta 生成器。
- [ ] 记录 IPC 批次、renderer commit、Markdown render、scroll 和 long task 指标。
- [ ] 保存优化前基线到 `testing.md`，确认前三个主要耗时点。

### 2. 主进程批处理与定向发送

- [x] 抽取可测试 `StreamBatcher`。
- [x] 使用时间和最大字节双阈值。
- [x] 合并连续 text delta，并在关键事件前 flush。
- [x] 将事件发送目标从全部 BrowserWindow 改为请求 sender/绑定 WebContents。
- [x] 在完成、错误、取消、窗口销毁时释放 timer 和缓冲。

### 3. Electron adapter 合并

- [x] 避免不必要的 stringify/parse；以基准决定最终传输格式。
- [x] 在 batch 展开前合并连续 text delta。
- [x] 保持非文本事件相对顺序。
- [ ] 记录并拒绝不匹配 sessionId/streamId 的迟到事件。

### 4. renderer 状态提交

- [x] 抽取可测试 renderer stream buffer。
- [x] 限制 React 提交频率并确保最终 flush。
- [x] 避免每次更新扫描全部历史消息，或以 memo 隔离历史消息。
- [x] 停止、错误、unmount 时取消动画帧和 timer。

### 5. Markdown 与滚动

- [x] 对长流采用轻量文本视图，结束后完整 Markdown 一次渲染。
- [x] 短流阈值集中配置并自动化测试。
- [x] 历史 Markdown 消息 memoize。
- [x] 自动滚动仅在用户接近底部时运行，并取消 smooth 动画累积。
- [x] 验证表格、代码块、AskUserQuestion 和工具卡片无回归。

### 6. 通道一致性

- [x] 验证 `AGENT_SESSION_MESSAGE_STREAM`。
- [x] 审计并对齐 `SKILL_EXECUTION_MESSAGE_STREAM`。
- [ ] 验证普通 Agent、RoleAgent、Skill 和项目 Agent 的最终消息。
- [ ] 验证 Web/SSE fallback 不因共享逻辑变更而回归。

### 7. 验证与记录

- [x] 运行功能、集成、组件和批处理性能测试。
- [ ] 对比优化前后事件数、commit 数、long task 和总耗时。
- [x] 运行 Desktop/Core/Web 定向验证与 lint。
- [x] 创建自动化验证 goal，目标为通过 PERF.2 测试用例。
- [ ] 在 Windows 安装包复测真实长报告输出。

### 8. 第二轮运行态修复

- [x] 聚合 `toolcall_delta` 日志，不再逐 delta 输出到终端和日志文件。
- [x] Desktop/LLM 文件日志改为异步批量追加。
- [x] 工具结果日志限制预览长度，保留原始长度与哈希。
- [x] Completion Guard 成功恢复后发送语义确认的最终内容。
- [x] Completion Guard 恢复耗尽后将失败报告覆盖计划文本并持久化。
- [x] Persistent Agent 使用限频渲染调度器。
- [x] 删除 AgentDialog renderer 热路径逐消息日志。
- [x] `desktop:dev` 固定使用 3100 端口和独立 Dev profile。
- [x] Electron 创建窗口前等待 Next HTTP ready，并限制为单开发实例。

### 9. 第三轮大型工具调用背压修复

- [x] 合并 desktop/LLM console 捕获，确保每次调用只序列化一次。
- [x] 对 console 字符串和对象设置统一最大长度。
- [x] 将工具开始、结束和 Agent ToolResult 日志改为长度、哈希和预览摘要。
- [x] 为 `execute_command` stdout/stderr 增加头尾有界缓冲和截断标记。
- [x] 日志文件改为 1 秒或 256 KB 阈值触发异步批量 flush。

### 10. 第四轮进程响应性诊断

- [x] 新增 main event-loop lag 监测和低频健康状态。
- [x] 监听所有 BrowserWindow 的 unresponsive/responsive/render-process-gone。
- [x] 在 AgentSessionService 上报脱敏的执行阶段和最近工具。
- [x] 增加可控时钟、窗口事件和活动清理单元测试。
- [x] 删除 `text_delta` 上的重复尾部和近似文本扫描。
- [x] 改为同一用户任务内比较完整 Assistant Turn 哈希，并接入 Completion Guard。
- [x] Renderer scheduler 改为首个流式批次立即提交、后续批量限频、终态立即 flush。
- [x] 普通会话、Skill、RoleAgent 和项目 Agent 统一使用自适应批量打字机调度器。
- [x] 分离完整接收缓冲与已渲染前缀，避免动画节流造成内容截断。
- [x] 验证失败状态、Completion Guard 和模型可见诊断信息不回归。

## 文件级改动范围

预计修改：

- `packages/desktop/src/main/services/agent-session-service.ts`
- `packages/desktop/src/main/services/skill-service.ts`
- `packages/core/src/lib/integrations/electron/services/agent-session.ts`
- `packages/core/src/lib/integrations/pi-agent/client-hooks.ts`
- `packages/web/src/components/ui/chat/ChatMessageList.tsx`
- `packages/web/src/components/ui/chat-message.tsx`
- 对应 `__tests__` 与性能 fixtures

文件名可根据现有测试布局调整，但不得把共享业务逻辑复制到多个入口。

## 兼容策略

- 不修改持久化消息格式。
- 不改变公开 IPC channel 名称和终态事件语义。
- 新批次字段仅做向后兼容扩展；旧事件解析在迁移期保持可用。
- 功能开关只用于性能对照和紧急回退，不长期保留双实现。

## 审查要点

- 是否只减少 IPC 数量，却仍在 renderer 逐 delta setState。
- 是否将大批次设置过高，导致首字或停止反馈变慢。
- 是否在 done/error 前遗漏 flush。
- 是否仍广播到所有窗口。
- 是否每帧完整执行 Markdown、highlight 或 table normalize。
- 是否因 memo 导致最终内容、工具状态或 AskUserQuestion 不更新。
- 是否在关闭窗口、停止和新 stream 时遗留 timer/listener。
