# 架构设计文档 - Story PERF.2

**Story:** IPC 流式长内容输出性能优化  
**版本:** 1.0  
**最后更新:** 2026-07-27

## 架构目标

治理从 Pi Agent delta 到 Electron IPC、renderer adapter、React 状态和 Markdown DOM 的完整热路径。优化必须在测量后实施，并保持事件顺序、最终内容和会话持久化契约。

## 当前数据流

```text
Pi Agent message_update
  → agent-session-service 16 ms eventBatch
  → JSON.stringify
  → BrowserWindow.getAllWindows().webContents.send
  → renderer JSON.parse + batch for-loop
  → client-hooks append string
  → requestAnimationFrame + setMessages(map)
  → ChatMessageList 全列表 render
  → sanitize + table normalize + ReactMarkdown + highlight
  → scrollHeight + smooth scroll
```

## 目标数据流

```text
Pi Agent text_delta
  → StreamBatcher（时间 + 字节双阈值）
  → 发起请求的 WebContents
  → Electron adapter 合并 batch 中连续 text_delta
  → RendererStreamBuffer（有界、可取消）
  → 受控频率提交当前消息
  → 流式轻量视图 / 短内容 Markdown
  → 完成时 flush + 一次完整 Markdown
```

## 影响模块

| 模块 | 责任 |
|------|------|
| `packages/desktop/src/main/services/agent-session-service.ts` | 绑定 sender、事件批处理、关键事件 flush、生命周期清理 |
| `packages/desktop/src/main/services/skill-service.ts` | 审计 Skill 独立流通道并复用批处理策略 |
| `packages/core/src/lib/integrations/electron/services/agent-session.ts` | 解析结构化批次、合并连续 delta、保持顺序 |
| `packages/core/src/lib/integrations/pi-agent/client-hooks.ts` | renderer 缓冲、提交节流、取消和最终 flush |
| `packages/web/src/components/ui/chat/ChatMessageList.tsx` | 历史消息 memo、底部检测和滚动调度 |
| `packages/web/src/components/ui/chat-message.tsx` | 流式轻量渲染与完成后完整 Markdown |
| `packages/desktop/src/main/services/process-health-monitor.ts` | main event-loop lag、renderer 响应性和 Agent 阶段诊断 |
| 性能测试 fixtures/harness | 生成稳定的长 Markdown 与高频 delta |

## 核心抽象

```typescript
interface StreamBatchPolicy {
  maxDelayMs: number;
  maxBytes: number;
}

interface StreamBatcher {
  push(event: AgentStreamEvent): void;
  flush(reason: 'timer' | 'size' | 'critical' | 'complete'): void;
  dispose(): void;
}

interface StreamMetrics {
  inputDeltaCount: number;
  inputChars: number;
  ipcBatchCount: number;
  rendererCommitCount: number;
  finalChars: number;
}

interface AgentRuntimeActivity {
  sessionId: string;
  phase: 'prompt_start' | 'model_wait' | 'model_stream' | 'tool_running' | 'completion_check';
  toolName?: string;
  phaseStartedAt: number;
  lastActivityAt: number;
}
```

- `StreamBatcher` 应放在 desktop 主进程服务层，不进入 Web。
- 可复用的 delta 合并和顺序逻辑放在 Electron integration 公共 API 内部。
- UI 只消费稳定的流状态，不理解 Electron sender。
- 进程健康监测属于 Desktop main 服务层，只消费脱敏的 Agent 阶段元数据，不依赖 Core 或 Web UI。

## 响应性诊断

- main 通过定时器漂移检测 event-loop lag，阻塞恢复后输出可关联的告警。
- Electron `BrowserWindow` 的 `unresponsive`、`responsive` 和 `render-process-gone` 事件用于区分 renderer 卡死与主进程等待。
- AgentSessionService 只上报阶段切换，不上报消息正文和工具内容。
- 活跃任务每 15 秒输出一次低频状态；无活跃任务时不输出周期日志。
- 日志字段保持有界，窗口关闭和任务结束后清理状态。

## 批处理规则

1. 连续 `text_delta` 可以合并为一个 delta。
2. 非文本事件前必须 flush 已缓冲文本。
3. done/error/cancel 前必须 flush 且立即发送。
4. 批次达到最大字节数时立即发送，避免等待 timer。
5. 每个 streamId 独立维护状态。
6. renderer/window 销毁时 dispose，不继续发送。
7. 直接传结构化对象，除非基准证明手工 JSON 序列化更快且有必要。

## 渲染策略

- 历史消息组件通过稳定 key 与 memo 避免当前流更新导致重算。
- 当前流只更新一个消息状态，避免扫描和复制全部历史消息；具体数据结构在基准后确定。
- 超过阈值后使用轻量文本流视图，避免反复构建 Markdown AST 和代码高亮树。
- 完成后以最终内容执行一次 sanitize、表格归一化、GFM 和 highlight。
- 自动滚动使用 bottom proximity 判断与 animation-frame 合并，不积累 smooth scroll。

## 性能测量

- Node 层：输入 delta、IPC 批次、序列化字节、flush 原因。
- Renderer 层：提交次数、commit duration、long task、最终字符数。
- UI 层：Markdown 解析次数、scroll 调度次数。
- 指标只记录计数和耗时，不记录内容。

## 依赖方向

```text
Web chat components
  → Core pi-agent hooks
  → Core Electron service adapter
  → Electron preload IPC
  → Desktop main agent-session service
  → Pi Agent integration
```

现有 Electron 边界决定调用方向；Core 不依赖 Web，Desktop main 不依赖 Web UI 实现。共享纯逻辑必须通过 Core 公共 API 导出，禁止跨 feature 导入内部文件。

## 风险

- 批次过大会增加首字延迟；使用时间与字节双阈值。
- 流式轻量视图切换到 Markdown 可能产生布局跳动；保持容器尺寸并测试滚动锚点。
- 多轮或恢复流可能错误复用缓冲；以 streamId 隔离并销毁。
- 过度 memo 可能显示旧内容；props 比较只忽略与消息无关的状态。
- Skill 独立流通道可能绕过优化；必须纳入审计和测试。

## AGENTS.md 符合性

- Core 集成层不依赖 Web 或 Desktop main。
- Desktop main 只依赖 Core 公共 API、同层服务和 Electron/Node。
- UI 继续使用 React 函数组件，不引入其他状态管理。
- 不修改 `dist-electron/` 或 `.next/`。
- 性能测试覆盖关键用户流程和跨进程集成点。
