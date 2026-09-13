# 感知配置刷新后恢复 Email 修复

epic-id: SENSE
story-id: SENSE.12
task-id: SENSE12-T6
owner: Codex
来源：docs/specs/epic-SENSE/story-SENSE.12/

## Why
用户选择其他感知源后约5秒自动切回Email。已用真实组件/store/定时器复现：平台与草稿被清空，catalog请求重复。根因是SenseCenter内部定义的列表函数被作为React组件，父刷新导致其身份变化和子树重建。
## What Changes
- 将五个无Hook的内部列表函数作为普通render辅助函数调用，保留子组件身份。
- 后台健康刷新时保留平台选择、输入草稿、焦点、规则/权限表单和展开状态。
- 显式取消后重开保持正常初始化，继续正常后台刷新。
## Capabilities
### New Capabilities
- `perception-form-state`：感知中心后台刷新期间保留编辑状态。
### Modified Capabilities
无。
## Impact
仅Web SenseCenter及组件测试，无Core/平台API/数据格式/依赖变更。独立窗体与顶部管理入口共用此组件。
## 非目标与交付
不暂停轮询、不把未提交凭据写入store或localStorage、不改变配置保存语义。与企微流式修复独立实施；相关组件/store回归、构建和包内资源验收后合入dev。回滚本Task恢复旧渲染方式，无数据迁移。

用户追加范围：仅事件记录页维持5秒轮询；顶部菜单仅首次加载，配置页保留手动及操作后更新。
