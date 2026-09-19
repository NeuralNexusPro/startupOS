# Proposal：将会话 Token 汇总移至窗体顶部

## 可追溯信息

- epic-id：M
- story-id：M.14
- task-id：M14-T7
- owner：Web 会话 UI
- 来源：`docs/specs/epic-M/story-M.14/`

## 动机

当前共享 `ChatMessageList` 将会话 Token 汇总渲染在消息列表末尾。汇总会随着内容滚出视野，且视觉上接近单条消息，无法作为窗体级会话状态快速查看。

## 变更内容

- 将现有会话级 Token 汇总从 `ChatMessageList` 移到其宿主窗体的消息区上方。
- 汇总继续由已有 `summarizeSessionTokenUsage` 从消息计算；不新增 store、持久化字段或数据链路。
- 保留按需展开的上下文估算，并在无真实 usage 的旧会话中不显示统计。
- Skill、访谈和 Agent 会话均通过共享组件入口获得一致的顶部汇总。

## 非目标

- 不修改 provider usage、IPC、会话 JSON 或协作成本统计。
- 不为每条消息显示 Token，也不在流式 delta 时更新。
- 不新增独立统计页面或配置项。

## Capabilities

### Modified Capabilities

- `agent-session-token-usage`：会话级 Token 汇总的位置改为消息窗体顶部。

## 影响

- packages：仅 `packages/web`。
- public APIs：`ChatMessageList` 增加可选顶部工具栏插槽，内部不再渲染 usage。
- persistence、IPC、platform packaging：无影响。
- 依赖：复用已完成的 `m14-token-usage-statistics` usage 类型和聚合函数。

## 上线方案

随 Web UI 发布。历史会话复用已有可选 usage 字段；缺失字段时不显示顶部统计。

## 回滚方案

回滚本次 Web 组件改动即可；会话数据和数据链路未变化。
