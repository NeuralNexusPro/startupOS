# SENSE.14 测试计划

状态：分阶段执行中；已完成记录见文末，未记录项不代表通过。

| Case | 验收内容 |
|---|---|
| CD01 / AC1 | 三平台逐项确认真实SDK/工具目录版本、描述完整性、授权路径；无日程／待办能力的机器人凭据显示缺能力，不虚报可用 |
| CD02 / AC2 | 连接后生成目录、关键词发现及按需schema；1000项基准下缓存发现P95≤500ms，返回数量与大小有界 |
| CD03 / AC2 | 为可信目录增加一个非日程／待办操作，Core／IPC／Agent工具注册代码零变化即可发现并调用；默认SDK/工具服务路径参与验证 |
| CD04 / AC3 | 群成员、授权人、机器人身份不同，多连接交错；操作绑定实际授权主体，不冒用拥有者，不跨连接切换 |
| CD05 / AC3 | 注入恶意工具说明、伪造连接参数、任意SDK路径、未授权scope、嵌套schema超限；拒绝越权，通用调用仍执行单项风险/HITL |
| CD06 / AC4 | 日程查询／创建、待办查询／创建／完成；每平台标记成功/限制/未验证。至少一个平台真实授权闭环，其余平台未通过不计全平台完成 |
| CD07 / AC4 | 创建成功后回执丢失、超时、429及重复调用；支持幂等则复用，否则核对或不确定态，不自动重复创建 |
| CD08 / AC5 | 授权撤回、降权、断网、停用、目录版本变更、重启恢复；失效能力不能调用，原消息收发和文件回复正常 |
| CD09 / AC5 | 感知配置草稿和焦点在能力刷新时保持；无新增5秒轮询；错误和日志不泄漏Secret、token或正文 |
| CD10 / AC1–5 | 实际Desktop包内Worker通过Host代理完成发现和受控调用，缺模块、宿主重启、超时取消安全失败；Web入口行为一致 |

分层验证：Core vitest验证目录/授权/调用，三插件测试使用真实默认SDK或目录客户端并仅替换网络transport；真实外部创建仅在授权的测试账号执行，保存对象链接和清理结果。固定模拟目录／回复不能替代平台可用性证据。

提交前执行pnpm lint、pnpm lint:boundaries、node scripts/check-architecture-boundaries.cjs --self-test及受影响包类型检查。包验证覆盖新资源与IPC/Worker；Windows/macOS分别记录实际运行结果，缺环境写未验证，不以macOS替代Windows结论。OpenSpec执行strict validation。

原平台SDK失败和发现失败都需独立日志及diagnosticId；审计不是凭据存储。测试fixtures使用合成人员、连接和日程，日志只记录非敏感验证摘要。

## 2026-09-15 P2 本地验证（不等同联合验收）

新增plugin-capabilities.test.ts覆盖目录/按需schema、权限与主体模式、未知授权、策略拒绝、参数/版本、并发去重、重启幂等、撤权与旧调用返回场景。感知模块回归78项通过（12文件）；Host新增源码strict类型检查通过。原平台收发用例通过不代表新增办公SDK已联调。

日志：`/private/tmp/sense14-perception-tests.log`、`/private/tmp/sense14-types.log`。该段仅记录P2阶段；联合验收结果见后续记录。

P2门禁：pnpm lint完成（0 errors，2968条存量warnings）；架构扫描872个生产文件、0诊断；检查器自测43例×2 CWD通过；OpenSpec strict通过。新增缓存损坏恢复用例验证备份不会丢失已保留的调用记录。

## 2026-09-16 P3-W 本地验证

企业微信插件26项测试通过，覆盖动态目录、独立授权、原生schema校验、禁止调用参数及固定CLI映射；typecheck与build通过。官方CLI默认路径发现1.2.1版本共13项能力（日程7、待办6），当前用户授权状态有效。CD01企业微信来源与授权路径、CD03企业微信动态目录已有证据。

P6企业微信真实授权闭环：先以dry-run验证请求，再创建一个15分钟、无额外参与人的`[OriginOS SENSE.14 联调] 可删除测试日程`，读取核对标题、时间、时区和机器人创建者后取消，再次读取返回0项；创建一个`[OriginOS SENSE.14 联调] 可删除测试待办`，读取核对进行中状态，完成后核对完成状态，最后删除并确认“不存在”。全程使用官方CLI 1.2.1默认执行路径，没有发送邀请，测试对象已清理。CD06在企业微信通过；飞书、钉钉真实业务操作仍为未验证，不计全平台完成。

