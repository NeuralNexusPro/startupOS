# 测试策略 - Story AG.4

**Story:** 组件分层条款修订（CLAUDE.md 与现实对齐）
**Epic:** AG — 架构治理与围栏对齐
**最后更新:** 2026-07-17

---

## 测试策略

本 Story 的测试以**文档一致性验证**为主：确认 CLAUDE.md 各条款的修订内容与项目现实对齐，确认旧条款已被正确替换或删除，确认新增条款的完整性和准确性。

### 测试前置条件

- AG.2 shared 层已建立（Layer 0 定义有据可依）
- AG.1 确认 `organisms/CommandInterface.tsx` 的处置结果

---

## 验收测试用例

### TC-1: §目录结构规约 组件子树与现实一致

**验证目标：** CLAUDE.md 中的 `src/components/` 目录结构描述与实际代码目录匹配

**检查项：**
- `src/components/` 子树列出 `ui/ framework/ interview/ os/ project/ sandbox/ skills/ solution/ taste/ window/`
- 不再包含 `molecules/`（或仅作为兼容路径说明）
- 不再包含 `organisms/`

---

### TC-2: §UI/UX 规约 不再强制三段式

**验证目标：** CLAUDE.md §UI/UX 规约 中不存在强制要求 atoms/molecules/organisms 的条款

```bash
grep -n "atoms\|molecules\|organisms" CLAUDE.md
```

**预期结果：** 仅出现在「兼容路径说明」上下文中，或完全不出现

---

### TC-3: §依赖层级定义 含 Layer 0

**验证目标：** CLAUDE.md §依赖层级定义 包含 Layer 0 `lib/shared/` 定义

**检查项：**
- Layer 0 位于最底层
- 明确标注「仅 `.ts` 类型与接口定义，禁止实现 / 类与函数体 / React 运行时依赖」
- 明确标注「可被任意层 import；本身不 import 任何上层」

---

### TC-4: §模块依赖规约 含 UI 豁免条款

**验证目标：** CLAUDE.md §模块依赖规约 包含模块 UI 子目录的豁免与 ui-deps 注入约束

**检查项：**
- 明确说明 `src/modules/{module}/ui/` 的豁免规则
- 明确说明必须通过 `CollaborationRuntimeUiDeps` 等接口注入外部 UI 组件
- 明确禁止模块 UI import `@/components/**` 与 `@/lib/**`

---

### TC-5: CLAUDE.md 版本号和日期更新

**验证目标：** CLAUDE.md 版本号更新为 v2.5.0，「最后更新」日期更新

**检查项：**
- 文件头部版本号 = `2.5.0`
- 「最后更新」日期 = 修订合入日期

---

### TC-6: changelog 变更记录

**验证目标：** `docs/changes/changelog.md` 追加了 docs 类型变更记录

**检查项：**
- 新条目格式符合 §变更管理 要求（日期、类型=docs、影响模块、简述）

---

### TC-7: 旧术语全文搜索

**验证目标：** CLAUDE.md 全文搜索 `atoms\|molecules\|organisms` 的命中位置全部为兼容路径说明或不再命中

```bash
grep -n "atoms\|molecules\|organisms" CLAUDE.md
```

**预期结果：** 0 命中，或所有命中均在「兼容路径说明」上下文中

---

### TC-8: 目录结构变化同步

**验证目标：** AG.1 / AG.2 / AG.3 涉及的目录结构变化在 CLAUDE.md §目录结构规约中已同步

**检查项：**
- `lib/shared/` 出现在目录结构图中
- `src/lib/` 下不再列出已迁移的旧目录（agents/、skills/、ontology/ 等）
- `src/modules/` 结构描述反映 AG.2 的 DI 扩展
