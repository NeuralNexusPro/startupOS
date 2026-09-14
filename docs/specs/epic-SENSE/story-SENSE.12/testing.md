# SENSE.12 测试

自动化验证 Goal：通过 SENSE.12 的 Plugin Contract、Host 生命周期、声明式配置、安全隔离和四渠道迁移用例。

| ID | 层级 | 场景 | 预期 |
|---|---|---|---|
| S12-UT-01 | Core | manifest/schema 边界 | 合法注册；非法版本、路径、字段、capability 拒绝 |
| S12-UT-02 | Core | 权限 context | 只能调用声明且获批的 Port |
| S12-IT-01 | Host | discover/start/stop/restart | 幂等，无 timer/socket 泄漏 |
| S12-ISO-01 | Host | 单插件崩溃 | 其他插件继续，健康和审计脱敏 |
| S12-SEC-01 | Desktop | 四插件 Secret | 仅经 IPC/safeStorage，配置/日志/响应不可检索 |
| S12-UI-01 | Web | 四 schema 渲染 | 无平台条件组件，字段、错误、可访问性正确 |
| S12-UI-02 | Web/Core | 连接器范围目标授权 | 创建规则时只展示允许当前连接器的目标；为同一目标追加连接器授权时合并而非覆盖已有授权；不匹配的规则在保存阶段拒绝 |
| S12-MIG-01 | Core | 旧配置迁移 | ID/source/enabled/secret/cursor/rule 保持且幂等 |
| S12-PLG-01 | Plugin | Email | 增量、正文和故障语义保持 |
| S12-STATE-01 | Core/Desktop | 插件私有状态 | Email 游标仅能经按 plugin/connector/key 隔离的 State Port 读写，拒绝路径穿越和跨连接器访问 |
| S12-PLG-02 | Plugin | WeCom | 消息、重连、去重保持；使用原始 SDK frame 将本次目标执行的全部 Assistant 文本按序回复，且只在末段结束 stream |
| S12-PLG-03 | Plugin | Feishu | WebSocket 入站保持；Agent `text_delta` 通过官方 SDK Markdown CardKit 节流流式更新，完成态收口；无 delta 的 Markdown 回复以卡片渲染；CardKit 失败降级为普通文本且回复不丢失 |
| S12-PLG-04 | Plugin | DingTalk | 认证、回调、ACK 保持 |
| S12-PKG-01 | Packaging | Windows/macOS | bundled catalog 与依赖完整 |
| S12-DEP-01 | Architecture | lint/madge/import scan | 无循环、反向依赖、平台分支 |

执行 Core/Desktop/Web/四插件 Vitest、typecheck、lint、循环依赖、Windows 打包和脚本化验收。真实平台测试记录人工步骤、脱敏证据和风险。实施完成后必须创建并完成本 Story 自动化验证 Goal。

## 2026-09-04 企微首插件验证

- Core Plugin Host：6 项测试通过；企微既有协议回归：6 项通过。
- WeCom plugin：manifest、文本/语音归一化、Secret Port、socket 生命周期共 6 项通过。
- Core/Web typecheck 与 Desktop build 通过；相关 ESLint 0 error（保留既有 warning）；`git diff --check` 通过。
- 依赖扫描确认通用 Host/Registry 无渠道名称分支，企微官方 SDK 仅由 `@originos/perception-plugin-wecom` 持有；Electron 打包清单显式包含插件和 SDK。
- 尚未使用真实 Bot ID/Secret 联机，Windows 打包态和企微服务端连接作为 S12-T7 人工/打包验收剩余项。

## 2026-09-07 飞书插件验证

- 飞书插件覆盖受控 manifest、官方 SDK WebSocket 生命周期、自动重连健康、消息归一化、事件提交和原消息双工回复。
- 插件不再导入 Core 飞书 Connector；平台逻辑只依赖 Core 公共 Plugin SDK。
- 飞书配置表单测试通过；飞书插件 WebSocket、Markdown 和流式卡片专项 7 项通过。
- 已移除默认 Webhook 回环桥和 Verification Token/Encrypt Key 配置；桌面模式无需公网域名。
- 真实飞书 App ID/App Secret 尚未联机；仍需在飞书后台选择长连接、订阅 `im.message.receive_v1`、授予消息权限并发布应用。

