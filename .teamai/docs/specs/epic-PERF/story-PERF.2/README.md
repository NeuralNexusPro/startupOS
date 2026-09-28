# Story PERF.2: IPC 流式长内容输出性能优化

**Epic:** PERF - 桌面性能与运行稳定性优化  
**状态:** In Progress  
**Owner:** Desktop / Core / Web Engineering  
**创建日期:** 2026-07-27  
**最后更新:** 2026-07-27

## User Story

作为使用 OriginOS 处理长报告和长代码输出的用户，  
我希望 Agent 持续流式输出大段内容时窗体仍能滚动、点击和停止任务，  
以便应用不会因 IPC 事件风暴或重复 Markdown 渲染而假死。

## 验收标准

- [ ] AC1: 建立主进程发送、renderer 接收、React 提交、Markdown 渲染和滚动阶段的性能基线。
- [x] AC2: 连续 100 KB 和 500 KB 文本流最终内容与源内容字节一致、顺序一致且无重复。
- [x] AC3: 流事件按有界时间和有界字节合并，关键事件立即发送且不被普通 delta 阻塞。
- [x] AC4: Electron 事件只发送给发起流的目标 renderer，不广播给无关窗体。
- [x] AC5: 流式阶段不对每个 delta 重建完整 Markdown AST 或重复执行代码高亮。
- [ ] AC6: 500 KB 流式基准期间 renderer 长任务不超过 200 ms，超过 50 ms 的长任务数量有明确上限且不连续阻塞 1 秒。
- [ ] AC7: 用户在流式输出期间可以滚动、点击停止并在 200 ms 内看到操作反馈。
- [x] AC8: `assistant_message`、`done`、`error`、工具事件及取消语义保持兼容。
- [ ] AC9: Skill、Agent、RoleAgent 共用的消息流入口均经过回归验证。
- [x] AC10: 大型工具参数和结果不会被主进程重复完整序列化或写入终端；单个命令输出有内存上限，日志保留长度、哈希和诊断预览。

## 文档导航

- [需求文档](./requirements.md)
- [交互设计](./interaction.md)
- [架构设计](./architecture.md)
- [开发文档](./implementation.md)
- [测试文档](./testing.md)
- [返回 Epic PERF](../README.md)

## 进度

- [x] Story 文档创建
- [x] 初步瓶颈链路审查
- [x] 性能测试用例定义
- [ ] 基准采样与瓶颈确认
- [x] 实施
- [x] 自动化性能验证 goal
- [ ] Windows/macOS 安装包人工抽检

## 变更历史

| 日期 | 变更内容 | 变更人 |
|------|----------|--------|
| 2026-07-27 | 创建 Story，覆盖 IPC 合并、React 提交、Markdown 渲染和滚动性能 | Codex |
| 2026-07-27 | 完成 IPC 批处理、定向发送、渲染降载及自动化验证 | Codex |
| 2026-07-27 | 第二轮修复日志风暴、同步日志 I/O、Completion 终态丢失和 dev 启动竞态 | Codex |
| 2026-07-27 | 重新打开 Story，处理 Windows dev 环境大型工具调用日志导致的主进程卡顿 | Codex |
