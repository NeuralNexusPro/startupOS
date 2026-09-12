# 测试策略 - Story AG.2

**任务:** AG2-T1；**更新:** 2026-09-11

## 验收用例与证据

实现前已定义TC01–10；用户追加通知bug后先补TC11再实施。验证goal目标为通过Story AG.2 AG2-T1定义的case，包含测试限制、构建与交付闭环。所有持久化测试使用临时目录。

| 用例 | 场景 | 结果与证据 |
|---|---|---|
| TC01 | 原范围与规则下清零34处依赖违规 | 集成扫描866生产文件、0诊断、退出0；final-boundaries.log |
| TC02 | 原围栏允许/禁止导入、双CWD及失败退出 | 43案例×2CWD全部通过；final-selftest.log |
| TC03 | Web lint、类型检查与完整桌面构建 | lint 0errors/2917warnings；Web类型检查通过；desktop:build退出0；desktop-build-final.log |
| TC04 | Agent/Role/Project启动、保存、并发恢复及依赖缺失拒绝 | 新业务5例+Role/Project真实文件保存恢复2例通过；使用可控模型适配替身，未调用远端模型；真实skill/persistent worker冷启动补充验证 |
| TC05 | owner并发写入、flush/reload、错配拒绝、临时会话与Frozen Snapshot | business-boundaries双owner用例、runtime-restore重启快照2例、既有provider/observation用例通过 |
| TC06 | 旧记忆格式、空/元数据Markdown及配置缺失/损坏 | contracts74项及Core回归通过，格式保持兼容；配置损坏仍按原语义回退 |
| TC07 | 工具完整注册、重复初始化、scope、非法参数和路径授权 | 新业务用例与原工具组通过；真实read_document成功和越界拒绝；本体/定时非法输入拒绝 |
| TC08 | IPC类型兼容、编译worker真实加载/执行 | 完整Desktop编译通过；verify-agent-business-runtime脚本对skill/persistent均通过，先冷启动再检查registry，无预热掩盖 |
| TC09 | 工具三状态、名称、运行提示、空列表及调用方 | UI任务14例通过；最终组件与生命周期Hook2例通过 |
| TC10 | 既有记忆/认知/会话/工具/协作回归 | 扩展回归64文件723tests，708通过，15失败与修改前逐条一致、无新增；最后改动对应50用例全过 |
| TC11 | 通知中文技能/Agent/角色及继承角色owner进入真实渠道；非法ID拒绝 | 修复前4例失败，修复后Desktop通知流7例通过；含桌面组装最终共8例通过；Core渠道13文件43例通过 |

## 最终日志

以下路径前缀均为 `/private/tmp/originos-ag2-`：

- `final-boundaries.log`、`final-selftest.log`、`final-lint.log`
- `final-core-tests.log`：扩展回归，与`baseline-stable.log`的失败testname逐项比较，无新增。
- `final-added-tests.log`：最终业务/恢复/渠道15文件50tests全过。
- `final-web-tests.log`：最终Web2tests全过。
- `final-desktop-channel.log`：最终Desktop2文件8tests全过。
- `desktop-build-final.log`：完整桌面构建，包括18个worker运行时路径校验与根产物检查。
- `final-worker-smoke.log`：编译skill/persistent真实worker冷启动、工具执行和持久会话。
- 通知先红后绿证据另见 `/private/tmp/ag2-notification-red.log`、`ag2-notification-desktop.log`、`ag2-notification-core.log`。

## 基线失败与验证限制

修改前47文件635tests中620通过，15失败：capability-matcher评分12项、dag-executor HITL恢复3项。本次扩展回归保留相同失败，不宣称全仓测试全绿。

旧agent-spawner测试调用npx tsx及尝试下载Electron，当前本地环境不能完成；保存原日志，不以该测试证明worker成功。新增受控编译worker脚本覆盖实际启动、工具和关闭。Desktop组装测试原先因未mockElectron触发下载，已按既有测试方式隔离宿主后通过，业务组装保持真实。