## 2026-09-07 飞书流式 Markdown 验收补充

- Agent delta 必须在目标执行期间进入同一张飞书 Markdown 卡片，`completed` 后关闭流式状态。
- 最终 Assistant 消息不得与已流式输出重复发送；没有 delta 时直接发送 Markdown 卡片。
- CardKit 创建或更新失败时，必须使用完整累积文本回退到普通文本回复。

## Email 插件迁移验收补充

- 首次启用以邮箱当前 UID 头为基线，不回放历史邮件；后续仅提交增量邮件。
- UIDVALIDITY 改变时安全重置游标；正文、主题、发送者和受控附件引用保持现有语义。
- 凭据只经 Credential Port，游标只经隔离 State Port；插件不得直接读写 OriginOS 数据目录。
- 停用或停止插件后取消轮询，不遗留 timer；单次 IMAP 失败只更新脱敏健康状态，下轮可恢复。

## 2026-09-07 S12-T3 声明式配置验证

- Core Host provisioning 测试覆盖 plugin provision 调用、权限裁剪及无 provision 插件的通用回退。
- Web 表单只读取 manifest `configurationSchema`，覆盖 text/password/number/boolean/select，并验证敏感字段与普通 settings 分离后经统一 IPC 提交。
- Email 与 WeCom 插件测试覆盖凭据 Port；Email 在写入凭据前执行 IMAP 连接验证，WeCom 保存兼容运行时的 transport 配置。
- 已删除 Email、WeCom、Feishu 的专用 provisioning IPC、Desktop service 与 Web service，静态扫描无旧通道引用。
- Email 插件已内聚配置类型与校验，编译产物不再包含对 Core Email integration 源码的运行时导入；覆盖 Windows Electron `ERR_MODULE_NOT_FOUND` 回归。

## SENSE12-T2 邮箱启用回归（实施前）

1. 成功插件provision → 保存配置 → setEnabled通过。
2. 认证/邮箱打开失败，不生成验证记录、不保存新配置。
3. host/username改变后旧记录拒绝；缺记录旧配置拒绝，重新验证后通过。
4. 非email插件行为不变；无凭据泄漏。运行相关Desktop/Core/Email测试、lint/边界/自测与包内加载验证。

SENSE12-T2 结果（2026-09-12）：真实 Email plugin → Core Host → Desktop IPC → ConfigStore 启用链 8 项回归通过（修复前准确复现 2 失败）；Desktop 类型检查通过。认证/邮箱失败不保存，host/username变更拒绝旧记录，缺记录旧配置重验证后启用，失败重绑定不覆盖已有配置，非邮件插件保持行为。日志 /private/tmp/email-provision-{red,green,types,lint,boundaries,selftest}.log。

本地 QQ 排查：TLS、IMAP login、只读 INBOX 打开实测成功；原配置缺 testReceipt。对 qq 连接重新真实验证且确认配置期间未变化后，经原子 ConfigStore 补验证记录并通过 validateMailActivation；保留原启用状态和凭据引用，不读取邮件正文，不在代码或文档保存授权码。另一条重复连接不修改。尚未声明实际轮询或自动触发已验收。

## 联合交付验收（2026-09-12）

Desktop 3 个文件 26 项联合回归通过；完整 desktop:build、macOS arm64 本地打包成功。实际 app.asar 内旧角色/Skill/助手发送映射和真实 ingress 通过；skill/persistent worker 冷启动、业务工具和授权检查通过。架构扫描866文件0违规、自测43×2通过、lint0错误2917既有警告。日志 /private/tmp/originos-bugfix-{delivery-tests,desktop-build,mac-pack,asar-workers,asar-restored,lint,boundaries,selftest}.log。未调用真实LLM或自动触发用户规则。

产物：[OriginOS CE.app](</Users/archersado/workspace/startupOS/release/mac-arm64/OriginOS CE.app>)。退出旧安装版后打开此本地测试包。用户的 /Applications 安装版未自动替换。

## SENSE12-T3 实施前验收：配置和健康热更新

