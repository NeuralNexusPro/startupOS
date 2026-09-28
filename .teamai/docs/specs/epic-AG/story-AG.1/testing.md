# 测试策略 - Story AG.1

**Story:** 死代码与死路径清理
**Epic:** AG — 架构治理与围栏对齐
**最后更新:** 2026-07-17

---

## 测试策略

本 Story 的测试以**静态验证**为主：通过 grep 扫描确认死路径已清除，通过 TypeScript 编译和现有测试套件确认删除操作未破坏运行时行为。所有验证应在单个 PR 中完成，便于整体回滚。

### 测试前置条件

- 记录 Story 开始前的 `npm test` 失败数作为基线
- 记录 Story 开始前的 `npm run lint` error 数作为基线

---

## 验收测试用例

### TC-1: 死路径 import 清零

**验证目标：** 不应有任何 import 指向已删除的 `collaboration-runtime-bridge` 目录

```bash
grep -rn "@/lib/collaboration-runtime-bridge" src/
```

**预期结果：** 输出行数为 `0`

---

### TC-2: TypeScript 编译通过

**验证目标：** 所有删除和 import 修改未引入类型错误

```bash
npx tsc --noEmit
```

**预期结果：** 0 error

---

### TC-3: 现有测试套件不退化

**验证目标：** 删除操作未破坏任何运行时行为

```bash
npm test
```

**预期结果：** 失败数 ≤ Story 开始前基线（不引入新的失败）

---

### TC-4: Lint 不引入新 error

**验证目标：** 变更未触发新的 lint error

```bash
npm run lint
```

**预期结果：** 新增 error 数 = 0（既有 error 不在本 Story 范围）

---

### TC-5: B-1 决策一致性

**验证目标：** B-1（deprecated 服务壳）的处理方案已明确落定

**检查项：**
- PR 描述或 changelog 中明确记录采用 B-1-a 或 B-1-b
- 实际代码变更与记录的方案一致

---

### TC-6: 单 PR 提交完整性

**验证目标：** 所有删除操作通过单个 PR 提交，便于回滚

**检查项：**
- PR 描述包含 grep 结果作为证据
- PR 包含所有 A/B/C 必做项的变更
