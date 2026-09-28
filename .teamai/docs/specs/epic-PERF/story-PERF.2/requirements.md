# 需求文档 - Story PERF.2

**Story:** IPC 流式长内容输出性能优化  
**版本:** 1.0  
**最后更新:** 2026-07-27

## 需求来源

用户在 Windows 桌面版中接收长报告、长 Markdown 或长代码输出时，技能/Agent 窗体会出现明显卡顿甚至假死。当前链路已存在 16 ms 主进程批次和 renderer `requestAnimationFrame` 更新，但仍存在广播、重复序列化、逐事件派发、全文字符串拼接、全消息数组更新、全量 Markdown 解析、高亮和滚动等累积开销。

## 已识别的待验证瓶颈

1. `agent-session-service.ts` 每 16 ms `JSON.stringify` 批次并向所有 BrowserWindow 广播。
2. renderer 收到批次后逐事件调用 listener，未在 IPC 适配层继续合并文本 delta。
3. `assistantContent = assistantContent + delta` 随全文增长产生重复复制。
4. 每个动画帧通过 `setMessages(...map)` 更新消息数组并触发消息列表重新渲染。
5. `MarkdownContent` 对累计全文重复执行内容清洗、表格归一化、GFM 解析和代码高亮。
6. 流式内容变化持续计算 `scrollHeight` 并触发平滑滚动。

这些是调查假设，实施前必须用基准和 profiler 证明主要耗时，禁止只凭猜测修改协议。

## 功能需求

### FR1 可观测基线

- 为每个流记录 delta 数量、输入字符数、IPC 批次数、renderer 提交次数和最终字符数。
- 性能计数默认仅在开发/测试模式启用，不记录消息正文。
- 提供可重复的 100 KB、500 KB Markdown 与高频小 delta fixtures。

### FR2 有界 IPC 合并

- 普通 `text_delta` 按时间窗与最大字节数合并，任一阈值达到即发送。
- 合并后保持原始顺序，最终内容零丢失、零重复。
- `assistant_message`、`done`、`error`、`agent_error`、取消和需要立即交互的工具事件先 flush 文本再立即发送。
- 每个 stream 独立缓冲，结束、错误、取消、窗口销毁后清理 timer 和内容。
- 事件发送目标为调用该 IPC 的 `event.sender` 或明确绑定的 WebContents，不广播给全部窗体。

### FR3 renderer 提交节流

- renderer 不逐 delta 更新 React 状态。
- Skill、普通 Agent、RoleAgent 和项目 Agent 必须共用同一个流式渲染调度器，禁止在各窗体重复实现打字动画。
- 每个 Assistant Turn 的首个非空流式批次必须立即显示首批字符，提供可见的首字反馈。
- 合并后的文本采用批量打字机效果：按固定时间预算提交，依据待显示字符积压量动态调整每批字符数，禁止逐字符触发 React 更新。
- 调度器必须保证 Unicode 代理对不会在批次边界被拆开；大量积压时必须有追帧上限，避免动画反向制造长时间 backlog。
- 完成、错误和取消必须同步提交剩余文本和最终状态。
- 旧 stream 的迟到事件不得更新当前消息。

### FR4 流式渲染降级

- 流式过程中不得对每个提交重新执行完整语法高亮。
- 长内容流式阶段采用低成本可读渲染，完成后执行一次完整 Markdown/GFM/代码高亮。
- 短内容仍保持当前实时 Markdown 体验；切换阈值必须集中配置并有测试。
- 历史非流式消息应 memoize，当前流更新不得导致全部历史 Markdown 重算。

### FR5 滚动与交互

- 只有用户位于底部阈值内时自动跟随流内容。
- 流式期间使用非平滑、帧合并滚动，避免积累动画。
- 用户主动向上滚动后停止自动跟随，直到用户回到底部或点击已有回底部控制。
- 停止按钮、窗口拖动、滚动和输入焦点在长流期间保持响应。

### FR6 协议兼容

- 保持现有 streamId、sessionId、事件类型和最终消息持久化语义。
- 保持 Web/SSE 模式可用，公共合并逻辑应尽量位于可复用下层。
- Skill、普通 Agent、RoleAgent 和项目 Agent 的共享入口不得回归。

### FR7 工具调用日志与输出背压

- `execute_command` 的完整命令、stdout 和 stderr 不得在 `START_CALL`、`END_CALL`、`ToolResult`、`Turn Detail` 中重复展开。
- 开发终端、desktop 日志和 LLM 日志共用一次有界序列化结果，不得嵌套包装 console 导致同一对象重复 `inspect`。
- 工具日志保留 toolCallId、退出码、耗时、字符数、哈希和短预览；失败日志保留可诊断错误摘要。
- 子进程 stdout/stderr 使用有界缓冲；超过上限时保留头尾内容和截断计数，不能无限增长主进程内存。
- 日志压缩不得修改实际工具成功/失败判定和传给模型的必要诊断语义。

