## 1. SENSE12-T4
- [x] 1.1 核实三平台接口、确认用户选择 IM 回传、补齐 Story 测试与方案审查；记录会话授权。
- [x] 1.2 Core 子代理在独立 Task 实施共享调用上下文、send_file、插件协议/能力、宿主回执和落盘接纳回调；依赖1.1，先于平台工作。范围为 Core integrations/pi-agent/channel-file-reply、features/agent/tools、modules/channel-runtime/pi-agent-session-gateway、perception-runtime/plugins及routing，Desktop plugin-reply-delivery-service和宿主事件接纳；对应测试。TC1-7/10-12红绿、类型/lint/边界/自测，返回commit。
- [x] 1.3 SDK 子代理在独立 Task 实施企微与飞书文件上传/回复；依赖已合并1.2，与1.4并行；仅两插件源码、manifest/types/tests。TC8红绿、停止中上传守护、失败/旧文本回归及规定检查，返回commit。
- [x] 1.4 钉钉子代理在独立 Task 实施真实Stream、凭据、群/单聊文件与文本回复；依赖已合并1.2，与1.3并行；仅钉钉插件、依赖lock、Desktop bundled权限、必要打包配置及测试。发布SDK生命周期必须先红绿核验。TC9-12及规定检查，返回commit。
- [x] 1.5 父代理审查集成、创建 Story 自动验证goal，通过全部用例、类型/lint/边界/自测、完整构建和实际包脚本验收；不真实发送文件。
- [x] 1.6 更新 Story/Epic/架构与变更记录、strict validation、合并dev、同步归档和清理工作树。dev合并2e2319c；主规范已同步，本轮四个临时工作区及已合并分支已清理。
