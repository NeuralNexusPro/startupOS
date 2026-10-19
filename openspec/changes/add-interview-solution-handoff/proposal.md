# Proposal

## Why

项目访谈完成后当前只在业务模型面板显示“已完成”，会话区没有明确说明访谈已经结束，也没有进入下一阶段的操作入口，用户难以判断下一步。需要把访谈收尾与解决方案设计连接成连续的产品流程。

## What Changes

- 当 canonical 本体已具备概念、关系和已发布的业务行为定义，且不存在单据字段缺口时，将访谈识别为已完成。
- 在访谈回复区末尾显示“访谈已完成”的系统收尾卡片，并推荐进入解决方案设计。
- 收尾卡片提供“进入解决方案设计”按钮，直接打开当前项目的解决方案设计窗口。
- 完成状态从 canonical 数据和可信发布结果派生，不通过匹配模型回复文本判断。

**非目标：** 不自动关闭访谈窗口，不自动启动解决方案 Agent，不修改历史消息，不放宽行为草稿的可信确认边界。

## Capabilities

### New Capabilities

- `interview-solution-handoff`: 定义项目访谈完成判定、用户可见的收尾提示及进入解决方案设计的交互入口。

### Modified Capabilities

无。

## Impact

- **epic-id**：P2；**story-id**：P2.10；**task-id**：P2.10-T1；**owner**：项目访谈与解决方案设计；**来源**：`docs/specs/epic-P2/`。
- 影响 `packages/web/src/components/interview/` 的访谈窗口和会话展示，以及 `packages/core/src/lib/integrations/pi-agent/project-agent/` 的访谈收尾提示；复用现有 `AppWindowManager` 与 `SolutionDesign`，不新增 IPC、持久化格式或依赖。
- 依赖 canonical ontology、行为草稿可信发布边界和现有解决方案窗口入口。
- 上线后已完成访谈在重新打开时也会显示收尾入口；回滚只需移除完成判定和收尾卡片，不影响本体、会话或解决方案数据。