- 已启动连接重绑定后在5秒扫描前启用：下一轮stop旧、start新；同secretRef但updatedAt变化也生效。
- 首次新增启用下一轮启动，未变配置不重复启动；停用停止；失败后可重试。
- 慢启动跨多个扫描不重复启动，服务停止时未完成启动不得遗留实例。
- 感知中心和顶部状态自动反映后台从未连接到健康；后台刷新不清空用户操作错误或闪烁加载；卸载清理。
- 完成相关Desktop/Web回归、类型检查、lint、边界、自测，构建并验证真实应用包。

## SENSE12-T3 集成结果（2026-09-12）

首次新增启用在原ASAR下一轮扫描可正常启动，主要确定问题是UI健康快照不自动刷新；热重绑定和停止慢启动另有真实缺陷。runtime提交cd065cb，UI分支2f2a38b：运行时按版本停旧启新、销毁后不留实例；顶部与独立感知窗体共享刷新，等待首个健康报告不误判断开。Task Desktop13 / Web24项通过；父代理联合Desktop13 / Web23项通过、完整desktop:build通过、866文件零违规、43×2自测通过、lint0错误2935警告。日志 /private/tmp/originos-sense-live-{desktop-tests,web-tests,build,lint,boundaries,selftest}.log。实际包热更新验收随联合交付补齐。


## SENSE12-T3 最终交付验收（2026-09-13）

源码已合入 dev（e39dc62）。Desktop 13 项和 Web 23 项相关回归通过；最终完整 desktop:build 通过，架构扫描 866 个生产文件零违规，自测 43×2 通过，lint 为 0 错误、2935 个既有警告。

实际 macOS arm64 包内验证通过：首次新增启用在下一轮扫描启动、同凭据引用的新版本重连、停用停止，全程无需重启；真实 skill/persistent worker 冷启动、工具授权和关闭通过。脚本使用临时数据和模拟平台启动，不连接真实邮箱或发送外部消息。UI 自动刷新由真实组件与 store 集成测试验证；慢启动跨扫描与停止交错由宿主回归验证。

测试包：`/Users/archersado/workspace/startupOS/release/sense-live-config-20260913/mac-arm64/OriginOS CE.app`。构建与验证日志：`/private/tmp/originos-sense-final-{build,pack-clean,asar-live,asar-worker,lint,boundaries,selftest}.log`；相关回归见前述 sense-live 日志。

本轮未进行人工 GUI 或真实平台联机验证；人工复核为打开本测试包，首次新增并启用连接，等待后台启动及下一次健康刷新，确认无需重启。Windows 和其他 Story Task 不属于本修复验收。该包为未签名、公证的本地测试包。

## SENSE12-T4 实施前验收：当前 IM 会话文件回传
| 用例 | 条件与预期 | 自动化证据 |
|---|---|---|
| TC1 | 可信工作目录普通文件发送；真实确认后工具成功 | 工具+Host模拟回执 |
| TC2 | 越界/符号链接逃逸/目录/空文件拒绝 | 文件系统临时目录 |
| TC3 | 大于20_000_000字节、读取时增长仍硬限 | 受限读取测试 |
| TC4 | 无IM上下文/缺目录/已结束/取消拒绝；不接受收件人参数 | 工具输入与lease测试 |
| TC5 | 并发不同session、同session排队仍目录/收件人隔离 | 真实串行渠道及fan-out集成 |
| TC6 | 上传/发送失败与超时不假报成功，不自动盲重发 | Host+SDK失败模拟 |
| TC7 | 同replyHandle/toolCallId已成功或并发重复只发送一次 | 真实回执存储+in-flight测试 |
| TC8 | 企微uploadMedia/replyMedia、飞书file SDK参数正确；旧文本保留；停止期间上传完不继续发 | 各插件SDK模拟 |
| TC9 | 钉钉token+multipart+群/单聊sampleFile，staffId正确；失败名单/格式限制/20MB生效 | 固定官方接口HTTP模拟 |
| TC10 | 文件字节不进入Flow、聊天历史、持久化回执；未声明outbound-files不接受文件注册 | SDK Host协议测试 |
| TC11 | 事件落盘后ACK；重复落盘也ACK不再路由；落盘失败不ACK，ACK异常不丢路由 | Host+钉钉接纳集成 |
| TC12 | 钉钉真实SDK握手中停止无未处理error/挂起；注册后才healthy，断开重连/停止清理句柄 | 发布SDK与受控WS测试 |
| TC13 | 打包内新工具注册、共享链路、三插件文件能力可载入；相关既有业务worker/文本回归 | 实际ASAR脚本+构建 |
测试命令：对应 Core/Desktop/三个插件 Vitest、类型检查；pnpm lint、pnpm lint:boundaries、node scripts/check-architecture-boundaries.cjs --self-test；pnpm desktop:build 与 macOS arm64 本地包。
测试使用临时文件和模拟平台，不发真实消息或文件。人工：配置平台凭据及机器人权限，在三平台分别请求生成PDF并发回，检查附件可下载且内容一致；钉钉分别测群与单聊、未授权和格式拒绝。未联机项记录限制，不将模拟成功宣称真实收件人已收到。

