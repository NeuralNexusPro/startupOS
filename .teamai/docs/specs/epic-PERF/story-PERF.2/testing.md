# 测试文档 - Story PERF.2

**Story:** IPC 流式长内容输出性能优化  
**版本:** 1.0  
**最后更新:** 2026-07-27

## 测试目标

验证长内容流经过 IPC 合并和渲染降载后保持内容、顺序、终态和交互兼容，并用可重复指标证明假死风险显著下降。

## 测试数据

- `short.md`: 10 KB 普通 Markdown。
- `long-100k.md`: 100 KB 中文、列表、表格和代码块。
- `long-500k.md`: 500 KB 相同结构的稳定 fixture。
- delta 模式：1、4、8、64、1024 字符，以及混合随机但固定种子。
- 事件模式：text、tool_start/end、assistant_message、done、error、abort 混合。

测试输出以 SHA-256 和字符长度验证，不在性能日志打印 fixture 正文。

## 单元测试

### TC-U1 StreamBatcher 时间阈值

- timer 到期发送一个有序文本批次。
- 同一个 timer 窗口内不重复发送。
- fake timers 下结果稳定。

### TC-U2 StreamBatcher 字节阈值

- 达到最大字节数立即 flush。
- 单个超大 delta 独立发送且不丢失。
- Unicode 内容不被按无效 UTF-16 边界截断。

### TC-U3 关键事件顺序

- text 后接 tool、done、error、abort 时先 flush text。
- done/error 不被普通节流延迟。
- 重复 done 不产生重复最终消息。

### TC-U4 生命周期清理

- complete、error、abort、window destroyed、dispose 都清理 timer 与缓冲。
- dispose 后迟到事件被忽略。
- 新 stream 不复用旧 stream 缓冲。

### TC-U5 renderer delta 合并

- batch 内连续 text delta 合并。
- 非文本事件前后顺序保持。
- sessionId 或 streamId 不匹配事件被忽略。

### TC-U6 最终内容一致性

- 对所有 fixture 和 delta 模式，最终文本 SHA-256 与源 fixture 一致。
- 无重复、无缺失、无乱序。
- assistant_message reconciliation 不重复已流式内容。

### TC-U7 高频诊断日志聚合

- 连续产生至少 10,000 个 `toolcall_delta`。
- 不逐 delta 调用 console 或触发同步文件写入。
- `toolcall_start`、`toolcall_end`、最终工具参数摘要和错误仍可诊断。

### TC-U8 日志异步批量写入

- 高频 console 输入在调用栈内只入队，不执行同步磁盘 I/O。
- 时间阈值或字节阈值触发单次批量追加，并保持原始顺序。
- desktop 与 LLM channel、跨日文件和失败隔离语义保持不变。

### TC-U9 工具日志有界摘要

- 输入至少 1 MB 的命令、stdout 和 stderr。
- `START_CALL`、`END_CALL` 和 Agent `ToolResult` 日志均不包含完整正文。
- 日志包含原始长度、稳定哈希、退出码和有限预览。
- 成功与失败状态不因日志压缩发生变化。

### TC-U10 子进程输出有界缓冲

- 连续追加超过上限的 Unicode 输出。
- 内存保留内容不超过配置上限加固定截断标记。
- 同时保留头部和尾部诊断内容，并记录省略字符数。
- 未超过上限时内容逐字符一致。

### TC-U11 console 单次序列化

- Desktop 与 LLM 日志捕获同时启用时，每次 console 调用只执行一次参数序列化。
- 同一有界行写入 desktop channel，并按前缀选择性写入 LLM channel。
- 终端输出使用同一有界行，不再次展开原始大对象。

### TC-U12 main event-loop lag

- 注入可控时钟和 timer，模拟主进程调度延迟超过阈值。
- 告警包含 lag、内存摘要和活跃 Agent 阶段，但不包含消息或工具正文。
- 未超过阈值时不产生阻塞告警。

### TC-U13 Agent 阶段心跳

- Agent 活跃超过状态周期时输出 session、phase、phaseElapsedMs 和最近工具名。
- 阶段切换重置阶段持续时间，任务结束后从活动表清理。
- 无活跃 Agent 时不输出周期心跳。

### TC-U14 renderer 响应性事件

