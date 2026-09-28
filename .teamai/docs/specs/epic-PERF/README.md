# Epic PERF: 桌面性能与运行稳定性优化

**Epic 编号:** PERF  
**优先级:** High  
**状态:** In Progress  
**Owner:** Desktop / Core Engineering  
**创建日期:** 2026-07-27

## Epic 目标

建立可量化、可回归的桌面性能治理机制，优先解决长期运行后日志文件无限增长、主进程同步 I/O、启动耗时和资源未及时释放等问题，同时保持故障诊断能力。

## 范围

- 桌面日志按日期滚动、保留、压缩与磁盘配额。
- 日志写入对 Electron 主进程响应时间的影响。
- 应用启动、窗体创建和 Agent 会话初始化性能基线。
- 长时间运行后的进程、窗口、监听器和文件句柄回收。
- Windows 与 macOS 安装包环境下的性能回归验证。

## Story 列表

| Story | 标题 | 状态 | 优先级 | 依赖 |
|-------|------|------|--------|------|
| [PERF.1](./story-PERF.1/README.md) | 桌面日志按日期滚动 | Review | Critical | Electron `app.getPath('logs')` |
| [PERF.2](./story-PERF.2/README.md) | IPC 流式长内容输出性能优化 | In Progress | Critical | Agent 流事件、聊天渲染 |
| PERF.3 | 历史日志压缩、保留与磁盘配额 | Backlog | High | PERF.1 |
| PERF.4 | 主进程日志异步批量写入与背压 | Partial | High | PERF.1 |
| PERF.5 | 启动、窗体与 Agent 初始化性能基线 | Backlog | High | 无 |
| PERF.6 | 长运行资源回收与泄漏检测 | Backlog | Medium | PERF.5 |

## 架构约束

- 日志能力属于 `packages/desktop/src/main/`，不得下沉到 Web UI 或反向依赖 Web。
- 不修改 `dist-electron/` 等构建产物。
- 日志故障不得阻断应用启动、会话执行或异常处理。
- 日志中不得新增凭据、用户内容或未脱敏标识。
- 每个 Story 在实施前必须具备自动化测试用例，完成后创建对应验证 goal。

## 当前进度

| 项目 | 状态 |
|------|------|
| Epic 范围 | Complete |
| PERF.1 规格与测试用例 | Complete |
| PERF.2 规格与测试用例 | Complete |
| PERF.1 实施与自动化验证 | Complete |
| PERF.2 实施与自动化验证 | 第三轮工具调用背压修复完成，等待 Windows 运行态复测 |
| Windows/macOS 安装包与真实性能抽检 | Pending |
| 后续 Story 详细规格 | Pending |

## 相关文档

- [AGENTS.md](../../../AGENTS.md)
- [文档协作管理规范](../../DOCUMENTATION-MANAGEMENT.md)
- [PERF.1 桌面日志按日期滚动](./story-PERF.1/README.md)
- [PERF.2 IPC 流式长内容输出性能优化](./story-PERF.2/README.md)

## 变更历史

| 日期 | 变更内容 | 变更人 |
|------|----------|--------|
| 2026-07-27 | 创建性能优化 Epic，并建立首个桌面日志滚动 Story | Codex |
| 2026-07-27 | 新增 PERF.2，覆盖 IPC 到 Markdown 渲染的长内容流性能 | Codex |
| 2026-07-27 | 完成 PERF.1/PERF.2 实施与自动化验证，进入平台人工抽检 | Codex |
| 2026-07-27 | PERF.2 增加大型工具调用有界输出、单次日志序列化和延迟异步 flush | Codex |
