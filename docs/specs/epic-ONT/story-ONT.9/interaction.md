# 交互设计文档 - Story ONT.9

**Story:** Agent 工具与遗留写入口的本体治理
**版本:** 1.0
**最后更新:** 2026-10-12

---

## 🎨 设计概览

### 设计目标

本 Story 是后端/工具层治理，不新增用户交互面。交互变化仅限三处既有场景的行为与文案：

1. Agent 会话中调用本体工具的结果反馈（成功文案含「已写入项目本体」；失败文案区分冲突/校验失败/未迁移）
2. Web `/api/ontology-data/*` 写请求的拒绝响应（错误码 + 指引文案）
3. 并入脚本的终端输出（dry-run 清单 → 确认 → 执行回执）

### 参考 UX 规范

不适用（无 UI 组件改动）；错误文案遵循 AGENTS.md「CUI 交互」与现有结构化错误风格。

---

## 🗺️ 用户流程

### 主流程：Agent 经工具写本体（治理后）

1. 用户在协作/项目会话中要求「把行政部建到部门概念下」
2. Supervisor 调用 `create_instance`（conceptId=部门）
3. 工具经 authoring 通道写入 canonical → 返回 `{ success: true, instance: {...}, ontologyId, message: "实例已写入项目本体" }`
4. 用户打开项目工作区「数据」页签 → 立即看到该实例（同一事实源）

### 分支：未迁移旧项目调用工具

- 工具返回 `{ success: false, error: { code: 'MIGRATION_REQUIRED', message: '该项目尚未完成本体迁移，请在项目设置中执行显式迁移' } }`；Agent 可向用户转述

### 分支：并发/校验失败

- CAS 冲突 → `{ code: 'REVISION_CONFLICT', message: '本体已被其他操作更新，请重试' }`（工具实现内自动重试一次，仍冲突才返回）
- validator 拒绝 → 返回 issues 摘要（conceptId 不存在等），零写入

### 分支：Web API 写请求（残留直连）

- 响应 405/409 + `{ success: false, error: { code: 'CANONICAL_EDIT_UNAVAILABLE', message: '本体编辑请使用 canonical 入口' } }`
- 现状无 UI 触达这些路由（消费方已死），该响应仅防御外部/遗留调用

---

## 🖥️ 状态与文案

| 场景 | 文案 |
|------|------|
| 写入成功 | 「已写入项目本体（{ontologyVersion}）」 |
| 未迁移 | 「该项目尚未完成本体迁移，请先在项目设置执行显式迁移」 |
| 冲突 | 「本体已被其他操作更新，请重试」 |
| 校验失败 | 「校验失败：{issues 摘要}」 |
| Web 写拒绝 | 「CANONICAL_EDIT_UNAVAILABLE — 本体编辑请使用 canonical 入口」 |

---

## ♿ 可访问性 / 响应式

不适用（无新增 UI 组件）。

---

## 📝 备注

- 并入脚本为一次性维护操作（终端交互），不属于产品交互面；dry-run 输出格式见 implementation.md
