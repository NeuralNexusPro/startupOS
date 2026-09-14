# SENSE.9 需求

1. 「感知中心」是与应用启动器、项目、角色、技能平行的顶层产品能力；不得注册进 `homeApps.ts`，也不能伪装成 Skill、Agent 或普通应用卡片。
2. 窗体通过 AppWindowManager 打开，最小 400×300，默认适合四区管理布局。
3. 感知源支持添加、测试、启停、重新绑定 secret 和查看平台专属健康字段。
4. 规则编辑器只允许白名单条件、已授权目标和显式 Skill ownership。
5. 事件记录展示 connector→event→rule→lease→result，正文默认折叠和脱敏。
6. dead-letter replay 显示权限与 HITL 影响并要求确认。

验收覆盖首次配置、连接失败、规则冲突、无授权目标、禁用、replay 和 secret 不回显。窗体 <1 秒渲染，列表分页，不阻塞主线程。
