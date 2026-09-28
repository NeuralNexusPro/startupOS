# Story PERF.1: 桌面日志按日期滚动

**Epic:** PERF - 桌面性能与运行稳定性优化  
**状态:** Review  
**Owner:** Desktop Engineering  
**创建日期:** 2026-07-27  
**最后更新:** 2026-07-27

## User Story

作为 OriginOS 桌面版的维护人员，  
我希望 desktop 与 LLM 日志按本地自然日分别写入独立文件，  
以便避免单个日志文件无限增长，并能按日期快速定位故障。

## 验收标准

- [x] AC1: desktop 日志写入 `desktop-YYYY-MM-DD.log`。
- [x] AC2: LLM 日志写入 `llm-YYYY-MM-DD.log`。
- [x] AC3: 应用跨越本地午夜且不重启时，下一条日志自动写入新日期文件。
- [x] AC4: 同一天重启应用继续追加当日文件，不覆盖已有日志。
- [x] AC5: 现有 `desktop.log`、`llm.log` 保留且不再写入，不执行破坏性迁移。
- [x] AC6: 目录创建或单次写入失败不导致应用退出，也不通过被代理的 console 递归记录。
- [x] AC7: Windows 与 macOS 路径和日期文件名具备自动化验证。
- [x] AC8: 实现不修改日志级别、LLM 过滤前缀、日志正文和 ISO 时间戳语义。

## 文档导航

- [需求文档](./requirements.md)
- [交互设计](./interaction.md)
- [架构设计](./architecture.md)
- [开发文档](./implementation.md)
- [测试文档](./testing.md)
- [返回 Epic PERF](../README.md)

## 进度

- [x] Story 文档创建
- [x] 验收测试定义
- [x] 日志服务实施
- [x] 自动化验证 goal
- [ ] Windows/macOS 构建验证

## 变更历史

| 日期 | 变更内容 | 变更人 |
|------|----------|--------|
| 2026-07-27 | 创建 Story，定义每日滚动、兼容与失败处理 | Codex |
| 2026-07-27 | 完成每日写入器、主进程接入及自动化验证 | Codex |
