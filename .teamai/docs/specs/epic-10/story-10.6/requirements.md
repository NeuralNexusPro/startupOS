# 需求 - Story 10.6

**Story:** 自动更新与打包分发
**Epic:** 10 - OriginOS CE 客户端
**最后更新:** 2026-06-02

---

## 📋 概述

实现应用自动更新和多平台打包分发。集成 `electron-updater` 实现自动更新，配置 `electron-builder` 生成 macOS / Windows / Linux 安装包。

---

## 🎯 目标

- 集成 `electron-updater` 自动更新
- 配置 `electron-builder` 多平台打包（macOS / Windows / Linux）
- 代码签名（macOS / Windows，可选）
- 更新服务器配置（GitHub Releases）

---

## ✅ 验收标准

**Given** 执行 `npm run electron:build`
**When** 构建完成
**Then** 生成 macOS (.dmg)、Windows (.exe)、Linux (.AppImage) 安装包

**Given** 有新版本发布到 GitHub Releases
**When** 用户打开应用
**Then** 应用检测到新版本并提示更新

**Given** 用户确认更新
**When** 更新完成
**Then** 应用重启，数据不丢失

---

## 🔗 依赖关系

- 前置 Story: 10.1（Electron 基础框架搭建）
- 依赖 GitHub Releases 作为更新服务器

---

## 📚 相关文档

- [架构设计](./architecture.md) - 技术实现方案
- [测试策略](./testing.md) - 测试用例和验证方法
- [返回 Story 概览](./README.md)
