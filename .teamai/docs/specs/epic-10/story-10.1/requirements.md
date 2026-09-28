# 需求文档 - Story 10.1

**Story:** Electron 基础框架搭建
**Epic:** Epic 10 - OriginOS CE 客户端
**最后更新:** 2026-06-02

---

## 📋 概述

建立 Electron + Next.js 的基础项目结构，实现最小可运行的桌面应用。

---

## 🎯 目标

- 初始化 Electron 主进程入口
- 配置 `electron-builder` 打包脚本
- 实现 Main Process 加载 Next.js 应用
- 配置 TypeScript + ESLint 兼容 Electron
- 实现基础窗口创建

---

## ✅ 验收标准

**Given** 开发环境已配置
**When** 执行 `npm run electron:dev`
**Then** Electron 窗口打开并加载 Next.js 首页
**And** 窗口可正常关闭

---

## 🧪 测试用例

1. **启动测试**
   - 执行 `npm run electron:dev`
   - 验证窗口打开并显示首页

2. **关闭测试**
   - 关闭窗口
   - 验证进程退出

3. **热重载测试**
   - 修改 Next.js 代码
   - 验证页面自动刷新

---

## 🔗 相关文件

- `electron/main.ts` - 主进程入口
- `electron/preload.ts` - Preload 脚本
- `src/lib/integrations/electron/env.ts` - 环境检测
- `package.json` - 脚本配置
- `tsconfig.electron.json` - TypeScript 配置
