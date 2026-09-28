# Story 10.5: 系统托盘与全局快捷键

**Story 编号:** 10.5
**Epic:** 10 - OriginOS CE 客户端
**优先级:** 🟢 Low
**状态:** 📝 Draft
**创建日期:** 2026-06-02

---

## 📋 概述

实现系统托盘图标和全局快捷键，提升桌面体验。用户可以通过托盘快速访问应用，使用快捷键唤起快速启动面板。

---

## 🎯 目标

- 系统托盘图标（macOS / Windows / Linux）
- 托盘菜单：打开主窗口、最近项目、退出
- 全局快捷键：`Cmd/Ctrl+Shift+O` 唤起快速启动
- 开机自启动选项（可选）

---

## ✅ 验收标准

**Given** 应用在后台运行
**When** 查看系统托盘
**Then** 显示 OriginOS 图标

**Given** 点击托盘图标
**When** 选择"打开主窗口"
**Then** 主窗口显示并获得焦点

**Given** 按下 `Cmd/Ctrl+Shift+O`
**When** 应用在后台
**Then** 快速启动面板弹出

**Given** 退出应用
**When** 选择托盘菜单"退出"
**Then** 托盘图标消失，应用完全退出

---

## 📚 文档导航

- [需求文档](./requirements.md) - 功能需求与验收标准
- [实施文档](./implementation.md) - 开发步骤与代码变更
- [测试文档](./testing.md) - 测试策略与测试用例

---

## 📚 相关文件

- `electron/tray-manager.ts` - 系统托盘管理器
- `electron/shortcuts.ts` - 全局快捷键管理器
- `electron/main.ts` - 主进程入口（初始化）
- `src/components/os/QuickLauncher.tsx` - 快速启动面板
- `resources/icons/tray-icon.png` - 托盘图标
