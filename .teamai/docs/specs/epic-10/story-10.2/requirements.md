# 需求 - Story 10.2

**Story:** 原生窗体系统 — 多窗口管理
**Epic:** 10 - OriginOS CE 客户端
**最后更新:** 2026-06-02

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

## ✅ 验收标准

**Given** 在 Electron 环境中
**When** 打开 Agent 窗体
**Then** 创建独立的 BrowserWindow
**And** 窗口可拖拽、调整大小、最小化/最大化

**Given** 在浏览器环境中
**When** 打开 Agent 窗体
**Then** 使用现有的 AppWindowManager（CSS 模拟窗体）

---

## 🔗 依赖关系

- 前置 Story: 10.1（Electron 基础框架搭建）

---

## 📚 相关文档

- [架构设计](./architecture.md) - 技术实现方案
- [测试策略](./testing.md) - 测试用例和验证方法
- [返回 Story 概览](./README.md)
