# 需求文档 - Story OS.20

**Story：** 窗体会话历史切换与上下文恢复  
**版本：** 1.0  
**最后更新：** 2026-07-29

## 需求来源

- 用户反馈：所有窗体中的会话历史点击无效。
- 补充要求：进入历史会话后必须恢复历史会话上下文，而不只是显示消息。
- 现有实现：`SkillDialog`、`AgentDialogContent`、`usePiAgent`、
  `AgentSessionService` 和 Pi Agent Session persistence。

## 详细需求

### FR1：统一历史会话切换

Skill、Agent 与 RoleAgent 窗体必须通过同一会话切换语义处理历史条目。点击后
必须触发真实 Session restore，不得只更新本地 `activeSessionId`。

### FR2：恢复可见消息

恢复结果必须包含按原顺序排列的 user、assistant、tool 和 toolResult 消息。
内部 system prompt、thinking metadata 和隐藏 recovery 消息不得直接展示。

### FR3：恢复 Agent 执行上下文

切换必须恢复并校验：

- Session ID 与所属 project/entry；
- Agent 类型和 system prompt 引用；
- `projectContext`、CWD、outputDir；
- 该 Session 保存的 LLM config；
- Pi runtime 支持公开恢复的 branch、messages 和 extension context；
- 当前未完成状态能否安全恢复；不能恢复时必须显式降级或报错。

### FR4：原子切换与并发保护

切换期间旧 Session 不得继续接收输入。快速点击 A、B 两个历史会话时，仅 B
可以成为最终 active Session；A 的迟到响应必须被丢弃。

### FR5：失败可见且不破坏当前会话

目标 Session 不存在、归属不匹配、文件损坏或 runtime restore 失败时，保留
当前可用 Session 和消息，关闭加载状态并展示错误与重试入口。

### FR6：跨窗体一致性

同一 restore service/contract 必须服务 Skill、Agent 与 RoleAgent。UI 可以有
展示差异，但不得各自维护不同的 Session 恢复逻辑。

## 验收标准

### AC1：历史条目可以切换

**Given** 任一支持会话历史的窗体存在至少两个 Session  
**When** 用户点击非当前历史 Session  
**Then** 系统进入 switching 状态并恢复目标 Session  
**And** 目标条目成为选中状态，历史面板关闭。

### AC2：消息和上下文一致恢复

**Given** 历史 Session 保存了消息、project context、CWD 和模型配置  
**When** restore 成功  
**Then** UI 显示与持久化记录一致的可见消息  
**And** 下一轮模型调用使用目标 Session 的上下文、工作目录和配置。

### AC3：禁止跨 Session 串写

**Given** Session A 正在显示，用户切换到 Session B  
**When** 用户在 B 中发送消息  
**Then** 新消息只写入 B  
**And** A 的消息、updatedAt 和 runtime context 不被修改。

### AC4：并发切换最后请求生效

**Given** A 的 restore 尚未完成  
**When** 用户随后选择 B  
**Then** A 的结果被 request epoch/abort guard 丢弃  
**And** 最终 active Session 为 B。

### AC5：失败保留当前状态

**Given** 目标 Session 不存在、损坏或归属不匹配  
**When** 用户尝试切换  
**Then** 当前 Session 仍可见且可继续使用  
**And** 前台显示“会话恢复失败”及具体、脱敏的原因。

### AC6：不同窗体行为一致

**Given** Skill、Agent 和 RoleAgent 各自存在历史 Session  
**When** 分别执行历史切换  
**Then** 三类窗体均满足 AC1 至 AC5。

## 边界与异常

- 点击当前 Session：幂等，不重复 restore，不清空消息。
- 空消息 Session：成功恢复为空状态，不自动发送欢迎语。
- 已删除 Session：从列表移除并提示，不创建同 ID 新 Session。
- 正在流式生成：切换前先 abort/settle 当前流，迟到事件按 Session ID 丢弃。
- 活跃 tool call：首版不迁移进程内 tool promise；按 runtime 契约恢复为可解释状态。
- 超长历史：加载数据和渲染必须有界，不能造成窗体未响应。
- 关闭并重开窗体：能够再次选择并恢复同一历史 Session。
- Project/entry ownership 不匹配：拒绝恢复，禁止跨 Agent/Skill 读取。

## 依赖与非功能要求

- 依赖 `AgentSessionService` 的 list/get/create/update persistence。
- 依赖 Pi runtime 已公开的 Session reload/replay 能力；禁止解析私有 Session 格式。
- 不新增数据库，继续使用版本化本地 JSON/Session persistence。
- 切换操作 500ms 内必须出现加载反馈；普通历史消息首屏目标 1 秒内可见。
- 不在日志中输出完整消息正文、system prompt、凭据或文件内容。
- Core integration 不得依赖 Web/Desktop；Desktop 只负责 IPC 和 Electron 环境。

