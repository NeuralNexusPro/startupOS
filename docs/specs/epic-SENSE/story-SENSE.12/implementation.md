# SENSE.12 实施计划

1. `S12-T1` 串行：更新项目地图；定义 Plugin SDK、manifest、schema、权限、版本。
2. `S12-T2` 串行：实现 Registry/Host、故障隔离、生命周期、健康。
3. `S12-T3` 串行：实现声明式表单与统一 provisioning IPC/API。
4. `S12-T4` 可并行：迁移 WeCom、Email 及凭据/游标。
5. `S12-T5` 可并行：迁移 Feishu、DingTalk 及 webhook/stream。
6. `S12-T6` 串行：旧配置迁移、打包清单、删除平台硬编码。
7. `S12-T7` 串行：全量回归、依赖检查、验证 Goal、Windows 打包。

写入范围为新增 `packages/perception-plugins/**` 及 core Host、Desktop Host/IPC、Web 感知中心和打包脚本。禁止修改生成产物。审查要求：通用 Host 无平台分支；schema 无函数/HTML/组件/脚本；插件独立失败；跨 package 仅走公共 index.ts。