- BrowserWindow `unresponsive` 时记录窗口 ID、标题、URL 和活跃 Agent 摘要。
- 恢复时记录无响应持续时间。
- `render-process-gone` 记录 reason 与 exitCode，并在窗口关闭后清理监听状态。

### TC-U15 循环保护扫描门控

- 高频 `text_delta` 不调用重复尾部或近似文本扫描，也不修改流式正文。
- 同一次用户任务内两轮完整 Assistant 响应哈希相同，第二轮标记为重复。
- 完整响应不同不触发重复；新用户请求重置上一轮响应哈希。
- 重复完整响应由 Completion Guard 恢复或生成明确失败报告。

### TC-U16 通用批量打字机调度

- 单个包含多个字符的流式批次只立即显示首批字符，后续按时间预算逐批显示。
- 待显示内容积压增大时每批字符数自适应增加，10,000 字符的 React commit 次数远小于字符数。
- 批次边界不拆分 Unicode 代理对。
- 最终完成、错误或取消立即提交完整内容并清理 timer。
- 普通会话与 Persistent Agent 使用同一个 `StreamRenderScheduler`，接收缓冲不被部分渲染内容覆盖。

## 集成测试

### TC-I1 定向 IPC

- 三个 mock WebContents 中只有发起请求者收到流事件。
- 无关窗口不收到 batch、done 或 error。
- sender 销毁后不再发送且资源被清理。

### TC-I2 React 提交上限

- 输入至少 10,000 个小 delta。
- 首个非空内容立即显示首批字符，后续高频内容以自适应字符批次按时间窗显示。
- renderer commit 次数显著低于 delta 数量，并符合配置的最大频率。
- done 时立即提交最终内容。

### TC-I3 长流 Markdown 渲染

- 短内容按实时 Markdown 路径渲染。
- 长内容达到阈值后切换轻量流式视图。
- 完成后仅进行一次最终完整 GFM/代码高亮渲染。
- 最终表格、列表、代码块和链接结构正确。

### TC-I4 滚动行为

- 位于底部时流式内容合并跟随。
- 用户向上滚动后不强制拉回底部。
- 流式阶段不积累 smooth scroll 调用。
- 完成切换 Markdown 后滚动锚点保持合理。

### TC-I5 停止与错误

- 500 KB 流中途停止，200 ms 内状态反馈。
- 停止后迟到 delta 不更新 UI。
- 错误前缓冲文本可见，错误状态和 done 顺序正确。

### TC-I6 入口回归

- SkillDialog、普通 Agent、RoleAgent、项目 Agent 最终内容一致。
- 工具开始/结束、AskUserQuestion、artifact_changed 正常。
- Web/SSE fallback 的最终消息与 Electron 模式一致。

### TC-I7 Renderer 热路径日志

- Agent/Skill 长流提交期间不逐消息输出映射诊断日志。
- 10,000 个 delta 下 Project Agent 与普通 Agent 均受提交频率上限约束。

## 性能基准

### PERF-B1 100 KB 高频流

记录：

- delta 总数
- IPC 批次数
- renderer commit 次数
- Markdown 完整解析次数
- 50 ms 以上 long task 数量
- 最大 long task
- 首字时间和总完成时间

要求：最终内容正确，优化后完成时间不比基线恶化超过 10%，交互无持续阻塞。

### PERF-B2 500 KB 高频流

要求：

- 不出现持续 1 秒以上无响应。
- 最大单个 renderer long task 不超过 200 ms。
- 超过 50 ms 的 long task 数量有明确上限，并较基线显著下降。
- 停止反馈不超过 200 ms。
- IPC 批次数和 React commit 次数远低于 delta 数量。

具体阈值需在实施第一步记录硬件与基线后固化，禁止以“看起来更流畅”代替数据。

### PERF-B3 多窗体

- 打开主窗体、Skill 窗体和 Agent 窗体。
- 单窗体流式时，无关窗体 IPC handler/React commit 计数为零。
- 两个窗体并发流时，各自内容和 streamId 完全隔离。

## 验证命令

```bash
pnpm --filter @originos/core test -- stream
pnpm --filter @originos/desktop test -- agent-session stream-batcher
pnpm --filter @originos/web test -- ChatMessageList chat-message
pnpm --filter @originos/core build
pnpm --filter @originos/desktop build
pnpm --filter @originos/web lint
pnpm lint
```

