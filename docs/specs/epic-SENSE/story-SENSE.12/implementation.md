# SENSE.12 实施计划

1. `S12-T1` 串行：更新项目地图；定义 Plugin SDK、manifest、schema、权限、版本。**完成**：`packages/core/src/modules/perception-runtime/plugins`。
2. `S12-T2` 串行：实现 Registry/Host、故障隔离、生命周期、健康。**完成**：Host 对端口、事件、调度键和故障进行隔离；新增 webhook dispatch 边界。
3. `S12-T3` 串行：实现声明式表单与统一 provisioning IPC/API。**完成**：感知中心从 bundled plugin catalog 获取受控 schema，以同一表单渲染 text/password/number/boolean/select；Desktop Host 统一执行 plugin provision、safeStorage 凭据绑定和 Connector 配置落盘，旧 Email/WeCom/Feishu 专用 provisioning IPC 与 Web service 已删除。
4. `S12-T4` 可并行：迁移 WeCom、Email 及凭据/游标。**完成**：Email 已迁入独立 poll plugin，经隔离 State Port 保存游标，兼容旧 safeStorage 凭据和旧游标；Desktop mail supervisor 已删除。
5. `S12-T5` 可并行：迁移 Feishu、DingTalk 及 webhook/stream。**进行中**：Feishu 已使用官方 `@larksuiteoapi/node-sdk` WSClient 完成长连接、自动重连、事件归一化、Desktop safeStorage provisioning，以及 `LarkChannel` Markdown CardKit 流式双工回复与纯文本降级，无需公网回调；DingTalk 仍待完整迁移。
6. `S12-T6` 串行：旧配置迁移、打包清单、删除平台硬编码。
7. `S12-T7` 串行：全量回归、依赖检查、验证 Goal、Windows 打包。

写入范围为新增 `packages/perception-plugins/**` 及 core Host、Desktop Host/IPC、Web 感知中心和打包脚本。禁止修改生成产物。审查要求：通用 Host 无平台分支；schema 无函数/HTML/组件/脚本；插件独立失败；跨 package 仅走公共 index.ts。
