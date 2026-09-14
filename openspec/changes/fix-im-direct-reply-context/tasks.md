## 1. 审查批准

- [x] 1.1 P0（父代理，文档，串行）：补齐Story T8与IR01–IR07验收，strict validation及方案审查通过，获得用户批准；批准前不得修改源码或创建实施Task工作区。

## 2. 共享入口修复

- [x] 2.1 T1（依赖P0，当前代理串行）：共享Trigger、RuntimeAdapter、Gateway及必要types/validation和测试已实施；原文和发送者到达模型，长任务等待回复分支同样保留完整输入。IR01–IR06回归、类型与架构检查通过，完整桌面构建通过。按用户最新AGENTS直接在当前工作区实施，证据见Story testing.md。

## 3. 集成验证与交付

- [x] 3.1 T2（依赖T1，当前代理）：Story/AGENTS/changes已同步；实际macOS包资源、真实Worker完整输入及错误诊断验证通过。模型请求入口替身，不发送外部消息；真实IM人工复测步骤和Windows未验证范围已记录。
- [x] 3.2 T3（依赖T2，当前代理）：strict validation及最终审查通过，测试包与证据保存于release/im-context-20260914。交付收尾执行dev本地提交、清理本次旧方案工作区；不执行真实IM发送或远端发布。
