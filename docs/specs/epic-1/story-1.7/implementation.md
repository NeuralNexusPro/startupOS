# Story 1.7 实施计划

状态：尚未实施。完整有序工作包、依赖、负责角色、互斥写入范围与证据要求见 [tasks.md](../../../../openspec/changes/refine-interview-semantic-modeling/tasks.md)。

顺序：公共契约 → 持久化与恢复 → 访谈工具/提示词与 UI 并行 → 跨端集成 → desktop:dev 验收。1.8 必须等待 1.7 的公开分类契约完成。

契约示例与业务案例见 [设计](../../../../openspec/changes/refine-interview-semantic-modeling/design.md)，实现应以该定义编写严格 DTO，不使用 any。无新增第三方库；使用仓库 Node/pnpm 环境。不得编辑 dist-electron、.next、node_modules 或用户运行数据。

审查重点：ID 不变、字段不会被 parser 丢弃、原文证据只存引用、权限由可信边界注入、重试不重复、Memory 不作事实源。若旧模板含 class，引导按新分类输出，但不批量覆盖用户自定义技能。

目前已知缺口只记录于设计，不能将本文当作修复已交付。实施前复核 ONT.8 真实接口和平台测试证据。
