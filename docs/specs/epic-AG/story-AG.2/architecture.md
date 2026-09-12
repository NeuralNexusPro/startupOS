# 架构设计 - Story AG.2

**任务:** AG2-T1；**更新:** 2026-09-11

## 依赖方向

Web/Desktop/worker 边界 → Core features/modules 业务组装 → integrations/storage/shared/types。通用 UI 不依赖业务 UI；Core 不依赖 Web/Desktop。

## 修复分组

| 根因 | 处理 |
|------|------|
| Electron IPC/用户注册/启动入口类型放在业务实现 | 下沉公共 DTO 与常量，业务向下重导出 |
| 记忆解析和配置读文件被业务模块占有 | 提取单一底层解析/存储实现，保留业务默认值策略 |
| Agent 集成直接创建记忆、认知策略及调用 session service | 在 agent feature 组装，通过最小函数依赖传入运行时 |
| 集成层业务工具直接引用文档、本体和 scheduler | 业务工具及组装上移，底层保留 registry 和通用执行 |
| 通用聊天列表引用业务 UI | 将 ToolExecutionFrame 移到 ui/chat |

详细调用路径、数据所有权、迁移、风险和 subagent 写入边界见 [Proposal 设计](../../../../openspec/changes/archive/2026-09-12-fix-reported-architecture-violations/design.md)。不得使用动态字符串导入、类型豁免或整体重新分类来绕过规则。

## 验证

使用真实 ESLint 边界解析和调用链检查，替代旧 grep 计数；配合 testing.md 的运行时、持久化和打包用例。当前已有围栏不覆盖全部循环依赖，需人工审查新引入的传递依赖。
