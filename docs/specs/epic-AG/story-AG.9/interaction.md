# 交互设计 - Story AG.9

**Story:** core 包治理 — 公共 API 收缩与定位如实化
**Epic:** AG — 架构治理与围栏对齐

---

## 不适用说明

本 Story 为纯架构治理（core package.json exports 收缩、feature 门面补齐、文档定位如实化、jsx 死代码与 web 壳目录清理），**不涉及任何用户界面、交互流程或用户可见行为变更**。

- 无新增/修改页面、组件、对话框
- 无用户流程、状态、错误提示、响应式/可访问性相关改动
- 全部验证以静态扫描、编译、打包冒烟与自动化测试覆盖（见 [testing.md](./testing.md)）

## 用户可见影响

零。所有变更（exports 白名单、门面导出、壳目录删除）对最终用户透明，运行行为不变；验收以 TC-4 打包冒烟「无 MODULE_NOT_FOUND、[setup-data-root] 正常」兜底确认。
