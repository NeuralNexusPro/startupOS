# Changelog - v0.4.4

本版本包含 v0.4.3 的全部功能与修复，并修复 macOS 安装包启动时缺少 React 的问题。

## 2026-10-08 — fix：桌面主进程误加载 React Hooks 导致启动失败

**类型**：fix
**影响模块**：Pi Agent 与 Culture 公共导出、桌面主进程服务、macOS/Windows 包校验
**摘要**：主进程经由 core 的公共入口间接加载只供渲染进程使用的 React Hooks，导致打包应用启动时报 `Cannot find module 'react'`。现在主进程使用明确的无 React 导出入口，并在 macOS 和 Windows 包校验中实际加载相关服务，防止同类回归。本地 macOS arm64 测试包已通过启动验证。
