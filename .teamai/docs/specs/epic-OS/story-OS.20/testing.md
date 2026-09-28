# 测试文档 - Story OS.20

**Story：** 窗体会话历史切换与上下文恢复  
**版本：** 1.0  
**最后更新：** 2026-07-29

## 测试目标

验证所有支持会话历史的窗体能够切换并恢复同一 canonical Session 的消息和
Agent 执行上下文，同时避免跨 Session 串写、迟到响应覆盖和失败静默。

## Fixtures

- Session A/B：不同消息、project context、CWD、outputDir 和 LLM config。
- 空消息 Session。
- 缺失、损坏、旧 schema 和 ownership 不匹配 Session。
- 可控 restore deferred promise，用于构造 A 后 B 的乱序完成。
- 可控流式事件源，用于构造切换后的旧 Session 迟到事件。
- 长历史：至少 1,000 条可见消息和 tool result 摘要。

## 单元测试

### TC-U1 restore 快照映射（P0）

- StoredSession 正确映射到 display messages 和 context。
- system/thinking/内部 recovery 内容不进入展示 DTO。
- CWD、outputDir、Agent 类型和 LLM config 不丢失。
- 未知 schema 和损坏数据返回结构化错误。

### TC-U2 ownership（P0）

- Session 与 project/entry 匹配时允许恢复。
- 跨 Skill、跨 Agent、跨 project 的 Session 被拒绝。
- 拒绝发生在消息正文返回 renderer 之前。

### TC-U3 epoch 与迟到响应（P0）

- A restore 未完成时选择 B，B 成功后 A 的迟到结果被丢弃。
- 点击当前 Session 不增加 epoch、不重复 restore。
- restore abort 后不会提交部分 state。

### TC-U4 消息事件隔离（P0）

- 切换到 B 后，A 的 stream delta/end 事件不进入 B。
- B 的下一条消息只追加到 B。
- 旧 subscription 被清理且不会重复消费。

## 集成测试

### TC-I1 existing Session restore（P0）

- Session Get/restore 返回历史消息和上下文。
- AgentManager 重绑目标 Session，而不是创建同 ID 空 Session。
- restore 后调用模型时 history message count、CWD 和 config 与 B 一致。

### TC-I2 Skill 窗体（P0）

- 点击 Skill 历史条目进入 switching，随后显示目标历史。
- 不自动发送欢迎消息。
- 新消息写入目标 Skill Session。

### TC-I3 Agent/RoleAgent 窗体（P0）

- `isInitialized=true` 时选择历史记录仍会 restore。
- Agent 和 RoleAgent 使用同一 restore action。
- RoleAgent 的角色上下文、工作目录和历史消息同时恢复。

### TC-I4 失败恢复（P0）

- NOT_FOUND、OWNERSHIP_MISMATCH、CORRUPT_SESSION 和 RESTORE_FAILED
  均在前台可见。
- 当前 Session 和消息保持不变。
- loading/input disabled 状态总能结束。

### TC-I5 新建与删除回归（P1）

- 新建会话为空且不继承历史 context。
- 删除按钮不触发条目 restore。
- 删除当前 Session 后创建新 Session；删除非当前 Session 不影响当前上下文。

## E2E 测试

### TC-E1 三类窗体历史切换（P0）

在 Electron desktop fixture 中分别打开 Skill、Agent、RoleAgent 窗体：

1. 创建并保存 Session A、B；
2. 从 A 点击 B；
3. 验证 B 历史消息、选中状态和输入可用；
4. 发送新消息；
5. 关闭并重开窗体，再次恢复 B；
6. 验证 A 未被修改。

### TC-E2 快速连续切换（P0）

依次点击 A、B、C，并人为让响应按 C、A、B 返回。最终只显示 C，输入消息只写
入 C，页面无未处理 Promise 或 React state warning。

### TC-E3 长历史性能（P1）

- 点击后 500ms 内出现 switching 反馈。
- 1,000 条消息首屏目标 1 秒内可见。
- 切换和滚动期间主线程不得出现持续 1 秒以上卡顿。
- 内存不因往返切换持续线性增长。

## 回归矩阵

- `usePiAgent` hook tests。
- Agent Session service/list/get/create/update tests。
- SkillDialog 与 AgentDialogContent component tests。
- Agent/RoleAgent Session history、stream render 和 completion guard tests。
- Windows desktop development smoke。
- `pnpm lint`、`pnpm type-check` 和架构围栏。

## 自动化验证 Goal

实现完成后必须创建 Goal：

> 通过 Story OS.20 testing.md 中定义的测试 case，证明 Skill、Agent 与
> RoleAgent 窗体可以恢复历史 Session 的消息和执行上下文，且不存在跨 Session
> 串写、迟到覆盖或无声失败。

Goal 输出必须把 AC1-AC6 映射到测试命令、结果和 Evidence；无法自动化的项目
需说明人工步骤和剩余风险。

