# Story OS.19: Skill、Agent 与 RoleAgent 目录导出 ZIP

**Epic:** OS - Phase 0 OS 交互基础
**Status:** Complete
**Owner:** Product / Engineering
**Created:** 2026-07-26
**Last Updated:** 2026-07-26

---

## Story 概览

### User Story

作为 OriginOS 桌面版用户，
我希望在自定义 Skill、Agent 和 RoleAgent 窗体中一键导出对应的完整工作目录，
以便将定义、记忆、附件和产物打包为 ZIP，并立即在系统文件管理器中定位该压缩包。

### 验收标准（简要）

- [x] AC1: 自定义 Skill、Agent、RoleAgent 窗体显示“导出 ZIP”图标按钮，系统内置 Skill 不显示。
- [x] AC2: 点击后异步压缩对应 `data/skills/{id}` 或 `data/agents/{id}` 完整目录。
- [x] AC3: ZIP 创建成功后使用系统文件管理器打开所在目录并选中 ZIP（自动化覆盖 Electron shell 调用，系统 UI 纳入发布后人工抽检）。
- [x] AC4: 重复导出安全替换同名 ZIP，不留下半成品。
- [x] AC5: 非法 ID、目录不存在、压缩或系统定位失败均返回明确错误，UI 可重试。
- [x] AC6: 自动化测试覆盖路径解析、ZIP 内容、IPC、UI 三类入口和失败路径。
- [x] AC7: 系统内置 Skill 按 `originos-system` 元数据禁止导出，IPC 不能绕过。

## 文档导航

- [需求文档](./requirements.md)
- [交互设计](./interaction.md)
- [架构设计](./architecture.md)
- [开发文档](./implementation.md)
- [测试文档](./testing.md)
- [返回 Epic OS](../README.md)

## 进度跟踪

- [x] Story 文档创建
- [x] 测试用例定义
- [x] 主进程导出服务与 IPC
- [x] Web 侧共享导出控件
- [x] Skill / Agent / RoleAgent 窗体接入
- [x] 自动化验证与架构检查
- [x] 发布前自动化验证完成，系统文件管理器定位纳入 `0.1.43` 发布后抽检

## 变更历史

| 日期 | 变更内容 | 变更人 |
|------|---------|--------|
| 2026-07-26 | 创建 Story 并定义实现与测试范围 | Codex |
| 2026-07-26 | 完成实现与自动化验证，进入桌面人工验收 | Codex |
| 2026-07-26 | 完成 Story，纳入 OriginOS CE 0.1.43 发布 | Codex |