## SENSE12-T4 最终验收（2026-09-13）

相关自动化87项通过：Core29、Desktop5、Email3、企微15、飞书14、钉钉21。TC1–7/10由工具、真实串行渠道与fan-out、Host回执/能力测试覆盖；TC8由两平台官方SDK参数与中止测试覆盖；TC9/11/12由钉钉HTTP、接纳回调、终态及真实发布SDK受控传输测试覆盖。上传后中止、旧注册替换、并发重入、部分正文后的失败/取消提示均包含在回归中。

TC13通过实际macOS arm64 ASAR验收：业务初始化注册send_file，真实编译工具→共享ALS→Desktop回复服务→模拟平台确认，重复调用只投递一次，过期上下文拒绝；三平台文件能力和SDK均从包内加载，钉钉CJS与ESM入口都通过。真实skill/persistent worker冷启动、send_file工具注册、路径授权和关闭通过。完整desktop:build及electron-builder本地打包退出0；lint0错误2966个既有警告，869生产文件架构扫描零违规，自测43×2通过，OpenSpec严格校验通过。Next构建中的既有node:os/node:path诊断与上一测试包一致，未阻断构建。

测试包：`/Users/archersado/workspace/startupOS/release/im-file-replies-20260913/mac-arm64/OriginOS CE.app`。日志：`/private/tmp/im-file-final-{core,desktop,plugins,dingtalk,routing,build,pack,lint,boundaries,selftest,spec}.log`；包验收`/private/tmp/im-file-asar-{smoke,worker}.log`。可执行包验收脚本：`/private/tmp/originos-verify-im-file-package.cjs`、`/private/tmp/originos-verify-im-file-worker.cjs`，以本包Electron设置`ELECTRON_RUN_AS_NODE=1`运行，参数分别为本包app.asar及其dist-electron/core/src。

限制：未对真实平台账号发送文件，模拟回执不代表真实收件人已收到；尚未人工验证平台权限、企业策略或收件端下载。人工复核：从本测试包启用已配置连接，在企微/飞书会话请求生成PDF并发回，下载确认内容；钉钉先配置Client ID、Client Secret、机器人编码、Stream模式与发送权限，分别从群聊和单聊请求同样操作，并验证不支持格式提示生成ZIP。单文件上限20_000_000字节；钉钉文件格式为xlsx/pdf/zip/rar/doc/docx。测试包未签名/公证；未验证Windows。本轮不会自动发送所有资产，也未修改独立待处理的企微流式排队算法。

## SENSE12-T5 实施前验收：企微流式积压

| 用例 | 预期 |
|---|---|
| TC1 | 首片不新增timer等待；ACK期间已积累的96片可合并，最终全文正确 |
| TC2 | HITL/accepted/assistant_message/complete/error/不同flow-port-kind都是顺序屏障，不越过内部artifact |
| TC3 | 合并后每个原packetId保留真实成功/失败/attempt；已成功包跳过，且不加入新组 |
| TC4 | 重试组内容稳定、有最大次数；部分写盘失败不重发已确认网络请求 |
| TC5 | 源yield后throw先处理已产出文本，再传播错误；提前结束触发源清理，无假completed |
| TC6 | 最多32片一组、有界预取；被阻塞时不无限拉取，不声称整个fan-out严格32驻留 |
| TC7 | 企微ACK失败重试无重复追加；覆盖式事件与终态正确；文件回复、飞书与钉钉回归 |
| TC8 | 旧新实际ASAR相同96片+全文+完成、25ms模拟ACK：旧98请求/2633ms；新请求<=12且完成时间<旧50%，98真实回执/最终文字相同；完整构建/worker/文件回传包验收通过 |