性能 harness 的最终命令在实施时加入 package script，并回填本文件。

## 覆盖率目标

- batch、flush、顺序、取消和生命周期核心分支不低于 80%。
- Electron IPC sender、renderer adapter 和终态集成点 100%。
- Skill、Agent、RoleAgent 关键流式流程 100%。

## 测试结果

2026-07-27 自动化验证结果：

- Desktop 全量测试：6 个测试文件、45 个测试通过。
- 通用流式调度与去重测试：2 个测试文件、11 个测试通过。
- Markdown 流式/终态渲染测试：1 个测试文件、3 个测试通过。
- Web TypeScript 检查通过。
- Desktop TypeScript 构建通过。
- 500 KB 单字符中文流：最终内容一致，IPC batch 少于 100，测试耗时约 35-50 ms。
- Core 定向测试：3 个测试文件、8 个测试通过，覆盖事件合并、顺序、10,000 次更新调度、final flush 和 stream 隔离。
- Web 定向测试：2 个测试文件、5 个测试通过，覆盖长流轻量视图、完成态 Markdown 和表格恢复。
- Desktop build、Web type-check、修改文件 ESLint：通过。
- `desktop:dev` 冒烟：Next ready、Desktop watch 0 errors、Electron 主进程初始化成功。
- 全仓库 lint：0 errors，2774 个既有 warnings。
- Core Completion/日志测试：41 个测试通过；10,000 个 `toolcall_delta` 只产生聚合日志。
- 异步日志压力测试：10,000 行在调用栈内不触发磁盘追加，flush 后合并为一次有序写入。
- Completion Failure 传输测试：已验证恢复耗尽报告携带显式标记并覆盖先前计划文本。
- `desktop:dev` 冷启动验证：固定端口 3100，独立 `OriginOS CE Dev` profile；`/`、`/dock`、`/api/user-config` 均返回 200。
- 重复开发进程治理：增加单实例锁；验证期间发现并清理两个旧 workspace Electron 主进程。

剩余风险与人工验证：

- 尚未在真实 Electron renderer 中采集 100 KB/500 KB 的 Long Task、React commit 和停止反馈指标，因此 AC1、AC6、AC7 保持未完成。
- 尚未完成 Windows/macOS 安装包多窗体、Skill、普通 Agent、RoleAgent 和项目 Agent 的人工抽检，因此 AC9 保持未完成。
- Core 全量独立 type-check 被既有 `packages/core/src/lib/features/document/parsers.ts:95` 错误阻断；本次相关 Core 定向测试及 Desktop build 均通过。
- Windows 冷启动首次编译 `/` 实测约 38.6 秒；窗口现在等待 HTTP ready 后再创建，不再在编译期间显示空白或 `ERR_EMPTY_RESPONSE`。
- 2026-07-27 真实网页调研再次出现 Windows `desktop:dev` 无响应，日志显示多行 PowerShell 参数和 ToolResult 被多层重复展开；新增 TC-U9 至 TC-U11，Story 重新进入实施阶段。
- 第三轮定向验证：Core 2 个测试文件、53 项通过；Desktop 2 个测试文件、14 项通过；Desktop TypeScript build 通过。
- 大型工具结果日志已验证为长度、哈希和 1000 字符以内预览，不再展开完整正文。
- `execute_command` stdout/stderr 已验证使用头尾有界缓冲，默认每路最多保留 64 KB 加截断标记。
- console 捕获已验证 desktop/LLM 同时启用时只序列化一次；文件日志按 1 秒或 256 KB 异步批量 flush。
- 第四轮进程诊断验证：Desktop 3 个测试文件、17 项通过；覆盖 main lag、Agent 阶段心跳、活动清理、renderer 无响应/恢复/退出和异步日志；Desktop TypeScript build 通过。
- 完整 Turn 循环保护验证：Core 2 个测试文件、48 项通过；5,000 个 `text_delta` 不触发正文扫描，同任务完整响应重复可被 Completion Guard 捕获，新请求会重置比较基线；Desktop TypeScript build 通过。
- 流式首包验证：Core scheduler 3 项和 Desktop batcher 7 项通过；首个 delta 立即穿过 main IPC 与 renderer commit，后续 10,000 更新和 500 KB 内容仍保持有界合并；Desktop TypeScript build 通过。
- 修改文件 ESLint：0 errors；保留既有 warnings。