### FR8 进程响应性与 Agent 阶段诊断

- 主进程必须监测 event-loop lag，超过阈值时记录延迟、内存摘要和活跃 Agent 阶段。
- 所有 BrowserWindow 必须记录 `unresponsive`、恢复响应和 renderer 异常退出事件，并包含窗口标识与无响应持续时间。
- Agent 执行期间必须低频记录当前阶段（等待模型、模型流、工具执行、完成检查）、阶段持续时间和最近工具名。
- 诊断日志不得记录用户消息、模型正文、工具参数或工具结果正文。
- 监测器不得通过高频采样、同步 I/O 或无限状态保留引入新的性能瓶颈。

### FR9 流式循环保护降载

- `text_delta` 热路径不得执行重复尾部、近似文本或累计全文扫描。
- 仅在完整 Assistant Turn 结束后计算响应哈希，并与同一次用户任务的上一轮完整响应比较。
- 完整响应相同时标记跨轮重复并交给 Completion Guard；不得截断流式正文或在正文尚未完成时 abort。
- 新用户请求必须重置比较基线，避免把不同任务中的相同问候或固定格式回复误判为循环。

## 验收场景

### AC1 高频小 delta

**Given** 500 KB 内容被拆分为 1 至 8 字符 delta  
**When** 通过 Electron Agent 流发送  
**Then** 最终内容与 fixture 完全一致，IPC/React 更新次数显著低于 delta 数量，关键完成事件在剩余文本 flush 后到达。

### AC2 长 Markdown 输出

**Given** 内容包含表格、列表、代码块和中文文本  
**When** 流式输出达到长内容阈值  
**Then** 流式阶段保持低成本可读显示，完成后一次性呈现正确 Markdown、表格和代码高亮。

### AC2.1 通用打字机效果

**Given** Skill、普通 Agent、RoleAgent 或项目 Agent 收到一次包含多个字符的流式批次  
**When** renderer 展示 Assistant 消息  
**Then** 首批字符立即可见，剩余字符按受控批次逐步显示，React 提交次数远小于字符数，完成事件到达时立即显示完整最终内容。

### AC3 用户中断

**Given** 500 KB 流正在输出  
**When** 用户点击停止  
**Then** 200 ms 内显示停止反馈，剩余定时器被清理，迟到事件不再修改消息。

### AC4 多窗体隔离

**Given** 同时打开主窗体、Skill 窗体和 Agent 窗体  
**When** Skill 窗体发起流  
**Then** 只有该流绑定的 renderer 接收事件，其他窗体不执行解析或 React 更新。

### AC5 错误与工具事件

**Given** 文本缓冲中尚有 delta  
**When** 工具事件、错误或 done 到达  
**Then** 事件顺序稳定，文本先 flush，关键事件立即可见且不会被节流丢弃。

### AC6 大型工具调用

**Given** Agent 生成多行 PowerShell 脚本并获得 1 MB 以上 stdout/stderr  
**When** `desktop:dev` 执行并记录该工具调用  
**Then** 主进程只保留有界输出，终端和日志不重复打印完整正文，窗口事件循环保持可响应，模型仍收到明确的截断标记和错误摘要。

### AC7 无响应可定位

**Given** Agent 正在等待模型或执行长工具，或者 main/renderer 事件循环发生阻塞  
**When** 阶段持续超过诊断周期或窗口进入无响应状态  
**Then** 日志明确区分正常等待、main event-loop lag、renderer unresponsive 和 renderer 异常退出，并关联 session 与最近工具。

## 边界与异常

- 空 delta、重复 done、迟到事件、streamId 不匹配。
- 窗体在缓冲期间关闭或 renderer reload。
- 同一会话快速停止并启动下一条流。
- 单个 delta 大于最大批次字节数。
- Unicode surrogate pair、组合字符和中文不能被不安全截断。
- Markdown 围栏代码块在流式阶段未闭合。
- 大表格或超长单行不得导致横向布局撑破窗体。

## 非功能需求

- 100 KB 基准最终完成时间不得比基线恶化超过 10%。
- 500 KB 基准不得出现持续 1 秒以上 renderer 无响应。
- 单个 renderer long task 不超过 200 ms；超过 50 ms 的数量必须纳入测试结果。
- 缓冲必须有最大字符/字节边界，不允许无界增长。
- 性能日志不得记录消息正文、凭据或文件内容。
- 单个 console 参数序列化结果和单个工具输出缓冲必须具有集中配置的硬上限。
- 核心合并、顺序、取消和 flush 逻辑分支覆盖率不低于 80%，跨进程集成点覆盖率 100%。