测试使用模拟ACK和临时回执，不发送真实IM；人工打开新包在企微请求较长回答，观察边生成边更新及模型结束后的尾延迟。真实网络/平台限流/模型首字时延不由该修复保证。测试命令为Core dispatcher与企微Vitest、三平台回归、Desktop类型、lint/boundaries/selftest、desktop:build及实际包/private/tmp/originos-stream-benchmark.cjs。
## SENSE12-T6 实施前验收：感知表单刷新重置

- TC1：真实SenseCenter/ConnectorForm/store，选非email、填连接ID与账号/凭据、保持输入焦点，推进5秒后台刷新后选择、草稿、焦点和同一表单节点保留，插件目录不重复请求。
- TC2：后台刷新仍更新健康/连接数据，未停止轮询；独立窗体和顶部管理入口共用修复。
- TC3：目标权限和规则编辑中的草稿/步骤在后台刷新后保留；同根列表不重建。
- TC4：显式取消/重开按原默认值初始化；既有sense-center与perceptionStore回归通过，Web类型/lint/边界/自测和Web构建通过。

红证据/private/tmp/perception-selection-red.log：5秒后dingtalk→email、草稿清空、catalog调用2次。回归使用模拟API和真实store，不写用户配置或发真实消息。人工在新包配置窗体选择企微/飞书/钉钉并输入未保存字段，等待10秒验证选择和输入仍在。新包资源验收随流式修复的联合桌面构建记录。

### SENSE12-T6 用户追加：仅事件记录页自动刷新

以下用例更新上方 TC1–3 中感知中心各页默认轮询的假设：
- TC5：感知中心首次加载一次；感知源、目标权限、规则及健康配置页不主动创建5秒轮询。配置页推进5秒无新增请求。
- TC6：切到事件记录页订阅既有5秒刷新并更新事件；离开事件页或卸载清理本页订阅。已有其他消费者订阅不被误停。
- TC7：配置保存/启停后的既有load保留；通过明确store静默刷新模拟外部更新，TC1/TC3的选择、草稿、焦点、同DOM和catalog单次加载仍通过。显式取消重开按原默认值初始化。
- TC8：顶部状态栏首次使用load读取感知状态，不再订阅定时刷新；其一秒时钟更新不触发感知请求。当前只有事件记录页持有自动刷新订阅，顶部仍展示共享store的后续状态更新。

## SENSE12-T6 最终验收（2026-09-13）
32项感知中心回归通过：非事件页不轮询、事件页5秒刷新及离开/卸载清理、共享订阅隔离、必要store更新保留平台/草稿/焦点/DOM、取消重开。顶部菜单经调用点审查只首次load，唯一生产定时刷新订阅位于事件页。Web类型、Web生产构建、lint0错误2966既有警告、869文件零架构诊断及自测43×2、OpenSpec严格校验通过。日志/private/tmp/form-reset-final-{tests,build,lint,boundaries,selftest,spec}.log。构建已改用独立依赖，主工作区文件恢复后git状态干净。联合桌面测试包随SENSE12-T5验收记录。

## SENSE12-T5/T6 联合桌面验收（2026-09-13）

136项回归通过：Core41、Desktop5、Email3、企微20、飞书14、钉钉21、Web32。完整desktop:build和macOS arm64打包通过。实际包使用25ms模拟ACK、96文本片+正文/完成事件：旧包98请求2633ms，新包5请求167ms，首发5ms，98条原始回执均成功且正文一致；这是模拟确认延迟，不代表真实平台网络测速。实际ASAR的send_file注册/ALS/Host/重复及过期上下文、三平台SDK加载，skill/persistent worker冷启动/路径授权/关闭全部通过。147个打包Web静态文件与已验证构建哈希一致。