未执行真实模型请求或人工GUI端到端通知点击。人工复核：退出旧应用，打开新构建；从通知分别打开中文技能与角色；确认初始消息正常、无CHANNEL_RUNTIME_FAILED；退出重开会话确认历史恢复。自动化已验证对应真实渠道和文件恢复链，但不覆盖远端模型服务可用性或所有操作系统；本轮只构建macOS arm64。

本命令不覆盖所有动态计算import、跨feature私有路径和全仓循环；辅助审查的新Core静态运行时import/export图未发现环，结果仅限tsconfig扫描范围。

## 最终应用包验收（2026-09-12）

实际产物：/Users/archersado/workspace/startupOS/release/mac-arm64/OriginOS CE.app。使用产物内 Electron 执行 verify-agent-business-runtime.js，读取 app.asar 中的真实 Core：skill/persistent 两类 worker 均通过冷启动、工具注册、路径授权、关闭，persistent 会话落盘通过，且服务端未加载 React。

日志：/private/tmp/originos-ag2-desktop-build-delivery.log、/private/tmp/originos-ag2-mac-pack-delivery.log、/private/tmp/originos-ag2-packaged-worker-delivery.log。最终 lint/边界/自测日志为 /private/tmp/originos-ag2-delivery-{lint,boundaries,selftest}.log。React 隔离修复的 27 项回归通过；原有 15 项协作测试失败仍按前文记录，不声明全仓测试通过。未进行真实远程 LLM 或人工 GUI 验证。本地测试包未签名/公证，不用于正式发布。

## AG2-T2 / TC12 旧会话恢复后继续发送

实现前验收：旧角色中文 ID、旧技能 skill-中文 ID、ASCII 助手均通过真实 ingress，保留 sessionId/sessionProjectId；显式元数据覆盖旧 agentType；真实项目行为不变，非法路径及项目 ID 仍被拒绝。先红后绿。随后运行 Desktop channel UI/compose、Core 渠道回归、lint、边界、自测、桌面构建及实际 ASAR worker 验证。人工步骤：退出旧版，打开新测试包，从定时任务通知打开旧角色/技能会话并发送；不自动调用真实 LLM。

AG2-T2 结果：Task a2cf514，红测 5 失败，修复后 Desktop 18 / Core Channel 43 项通过；Web/Desktop 类型通过；Proposal Desktop 编译和集成测试通过，866 文件零违规、检查器 43×2 自测通过、lint 无错误。日志 /private/tmp/originos-restored-{integrated,build,lint,boundaries,selftest}.log。实际应用包与 SENSE12-T2 一起交付验证，不声称人工通知或真实 LLM 测试通过。

## 联合交付验收（2026-09-12）

Desktop 3 个文件 26 项联合回归通过；完整 desktop:build、macOS arm64 本地打包成功。实际 app.asar 内旧角色/Skill/助手发送映射和真实 ingress 通过；skill/persistent worker 冷启动、业务工具和授权检查通过。架构扫描866文件0违规、自测43×2通过、lint0错误2917既有警告。日志 /private/tmp/originos-bugfix-{delivery-tests,desktop-build,mac-pack,asar-workers,asar-restored,lint,boundaries,selftest}.log。未调用真实LLM或自动触发用户规则。

产物：[OriginOS CE.app](</Users/archersado/workspace/startupOS/release/mac-arm64/OriginOS CE.app>)。退出旧安装版后打开此本地测试包。用户的 /Applications 安装版未自动替换。

## AG2-T3 / TC13 实施前验收：历史会话无响应

旧prompt保持pending → 真实Desktop ABORT → 恢复同会话发送，验证旧Agent取消、渠道流终结、串行锁释放、新回复到达。重复取消/无活动会话安全，其他会话隔离，旧事件迟到不污染新回复。源代码回归及实际编译/包内验证；不使用真实用户内容或远程模型。
