# 测试文档 - Story M.13

**Story:** 旧记忆机制清退  
**版本:** 1.0  
**最后更新:** 2026-09-10

## 测试目标

证明旧机制删除后所有 Agent 统一走 MemoryCore，历史无双写，旧数据可恢复，认知功能无回退。

## 自动化测试 Case

| ID | 类型 | 场景 | 预期 |
|---|---|---|---|
| M13-UT-01 | 单元 | 解析现有 Memory.md | 新公共 parser 返回与旧 parser 一致的 blocks |
| M13-UT-02 | 单元 | 旧 `memory/history.jsonl` 首次加载 | 迁移到 session history，内容完整 |
| M13-UT-03 | 单元 | 目标 history 已存在 | 不覆盖目标、不删除旧文件 |
| M13-IT-01 | 集成 | RoleAgent 完成一个 turn | 新 history 仅新增一条 |
| M13-IT-02 | 集成 | RoleAgent 启动与关闭 | 不创建 `.dream_cursor` 或旧 history writer |
| M13-IT-03 | 集成 | ProjectAgent 加载 Memory.md | 不依赖 RoleAgent 旧模块且 prompt 内容一致 |
| M13-IT-04 | 集成 | RoleAgent 会话结束 | 5-turn reflect、user-profile、world-model 正常 |
| M13-IT-05 | 集成 | Persistent/协作 Agent | 仍通过 MemoryCore 记录与 reflect |
| M13-ARCH-01 | 架构 | 扫描生产源码 | Dream、MemoryTracker、MemoryBlockManager、MemoryAdapter 构造/导出为 0 |
| M13-ARCH-02 | 架构 | 扫描 MemoryCore 依赖 | 不反向依赖 RoleAgent/Web/Desktop |

## 关键失败与边界路径

- 空会话不写历史、不调用 reflect。
- 旧 JSONL 含损坏行时保留其他有效行。
- 迁移目标已存在时不覆盖、不丢数据。
- 应用异常退出后，下次启动仍能读取已落盘的新旧历史。
- 删除旧 API 后，所有 package TypeScript 构建通过。

## 验证命令

```bash
pnpm --filter @originos/core test
pnpm --filter @originos/web type-check
pnpm --filter @originos/desktop build
pnpm lint
rg "new (Dream|MemoryTracker|MemoryBlockManager|MemoryAdapter)" packages --glob '!**/__tests__/**'
```

## 验证 Goal

功能完成后创建自动化测试 goal：**“通过 Story M.13 中定义的全部测试 case”**。无法自动化的安装包升级验证须记录人工步骤和数据丢失风险。

## 验证结果（2026-09-10）

- M.13 聚焦回归：18 个测试文件、176 项测试全部通过。
- Web TypeScript、Desktop TypeScript build、Web lint（0 error）通过。
- 生产源码旧符号与 MemoryCore 反向依赖扫描通过。
- 全量 Core 测试存在 18 个既有失败文件（浏览器 hook 状态测试及 WSL 缺少 `socat`），与本 Story 修改路径无关；聚焦的 Persistent/协作链路已通过。