lint0错误2966既有警告，架构869文件0诊断，自测43×2和OpenSpec strict通过。日志/private/tmp/perception-stream-final-{core,desktop,plugins,web,build,pack,lint,boundaries,selftest,spec}.log及/private/tmp/perception-stream-asar-{benchmark,file,worker}.log；旧对照/private/tmp/stream-baseline-asar.log。测试脚本/private/tmp/originos-stream-benchmark.cjs、originos-verify-im-file-package.cjs、originos-verify-im-file-worker.cjs。

测试包：/Users/archersado/workspace/startupOS/release/perception-stream-fixes-20260913/mac-arm64/OriginOS CE.app。退出旧应用后打开此包；配置页等待10秒应保留平台与草稿，仅事件页自动刷新；企微发起长回复观察更新及结束速度。未发送真实IM消息/文件，真实平台收件、权限及网络仍需人工验证，Windows未验证。本地包未签名公证。其他Story未完成工作保持独立跟踪。

## SENSE12-T7：插件独立日志（2026-09-14，已执行）

| Case / AC | Given / When | Then |
|---|---|---|
| PL01 / AC1 | 四插件、同插件多连接并发记录 | 仅写各自plugins目录的每日日志，归属正确且desktop/llm无重复插件诊断 |
| PL02 / AC1 | 默认SDK工厂鉴权、DNS、重连或回复失败 | 独立日志有安全原因，默认console不再泄漏；不能只mock工厂 |
| PL03 / AC2 | prompt或回复投递失败 | 可区分执行/投递阶段，关联event/session/diagnosticId；IM仍安全，终态不重复 |
| PL04 / AC2 | resolve、用户/助手消息持久化失败 | 会话缺失也能定位；失败清理资源，无假成功或未处理拒绝 |
| PL05 / AC3 | 错误含嵌套凭据、URL、正文、大对象或伪造路径 | 秘密/正文不落盘，长度有界，拒绝越界和跨插件归属 |
| PL06 / AC4 | 写盘不可用、SDK日志风暴 | 消息不受影响，缓冲有界且失败/丢弃可观测，无递归日志 |
| PL07 / AC4 | 跨午夜、正常退出和重启 | 正确日期追加，退出flush；强退缓冲损失明确 |
| PL08 / AC2/4 | 实际桌面包运行临时插件并触发Worker错误 | 日志端口/模块存在，错误传回宿主并落入插件日志；原desktop/llm功能仍可用 |

自动化：各包现有vitest运行受影响日志writer/Host/channel-runtime/路由/四插件测试；pnpm lint、pnpm lint:boundaries、node scripts/check-architecture-boundaries.cjs --self-test，以及core/desktop类型检查。临时目录和伪凭据覆盖安全负例，不发送真实IM消息。实际macOS包做PL08；Windows需对应runner/本机验证，无法执行须记录明确人工步骤和未验证风险。应用实现后建立Story验证goal，逐case附命令和结果。

### 执行结果与复现

- PL01/05/06/07：真实临时目录验证四插件、多连接隔离、脱敏、日期轮转、重启追加、退出flush、写盘失败和缓冲上限；`plugin-log-service.test.ts`、`daily-log-writer.test.ts`、Core `plugin-logging.test.ts`和Host测试通过。
- PL02：企微、飞书使用编译后的默认工厂及真实SDK；仅用本地无效URL或HTTP transport stub触发错误。钉钉运行真实CJS/ESM子进程及默认DWClient，验证无默认console泄漏、debug关闭、SDK错误被接收；邮箱保持ImapFlow协议日志关闭并记录受控连接/poll错误。没有发送真实IM消息。
- PL03/04：真实BindingIngress、RuntimeAdapter、Trigger、ReplyDispatcher和文件审计覆盖入口、prompt、投递以及消息持久化失败；同一diagnosticId关联安全原因和event/session，失败不会记作完成。
- PL08：完整`build:app`、macOS ARM64实际app.asar验证通过；包内Electron启动真实Worker，在初始化前发送prompt产生错误，再由包内Host临时插件、Runtime、路由和文件审计验证四插件落盘与诊断关联。包内四插件可加载，原desktop/llm日志回归通过。

