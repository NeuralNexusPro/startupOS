## 1. 来源与实施边界

- [x] 1.1 P1（平台集成角色，首先串行）：在Story文档记录三平台锁定SDK版本、可信描述／工具服务来源、权限查询、身份模式及幂等能力；通过CD01来源实证，未知项明确保留，不能用模拟目录代替。
- [x] 1.2 P2（Core角色，依赖P1，串行）：在core/modules/perception-runtime/plugins及公共类型增加可选目录／执行契约、schema校验与DataFile缓存；验证版本变化、主体隔离、撤权和旧插件兼容，提供测试日志。

## 2. 平台与Agent接线

- [x] 2.1 P3-W（企微集成角色，依赖P2）：仅修改perception-plugins/wecom，实现一次目录来源与SDK执行映射；CD01/03/06默认路径证据，不能将机器人凭据视为办公授权。
- [x] 2.2 P3-F（飞书集成角色，依赖P2）：仅修改perception-plugins/feishu，实现目录来源与执行映射；提交schema／授权及代表操作证据。
- [x] 2.3 P3-D（钉钉集成角色，依赖P2）：仅修改perception-plugins/dingtalk，实现目录来源与执行映射；验证SDK模块加载、权限和幂等边界。P3三个范围可独立推进；契约变化先回P2串行处理。
- [x] 2.4 P4（Agent/Desktop角色，依赖P2）：在core/features/agent、channel-runtime上下文及必要下层通用协议、Desktop代理接入按需发现／调用；CD02/04/05/07/10验证scope、主体绑定、危险操作和实际Worker代理，禁止下层反向依赖。
- [x] 2.5 P5（管理UI角色，依赖P2/P4接口稳定）：修改管理facade、Desktop IPC、Web sense-center，展示可用／待授权／同步失败及账号范围；CD08/09验证生命周期与草稿不丢失。

## 3. 验收与交付

- [x] 3.1 P6-A（验证角色，依赖P3–P5，串行）：执行Story testing.md CD01–CD10；至少一个平台在授权测试环境完成日程和待办闭环，三平台分别记录实际支持范围，未验证项不勾选完成；不擅自发送真实邀请或创建用户业务对象。
- [x] 3.2 P6-B（集成角色，依赖3.1）：运行受影响类型／测试、pnpm lint、pnpm lint:boundaries、检查器self-test、实际Desktop包与跨进程验证；补齐Story、AGENTS契约和changes，OpenSpec strict validation通过后按授权提交合并与清理。发布需对应授权，不将规划校验当作功能完成。

2026-09-15用户已授权开始实施；P1来源证据见Story implementation.md，未知授权项仍保留。实施角色与写入范围用于责任划分，按本会话用户提供的新规约执行；不预设强制子代理、额外验证goal或已获实施／发布批准。
