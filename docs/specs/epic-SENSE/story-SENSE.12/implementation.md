# SENSE.12 实施计划

1. `S12-T1` 串行：更新项目地图；定义 Plugin SDK、manifest、schema、权限、版本。**完成**：`packages/core/src/modules/perception-runtime/plugins`。
2. `S12-T2` 串行：实现 Registry/Host、故障隔离、生命周期、健康。**完成**：Host 对端口、事件、调度键和故障进行隔离；新增 webhook dispatch 边界。
3. `S12-T3` 串行：实现声明式表单与统一 provisioning IPC/API。**完成**：感知中心从 bundled plugin catalog 获取受控 schema，以同一表单渲染 text/password/number/boolean/select；Desktop Host 统一执行 plugin provision、safeStorage 凭据绑定和 Connector 配置落盘，旧 Email/WeCom/Feishu 专用 provisioning IPC 与 Web service 已删除。
4. `S12-T4` 可并行：迁移 WeCom、Email 及凭据/游标。**完成**：Email 已迁入独立 poll plugin，经隔离 State Port 保存游标，兼容旧 safeStorage 凭据和旧游标；Desktop mail supervisor 已删除。
5. `S12-T5` 可并行：迁移 Feishu、DingTalk 及 webhook/stream。**源码和本地验收完成**：Feishu 已使用官方 `@larksuiteoapi/node-sdk` WSClient 完成长连接、自动重连、事件归一化、Desktop safeStorage provisioning，以及 `LarkChannel` Markdown CardKit 流式双工回复与纯文本降级，无需公网回调；DingTalk 已于 SENSE12-T4 接入官方 Stream SDK、安全凭据、群/单聊回复与文件发送，真实平台权限和收件仍按人工步骤验证。
6. `S12-T6` 串行：旧配置迁移、打包清单、删除平台硬编码。
7. `S12-T7` 串行：全量回归、依赖检查、验证 Goal、Windows 打包。

写入范围为新增 `packages/perception-plugins/**` 及 core Host、Desktop Host/IPC、Web 感知中心和打包脚本。禁止修改生成产物。审查要求：通用 Host 无平台分支；schema 无函数/HTML/组件/脚本；插件独立失败；跨 package 仅走公共 index.ts。

## SENSE12-T2：邮箱插件启用验证记录

新 Email 插件已经验证 connect/readOnly mailboxOpen，但未生成旧启用门禁要求的 testReceipt，导致保存成功、启用失败。Desktop 宿主仅在 email provision 成功后复用 validateMailConnectorSettings/fingerprintMailProfile，保存 profileFingerprint 与 verifiedAt。保留原验证门禁、失败不保存及凭据安全；无新增依赖或 SDK 入口。

## SENSE12-T3 集成结果（2026-09-12）

首次新增启用在原ASAR下一轮扫描可正常启动，主要确定问题是UI健康快照不自动刷新；热重绑定和停止慢启动另有真实缺陷。runtime提交cd065cb，UI分支2f2a38b：运行时按版本停旧启新、销毁后不留实例；顶部与独立感知窗体共享刷新，等待首个健康报告不误判断开。Task Desktop13 / Web24项通过；父代理联合Desktop13 / Web23项通过、完整desktop:build通过、866文件零违规、43×2自测通过、lint0错误2935警告。日志 /private/tmp/originos-sense-live-{desktop-tests,web-tests,build,lint,boundaries,selftest}.log。实际包热更新验收随联合交付补齐。


## SENSE12-T3 最终交付验收（2026-09-13）

源码已合入 dev（e39dc62）。Desktop 13 项和 Web 23 项相关回归通过；最终完整 desktop:build 通过，架构扫描 866 个生产文件零违规，自测 43×2 通过，lint 为 0 错误、2935 个既有警告。

实际 macOS arm64 包内验证通过：首次新增启用在下一轮扫描启动、同凭据引用的新版本重连、停用停止，全程无需重启；真实 skill/persistent worker 冷启动、工具授权和关闭通过。脚本使用临时数据和模拟平台启动，不连接真实邮箱或发送外部消息。UI 自动刷新由真实组件与 store 集成测试验证；慢启动跨扫描与停止交错由宿主回归验证。

测试包：`/Users/archersado/workspace/startupOS/release/sense-live-config-20260913/mac-arm64/OriginOS CE.app`。构建与验证日志：`/private/tmp/originos-sense-final-{build,pack-clean,asar-live,asar-worker,lint,boundaries,selftest}.log`；相关回归见前述 sense-live 日志。

本轮未进行人工 GUI 或真实平台联机验证；人工复核为打开本测试包，首次新增并启用连接，等待后台启动及下一次健康刷新，确认无需重启。Windows 和其他 Story Task 不属于本修复验收。该包为未签名、公证的本地测试包。

## SENSE12-T4：IM 文件回复实施

状态：本地验收完成。对应 Proposal add-im-file-replies。先在独立 Core Task worktree 实施调用上下文、send_file、Plugin SDK 与 Desktop 回复及接纳确认；合入 Proposal 后，两个独立 Task 并行实现企微/飞书和钉钉插件。钉钉固定官方 dingtalk-stream@2.1.7-beta.1，复用 Node fetch/FormData；旧缺凭据配置提示重新绑定。完成后执行 TC1–13、架构检查、桌面构建及实际 ASAR 本地验证。回滚恢复原接口与插件，不迁移或删除用户资产。

### SENSE12-T4 集成证据

Core 基础 eaca581、企微/飞书 6f93070、钉钉 ae509e7 已在独立 Task 完成并合入 Proposal。Core 29、Desktop 5、企微15、飞书14、钉钉21项相关测试通过；钉钉发布 SDK 的握手停止和旧连接 ACK 由仓库测试验证。飞书使用官方 Client 分步上传和回复，以便上传后检查中止；钉钉使用官方 SDK 动态加载兼容 CJS 构建。实际包验收结果在 testing.md 最终记录。

## SENSE12-T6 配置表单与事件刷新

SENSE12-T6：UI Task独立修复SenseCenter与顶部菜单刷新生命周期，覆盖真实store刷新时表单草稿、焦点和DOM保留。原始重建问题已红测复现；新增事件页专用轮询要求同步纳入测试。