集成测试共232项：四插件73、Core渠道与感知133、Desktop日志/回复/Windows打包检查脚本26。关键Core改动（runtime-adapter、plugin logging、trigger adapter）覆盖率：行/语句95.52%，分支80.26%，函数85.71%；不代表全仓覆盖率。类型检查和完整构建通过；lint为0 errors / 2968既有warnings；架构扫描871生产文件零诊断，自测43用例×2工作目录通过。

复现命令（仓库根目录，先按锁文件安装依赖）：

```bash
pnpm --filter @originos/perception-plugin-email --filter @originos/perception-plugin-wecom --filter @originos/perception-plugin-feishu --filter @originos/perception-plugin-dingtalk test
pnpm exec vitest run src/modules/channel-runtime/__tests__ src/modules/perception-runtime/__tests__ --root packages/core
pnpm exec vitest run src/main/services/__tests__/daily-log-writer.test.ts src/main/services/__tests__/plugin-log-service.test.ts src/main/services/__tests__/plugin-diagnostic-routing.test.ts src/main/services/__tests__/plugin-reply-delivery-service.test.ts src/main/services/__tests__/console-log-capture.test.ts scripts/__tests__/verify-windows-package.test.mjs --root packages/desktop
pnpm --filter @originos/desktop build:app
node packages/perception-plugins/wecom/scripts/check-sdk-logging.cjs
node packages/perception-plugins/feishu/scripts/check-sdk-logging.cjs
node packages/perception-plugins/dingtalk/src/__tests__/sdk-logging.cjs
pnpm lint
pnpm lint:boundaries
node scripts/check-architecture-boundaries.cjs --self-test
```

本地未签名包使用`CSC_IDENTITY_AUTO_DISCOVERY=false ORIGINOS_SKIP_MAC_NOTARIZE=1 pnpm exec electron-builder --config electron-builder.yml --config.mac.forceCodeSigning=false --mac --arm64 --dir --publish never`（desktop目录），随后执行`pnpm --filter @originos/desktop verify:mac-package`。仅命令行覆盖本地签名要求，仓库发布配置不变。

产物及证据保存在仓库根`release/plugin-logs-20260914/`：`OriginOS CE.app`和`evidence/`。证据包含final-plugins/core/desktop、coverage、real-sdk、types、lint、boundaries/selftest、build、pack、package-verify、package-smoke日志及`originos-verify-plugin-logs-package.cjs`。可用包内可执行文件配合`ELECTRON_RUN_AS_NODE=1`运行该脚本，唯一参数为包内app.asar路径。

剩余人工验证：本机为macOS，不能验证Windows安装、真实平台鉴权/网络和远端IM展示。在Windows runner构建后运行`pnpm --filter @originos/desktop verify:win-package`；安装后分别启用四插件、触发一次受控连接或执行失败，检查应用日志目录`plugins/{source}/plugin-日期.log`及感知审计的diagnosticId，再正常退出、重启确认同日追加。不要把脚本级Windows检查通过等同于Windows运行验证。正常退出已测flush，强退可能损失未落盘缓冲；不记录正文和任意供应商错误文本，未知错误只保留受限堆栈/类别。本次未发布远端。

## SENSE12-T8：原始IM消息与发送者（本地自动化及包验证通过，真实IM待人工复测）

| Case / AC | Given / When | Then |
|---|---|---|
| IR01 / AC1 | 三个IM命中规则，输入问候/催促/明确代拟请求 | Invocation及会话正文等于原文，模型输入解码后的text逐字符相等，无内部事件任务说明 |
| IR02 / AC2 | 发送者ID和可用显示名、群ID/类型、附件俱全 | 目标及模型收到同一完整消息；metadata保存正确发送者/会话/附件，非仅审计可见 |
| IR03 / AC2 | 两连接、两群成员交错消息，或缺少显示名 | 归属无串线；缺失显示名不猜测为所有者或其他成员 |
| IR04 / AC1/2 | 原文含空白、换行、表情、伪造封套或规则指令 | 原文保留且编码边界有效，不能改变宿主origin/actor；授权拒绝时不执行目标 |
| IR05 / AC3 | 恢复已有第三方分析历史；或无当前回复句柄 | 新消息仍走完整消息透传，历史不删除，投递不假报成功 |
| IR06 / AC3/4 | 非IM/UI、流式、文件回复及运行/投递失败 | 既有行为/安全失败/独立日志关联不回归，无新模型调用 |
| IR07 / AC1–4 | 实际包Worker接收完整IM消息；原群原会话人工复测 | 跨进程原文与发送者俱全；普通问候/催促由目标直接处理，代拟仅按明确请求，无新增错误 |

