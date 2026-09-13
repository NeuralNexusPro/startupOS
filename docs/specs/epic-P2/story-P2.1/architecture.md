# P2.1 架构
SolutionDesign 使用 Core Hook 公共 API、现有 solution 初始化服务与 Skill launcher。持久化项目和显式技能入口为归属事实源；Core session-restore 执行精确校验。Web -> Core 单向，不新增 IPC 或存储结构。无新依赖，错误不得静默，归属负测防止越权。
