# SENSE.12 实施计划

1. `S12-T1` 串行：更新项目地图；定义 Plugin SDK、manifest、schema、权限、版本。**完成**：`packages/core/src/modules/perception-runtime/plugins`。
2. `S12-T2` 串行：实现 Registry/Host、故障隔离、生命周期、健康。**完成**：Host 对端口、事件、调度键和故障进行隔离；新增 webhook dispatch 边界。
3. `S12-T3` 串行：实现声明式表单与统一 provisioning IPC/API。**完成**：感知中心从 bundled plugin catalog 获取受控 schema，以同一表单渲染 text/password/number/boolean/select；Desktop Host 统一执行 plugin provision、safeStorage 凭据绑定和 Connector 配置落盘，旧 Email/WeCom/Feishu 专用 provisioning IPC 与 Web service 已删除。
4. `S12-T4` 可并行：迁移 WeCom、Email 及凭据/游标。**完成**：Email 已迁入独立 poll plugin，经隔离 State Port 保存游标，兼容旧 safeStorage 凭据和旧游标；Desktop mail supervisor 已删除。
5. `S12-T5` 可并行：迁移 Feishu、DingTalk 及 webhook/stream。**进行中**：Feishu 已使用官方 `@larksuiteoapi/node-sdk` WSClient 完成长连接、自动重连、事件归一化、Desktop safeStorage provisioning，以及 `LarkChannel` Markdown CardKit 流式双工回复与纯文本降级，无需公网回调；DingTalk 仍待完整迁移。
6. `S12-T6` 串行：旧配置迁移、打包清单、删除平台硬编码。
7. `S12-T7` 串行：全量回归、依赖检查、验证 Goal、Windows 打包。

写入范围为新增 `packages/perception-plugins/**` 及 core Host、Desktop Host/IPC、Web 感知中心和打包脚本。禁止修改生成产物。审查要求：通用 Host 无平台分支；schema 无函数/HTML/组件/脚本；插件独立失败；跨 package 仅走公共 index.ts。

## SENSE12-T2：邮箱插件启用验证记录

新 Email 插件已经验证 connect/readOnly mailboxOpen，但未生成旧启用门禁要求的 testReceipt，导致保存成功、启用失败。Desktop 宿主仅在 email provision 成功后复用 validateMailConnectorSettings/fingerprintMailProfile，保存 profileFingerprint 与 verifiedAt。保留原验证门禁、失败不保存及凭据安全；无新增依赖或 SDK 入口。

## SENSE12-T3 集成结果（2026-09-12）

首次新增启用在原ASAR下一轮扫描可正常启动，主要确定问题是UI健康快照不自动刷新；热重绑定和停止慢启动另有真实缺陷。runtime提交cd065cb，UI分支2f2a38b：运行时按版本停旧启新、销毁后不留实例；顶部与独立感知窗体共享刷新，等待首个健康报告不误判断开。Task Desktop13 / Web24项通过；父代理联合Desktop13 / Web23项通过、完整desktop:build通过、866文件零违规、43×2自测通过、lint0错误2935警告。日志 /private/tmp/originos-sense-live-{desktop-tests,web-tests,build,lint,boundaries,selftest}.log。实际包热更新验收随联合交付补齐。