## 2026-09-16 P3-D 本地验证

钉钉插件29项测试通过，其中3项覆盖官方Schema到目录映射、独立OAuth profile摘要、参数／约束白名单、固定profile执行和未授权状态；typecheck与build通过。下载并校验官方`dws` 1.0.61 macOS arm64二进制后，以真实`schema --all --jq`路径发现93项能力（日历49、待办44），输出保持在2MB Host边界内；该机器`auth status`返回未登录，没有读取业务数据或执行写操作。CD01钉钉来源、授权路径与CD03动态目录已有证据；CD06钉钉保持未验证。

P4/P5阶段性验证：Core调用上下文、通用Agent工具及Host契约17项测试通过；Desktop白名单／写策略与配置合并2项测试通过；Desktop TypeScript及完整`build:app`通过。Windows包校验fixture 3项通过。electron-builder生成macOS arm64未签名应用后，`verify-mac-package`确认app.asar、企微CLI 1.2.1平台包、`app.asar.unpacked`原生二进制及Pi Task Runtime均完整。未签名构建在afterSign公证步骤因本机无Apple API凭据退出，但应用目录已生成且包内容校验通过。

P5管理界面验证：Sense Center 34项组件测试通过，覆盖能力状态、能力数、授权模式、白名单人数和读写范围。三平台均按实际CLI状态显示同步失败、待授权或可用；配置草稿、焦点和平台选择在事件刷新中保持。假时钟验证能力状态不跟随事件页的5秒轮询；Web type-check通过。

## 2026-09-17 P3-F 本地验证

飞书插件20项测试通过，其中2项覆盖官方帮助目录／Schema到能力映射、用户OAuth profile摘要、原生参数校验、固定profile执行和未授权状态；typecheck与build通过。校验官方`lark-cli` 1.0.95 macOS arm64二进制后，以真实默认命令发现49项能力（日历18、任务31），当前机器未配置profile，返回`needs_authorization`；没有读取飞书业务数据或执行写操作。CD01飞书来源、授权路径与CD03动态目录已有证据，CD06飞书保持未验证。

P4 Worker代理验证：Core 24项定向用例通过，其中实际Node子进程经宿主会话代理完成能力发现；验证受信callId、接纳后绑定、会话过期、伪造connector/actor/credential字段拒绝，以及规则要求HITL、破坏性操作和非白名单主体默认拒绝。Worker复用既有`tool_result`协议，凭据与宿主路由字段不进入Worker参数；Desktop构建与Worker运行时校验确认代理模块进入包资源。

本轮收口：Core定向47/47、企微27/27、飞书20/20、钉钉29/29、Sense Center 10/10、Skill历史3/3、Desktop策略／附件接纳／Windows校验fixture 7/7通过；三插件与Web类型检查、Desktop完整`build:app`通过。`pnpm lint`为0 error、2983条存量warning；`pnpm lint:boundaries`扫描877个生产文件、0诊断；架构检查器43例×2 CWD、`git diff --check`通过。此前OpenSpec strict校验通过；当前工作树没有安装OpenSpec CLI，因此未重复执行。

CD02新增1000项内存目录基准，连续20次发现的P95低于500ms，每次最多返回20项且摘要不携带schema。CD03新增`drive.files.search`代表操作，未修改Core／IPC／Agent注册即可完成发现与调用。CD04–CD09由主体绑定、伪造字段拒绝、scope／撤权复核、写入不确定态、重启去重、配置草稿和无5秒能力轮询用例覆盖。

CD10以本轮源码重新执行Desktop `build:app`并生成`release/mac-arm64/OriginOS CE.app`；本机没有Developer ID，electron-builder在签名阶段退出，但生成的未签名应用目录通过`verify-mac-package`，三平台`office-capabilities.js`、Host、Worker代理和企微原生CLI均在实际app.asar／resources中。Windows实际安装运行仍未验证，Windows包结构由3项校验fixture覆盖，不以macOS结果替代Windows结论。

P6结论：CD01–CD10按首轮范围完成，企业微信完成真实授权日程／待办闭环；飞书、钉钉只确认官方目录和待授权状态，未宣称其真实业务操作已通过。
