## Context
SENSE12-T6：感知中心嵌套列表作为组件渲染，store更新导致类型变化并重建表单。用户进一步明确仅事件页需要定时刷新。
## Goals / Non-Goals
配置页不定时刷新；仅事件页每5秒刷新，离开清理。首次进入、手动刷新及保存/启停后仍更新。任何必要store更新均保留当前表单输入与焦点；取消重开沿用原语义。
## Decisions
五个无Hook列表改为render辅助函数直接返回JSX，避免重建。SenseCenter按tab启停现有startRefreshing，复用其清理与引用计数，不新增计时器或状态存储。初次加载保持，顶部菜单改为首次load，不再维持轮询。独立窗体与顶部入口共用SenseCenter。
## Risks / Trade-offs
配置和健康页不自动轮询，用户可手动刷新。后台感知运行不受UI刷新策略影响。render辅助函数不得引入Hook。
## Migration Plan
UI Task修改SenseCenter、顶部page.tsx的刷新订阅及测试；验证非事件页无轮询、进入事件页刷新、离开停止、必要store更新不丢草稿和取消重开。通过类型/架构/构建后集成，无数据迁移。
