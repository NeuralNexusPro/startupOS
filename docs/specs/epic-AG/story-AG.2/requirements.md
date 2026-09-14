# 需求文档 - Story AG.2

**任务:** AG2-T1；**更新:** 2026-09-11

## 用户故事

作为维护者，我需要消除当前 34 处真实依赖违规，使检查器成为可通过的回归门禁，并保留 Agent 与记忆功能。

## 验收标准

1. 原 `pnpm lint:boundaries` 退出 0；扫描范围及规则不放宽，无存量白名单。
2. 下层不再引用 features/modules；跨层 DTO 和纯函数只有一份实现，业务编排位于业务层。
3. 普通 Agent、RoleAgent、Project Agent、协作和 Desktop worker 启动与恢复保持行为，缺少必需业务依赖时明确失败。
4. 记忆所有权隔离、Frozen Snapshot、既有数据格式及配置解析不变，无数据迁移。
5. 业务工具完整注册，重复初始化幂等；名称、scope、授权和 IPC 协议兼容，打包产物可加载。
6. ToolExecutionFrame 归入通用 UI，运行中/成功/失败状态与原展示行为一致。
7. testing.md 中 AG2-T1 用例有执行证据；已有 lint warning 不作为新增修复范围，但不得新增由本次引入的错误。

## 风险与回滚

启动路径漏接、循环导入、owner 串写和 worker 打包漏文件是主要风险，通过对应集成用例验证。集成后可回退整个 Proposal，不需要更改用户文件。

## 非目标

不全面重写 Agent、不扩大检查器、不补齐其他 Epic、不将本次清零等同全仓架构合规。

## AG2-T4 Windows迁移后打包校验

0.2.2发布校验仍要求旧integrations层schedule-tools路径。按当前业务层位置校验ASAR，外置worker资源依照实际加载契约；不新增业务副本、不降低缺包检测。用户界面和业务行为不变，发布通过现有Desktop Release重新触发。验收见testing.md。
