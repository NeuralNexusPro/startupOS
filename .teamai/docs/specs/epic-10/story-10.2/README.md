# Story 10.2: 原生窗体系统 — 多窗口管理

**Story 编号:** 10.2
**Epic:** 10 - OriginOS CE 客户端
**优先级:** 🔴 High
**状态:** 📝 Draft
**创建日期:** 2026-06-02

---

## 📋 概述

用 Electron BrowserWindow 取代浏览器内模拟的 AppWindowManager，实现真正的 OS 级多窗体管理。

---

## 🎯 目标

- 实现 `ElectronWindowManager` 类（Main Process）
- 定义 IPC 协议
- Renderer 端适配
- 条件分支：Electron 原生窗体 vs 浏览器 fallback

---

## 📚 文档导航

| 文档 | 内容 |
|------|------|
| [需求规格](./requirements.md) | 用户故事、验收标准、依赖关系 |
| [架构设计](./architecture.md) | 技术栈、模块设计、代码实现 |
| [测试策略](./testing.md) | 测试用例、验证方法 |
