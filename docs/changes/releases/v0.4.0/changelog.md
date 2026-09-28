# Changelog - v0.4.0

---

## 2026-09-28 — docs：架构围栏治理与 Epic AG Story 追加（AG.8–AG.11）

**类型**：docs
**影响模块**：`AGENTS.md`（v2.5.8 → v2.6.3）、`CLAUDE.md`（改为指针文件）、`docs/specs/epic-AG/`
**摘要**：架构审视后完成规约围栏治理：确立 AGENTS.md 为单一事实源，CLAUDE.md 变为工具兼容指针；AGENTS.md 补入多 Agent 协作运行时章节（facade/ui 组装豁免取代「不 import 外部模块」声明）、跨包导入必须使用包名说明符条款、协作运行时性能指标、数据根解析规则与实际 data 子目录；技术栈表补入 Monorepo/Electron。新增 4 个治理 Story：AG.8 包边界治理（125 处跨包相对路径 + lint zones）、AG.9 core 公共 API 收缩（exports 通配符 84→显式白名单 + jsx 副本清理）、AG.10 巨型文件拆分（7 文件）、AG.11 重复与死代码嗅探（knip 基线 + 双文档树处置）。

---
