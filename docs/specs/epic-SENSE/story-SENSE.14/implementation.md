# SENSE.14 实施计划

状态：本地实施与验收完成（用户于2026-09-15授权开始，待提交）；SENSE14-T1为一个独立交付Task，对应discover-im-sdk-capabilities Proposal。

| 工作包 | 依赖／顺序 | 写入范围 | 交付证据 |
|---|---|---|---|
| P1 来源与授权实证 | 首先串行 | 本Story文档及三平台来源说明 | 真实SDK锁定版本、可枚举描述来源、权限验证方式、支持矩阵；不能只mock目录 |
| P2 Host目录／授权契约 | P1后串行 | core/modules/perception-runtime/plugins及公共类型 | schema、版本、隔离、授权失效与目录缓存测试 |
| P3 平台适配 | P2后，各平台可独立推进 | perception-plugins/wecom、feishu、dingtalk各自目录 | 真实默认SDK／工具目录适配、受控transport调用证据、新操作无需改Core |
| P4 Agent按需工具／Worker | P2后；契约修改与P2串行 | core/features/agent工具、channel-runtime上下文、必要integrations协议、Desktop代理 | scope/HITL、身份绑定、多会话、实际Worker调用测试 |
| P5 管理交互 | P2/P4接口稳定后 | core管理facade、Desktop IPC、Web sense-center适配 | 状态、授权入口、刷新不丢草稿与原收发回归 |
| P6 联合验收 | P3–P5后串行 | 测试、构建资源、Story/AGENTS/changes | testing.md全部用例、门禁、实际包与授权环境验收；未验证项不得勾选 |

实施负责人待分配；不预设完成日期。所有证据记录平台版本与实际支持范围。来源不可枚举时先报告限制并调整对应平台方案，不退化成在Core新增一组手写日程／待办工具。

迁移为可选字段和独立缓存；旧插件、连接与会话无需迁移。版本发布前更新AGENTS公共契约与数据路径说明；能力开启不改变规则的原始消息透传。回滚停用办公能力，保留日志、审计和外部已创建对象。

## P1 来源核查（2026-09-15）

| 平台 | 仓库实际SDK | 已核实的官方机器描述来源 | 当前授权边界 |
|---|---|---|---|
| 企微 | @wecom/aibot-node-sdk 1.0.6 | @wecom/cli 1.2.1 npm包为原生CLI启动器；`calendar`／`todo`提供可枚举JSON Schema目录 | botId/secret仅证明机器人身份；CLI要求独立扫码授权，不能复用本机CLI个人账号给群成员执行 |
| 飞书 | @larksuiteoapi/node-sdk 1.73.3 + 官方lark-cli 1.0.95 | `lark-cli schema`提供逐操作inputSchema、scope、token模式与风险 | 办公调用使用独立用户OAuth profile；机器人凭据不复用，profile不能由模型选择 |
| 钉钉 | dingtalk-stream 2.1.7-beta.1 | 官方DingTalk Workspace CLI（`dws`）1.0.61提供`schema --all`机器目录，含CLI路径、参数、风险、副作用、确认与幂等信息 | `dws`使用独立用户OAuth和当前`corpId:userId` profile；机器人AppKey/Secret不参与办公授权，模型不能传profile |