自动化：Core channel-runtime/perception-runtime相关vitest，Gateway真实metadata存储与绑定集成，Desktop回复及四插件回归；core/desktop类型检查、pnpm lint、pnpm lint:boundaries、node scripts/check-architecture-boundaries.cjs --self-test。用合成成员ID/显示名和临时目录，不使用真实凭据或自动发送平台消息。按用户最新规约直接记录验证结果，不另建测试goal。

IR01–IR06：Core渠道/感知137项通过；补齐长任务分支后Gateway及IM上下文11项复验通过。新增三渠道集成测试穿过Trigger、BindingIngress、Runtime和Gateway，真实JSON保存及重建会话后核对原文、成员切换、可选显示名、附件和历史保留；验证错误封套不能改变结构化发送者。Desktop诊断/回复7项及四插件73项回归通过。Core类型检查通过，lint为0 errors / 2968既有warnings，架构871生产文件零诊断，自测43×2通过。

命令沿用T7列出的Core、四插件和架构检查；Desktop本轮仅运行plugin-diagnostic-routing、plugin-reply-delivery-service两个文件。定向复验为`pnpm exec vitest run src/modules/channel-runtime/__tests__/im-message-context.test.ts src/modules/channel-runtime/__tests__/pi-agent-session-gateway.test.ts --root packages/core`。日志：`/private/tmp/im-context-{tests,gateway-tests,desktop-tests,plugin-tests,types,lint,boundaries,selftest}.log`。本轮未重新统计覆盖率，不将T7覆盖率作为T8结果。

包内脚本验证实际Worker收到的模型输入包含未改写text与对应sender/conversation，并验证原安全错误链路；单元测试固定回复不能替代模型效果验证。人工由用户在原会话分别发送“在吗”“怎么回复这么慢”和“帮我拟一条回复”，核对处理方按当前发言人请求响应。历史记忆可能仍带有错误推断，不默认删除；平台未授权或Windows环境不可用时明确记为未验证并提供步骤，不把macOS脚本结果当作所有平台运行通过。

### SENSE12-T8 包内验收与交付

完整`pnpm --filter @originos/desktop build:app`通过，包含Desktop类型检查和18个Worker运行模块验证；使用T7记录的本地未签名打包命令生成macOS ARM64包。`verify:mac-package`通过，真实包内Electron/Worker依次接收企微、飞书、钉钉完整输入，核对原文空白/换行/表情、发送者ID/显示名和群会话。仅替换OriginOSAgent.prompt模型请求入口，真实Worker初始化及命令传输均执行；没有调用外部模型或发送IM。包内错误脚本同时验证真实Worker错误、四插件日志、审计关联和脱敏，全部通过。

测试包：`release/im-context-20260914/OriginOS CE.app`；日志及可复现脚本保存在同目录`evidence/`，含im-context-{build,pack,package-verify,package-smoke,package-errors}.log。用包内Electron可执行文件并设置`ELECTRON_RUN_AS_NODE=1`运行evidence/originos-verify-im-context.cjs（唯一参数为包内Contents/Resources/app.asar），可重复输入验证；错误验证脚本同样调用。

IR07跨进程部分通过，真实模型措辞及原群会话人工复测仍待用户执行，不据此声称彻底消除第三方视角。退出旧应用，打开新包，在原群原会话分别发送“在吗”“怎么回复这么慢”和“帮我拟一条回复”；前两条应按发言人的当前请求处理，第三条可正常代拟。旧会话/记忆未清理；Windows运行、真实平台网络及收件效果未验证。未远端推送或发布。