证据来源：[飞书官方CLI](https://github.com/larksuite/cli)、[钉钉官方DWS](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli)、[企微官方CLI](https://github.com/WeComTeam/wecom-cli)。核查下载包并只读检查源码，没有读取用户凭据。

飞书`calendar.events.create`目录包含`params.idempotency_key`；不能将此能力推广到所有操作。钉钉已检查的日程/待办描述未提供通用幂等契约；未知写结果必须保留不确定态，不自动重放。钉钉部分object参数仅有文字示例，不能把粗粒度schema当完整验证。

三平台默认CLI目录协议均已验证；企业微信已验证授权查询、实际用户身份和创建／查询／撤销闭环。飞书、钉钉当前环境未授权，真实业务操作保持未验证。办公能力默认禁用。

下载包SHA-256（用于复现来源审查）：

- lark-mcp: `b5ec8ffee9861f4bb290d2de10b5609e1d548531670fa8a53b3ff8015e278e73`
- dingtalk-mcp（早期来源核查，未作为执行适配）：`7dd9da218e8f05f323d20522a909604fcf77521a1f90efbf0a20a9d57744c137`
- dingtalk-workspace-cli 1.0.61 npm包：`30ae68c5c73a6f398ab0e6f3fe9bdb60ee8479f8d03d419f5dcebd9d5641288f`
- wecom-cli: `a1daf808f39edace389fd3eb4ce38ee73fb925d16ef95277cb251279cb2577ec`

## P2 第一批实施记录（2026-09-15）

- Plugin SDK增加可选officeCapabilities provider、office-capabilities声明/审批；旧插件不要求实现。
- Host增加发现/调用入口，默认关闭；必须提供宿主策略、明确启用连接且审批插件能力。当前尚未接入Desktop生产策略及Agent工具。
- 描述有界JSON校验、拒绝重复operation及外部schema引用；按关键词最多返回20项摘要，指定name才返回schema。参数使用匹配目录的插件原生validator，Host拒绝额外调用字段。
- 授权每次读取；等待策略批准后再次检查授权与目录版本。未知权限、副作用或身份不匹配拒绝执行；actor/连接由宿主绑定策略传入，不从模型参数选取。
- 复用DataFile存储并增加异步事务方法，按文件串行，原子替换及双副本写入；目录/主体版本引用缓存不是授权事实源。调用记录仅存hash和状态，跨重启不重放pending/uncertain/completed，不保存参数、结果正文或凭据。
- 停用取消当前生命周期，旧调用返回时事务合并最新记录，避免覆盖重启后的新调用。
- 本批仅建立Core边界；后续P3–P6完成情况见下文记录。

## P3-W 企业微信适配（2026-09-16）

- 企业微信插件固定使用官方`@wecom/cli` 1.2.1，由官方启动器选择macOS、Linux或Windows原生包；没有引入通用MCP服务。
- 目录从`calendar --schema`、`todo --schema`及各叶子方法`--schema`动态生成。真实默认路径只读发现13项能力（日程7、待办6），新增官方方法无需修改Core注册代码。
- 办公能力默认关闭。`auth show --status`与`identity whoami`使用独立用户授权；botId/Secret不参与办公授权。身份只保存不可逆摘要，不记录CLI原文。
- 调用固定映射为官方CLI参数数组并禁用shell；拒绝模型提供连接、凭据、URL、方法或可执行文件。目录原生schema在插件边界内校验，未知副作用仍由Host拒绝。
- 当前授权环境状态为authorized，日程和待办scope均可发现。P6已使用无额外参与人的可删除测试对象完成日程创建／读取／取消，以及待办创建／读取／完成／删除，随后确认两者均不存在。

## P3-D 钉钉适配（2026-09-16）

- 钉钉插件使用官方`dws` 1.0.61契约。`schema --all`由CLI内置`--jq`只投影calendar/todo字段，单次输出从约39MB收敛到约124KB；当前真实二进制发现日历49项、待办44项，共93项，Core无需逐项注册。
- 插件从Schema生成参数白名单，固定CLI argv并禁用shell；只接受目录声明的字符串、数值、布尔和字符串数组，执行前检查必填、至少一项、互斥及共同必填约束。Host继续拒绝破坏性、未知副作用及未授权写入。
- 办公身份来自独立`dws auth`用户OAuth；插件读取当前精确profile、只向Host返回不可逆摘要，并在每次执行时由适配器固定`--profile`，模型不能选择profile、token、AppKey、URL、CLI路径或全局flag。Stream机器人凭据不参与办公授权。
- 当前机器没有已安装或已授权的`dws`账号，真实授权状态为`needs_authorization`；未执行钉钉业务读写。官方固定二进制通过真实Schema发现，插件29项回归、typecheck和build通过。桌面包暂不内置约75MB且带用户目录`postinstall`的npm发行包；用户安装官方`dws`后由已知路径或`ORIGINOS_DWS_PATH`接入。

## P3-F 飞书适配（2026-09-17）

- 飞书插件使用官方`larksuite/cli`的`lark-cli` 1.0.95；通过`calendar`／`task`帮助目录枚举资源和方法，再逐项读取`schema`的输入、scope、token模式和风险，无需在Core逐项注册。
- 真实macOS arm64二进制发现49项用户能力（日历18、任务31）。插件只保留支持user token的操作，输入使用原生schema校验，固定`--as user`和当前精确profile；模型不能选择profile、token、App ID/Secret或任意API路径。
- 授权来自独立`lark-cli auth login`用户OAuth，机器人App ID/Secret不参与办公调用。Host只得到身份摘要和scope；当前机器未配置profile，状态为`needs_authorization`，没有读取业务数据或执行写操作。
- 官方单平台二进制约45MB，本轮与钉钉相同，不内置外部CLI；用户安装后从`ORIGINOS_LARK_CLI_PATH`、用户目录、Homebrew或PATH发现。缺少CLI时管理状态显示同步失败，未登录时显示待授权。

## P4／P5完成记录（2026-09-16）

- Agent feature已注册固定的`discover_im_capabilities`和`invoke_im_capability`工具；连接、发送者、会话、目标资产和callId由调用级异步上下文绑定，不进入模型可选参数。非IM会话和过期调用返回安全不可用。
- Desktop Host已代理当前连接的发现／调用。授权策略读取连接配置中的发送者白名单；未显式列入的群成员和私聊发送者均不能使用本机办公账号。读取仅对白名单开放；写入还要求连接显式开启写操作且规则未要求HITL；破坏性操作保持拒绝。
- 协作Worker复用既有`tool_result`进程协议向宿主请求固定的两个能力工具；宿主按已接纳的会话绑定连接与actor，Worker不能传connector、凭据或授权主体。工具参数事件不写入协作事件存储，安全结果返回后继续原工具调用。
- 现有感知规则要求HITL时，办公写操作保持拒绝，不把规则级保护降格为模型自批；已开启写操作且规则明确无需HITL时才允许白名单主体执行。破坏性和未知副作用始终拒绝。本Story不新增另一套审批状态机。
- Sense Center沿用manifest动态表单，企业微信增加办公能力开关、发送者ID白名单和写操作开关。Desktop修复provision部分设置覆盖整份表单的问题，插件规范化字段与办公配置现在会合并保存。
- Desktop IPC按连接返回可用、待授权、同步失败或未启用状态；Sense Center展示能力数、用户／应用授权模式、白名单人数和读写范围，不返回账号标识。能力状态仅在连接版本变化或手动刷新时读取，不跟随事件页的5秒轮询。
- 企业微信CLI及当前平台原生包已纳入Electron打包，原生文件从`app.asar.unpacked`执行；macOS arm64实际未签名应用包校验通过，Windows校验器和fixture已增加CLI文件门禁。
- P4已完成固定工具、调用级绑定、Worker跨进程代理和风险策略验证；P5已完成管理状态、配置范围及无新增轮询的UI验证。P6已在企业微信授权环境完成真实日程和待办闭环；飞书、钉钉真实业务操作仍明确为未验证。
