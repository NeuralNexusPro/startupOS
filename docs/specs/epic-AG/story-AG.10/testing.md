# 测试策略 - Story AG.10

**Story:** 巨型文件拆分 — 单一职责重构
**Epic:** AG — 架构治理与围栏对齐
**最后更新:** 2026-09-28

---

## 测试策略

以「既有测试全绿 + 编译 + 循环检查 + 模块冒烟」验证纯移动重构。每个 task（文件）独立走一遍完整链路。

### 测试前置条件

- 记录基线：`pnpm test` 通过数、madge 循环数。

---

## 验收测试用例

### TC-1: 导出符号不变（静态）

```bash
# 拆分前后各跑一次，diff 为空（或仅新增 re-export 行）
grep -E "^export" <target-file> | sort > /tmp/before.txt
# 拆分后对门面文件重复并对比
```

**预期结果：** 符号集合不变

---

### TC-2: 双端编译

```bash
pnpm --filter @originos/web build
pnpm --filter @originos/desktop build
```

**预期结果：** 0 error

---

### TC-3: 测试基线不回退

```bash
pnpm test && pnpm --filter @originos/desktop test
```

**预期结果：** 通过数 ≥ 基线；被拆文件的既有测试文件路径不变且全绿

---

### TC-4: 循环导入检查

```bash
npx madge --circular packages/core/src --extensions ts,tsx
```

**预期结果：** 循环数 ≤ 基线

---

### TC-5: 模块冒烟（按 task 对应执行）

| Task | 冒烟场景 |
|------|---------|
| T1 page.tsx | 首页加载、窗口打开/关闭、Dock 交互 |
| T2 client-hooks | Skill 对话流式会话收发 |
| T3 coordinator | Agent 会话内任务执行一次 |
| T4 composition | 新建项目并启动 Project Agent |
| T5 agent.ts | 普通会话 + RoleAgent 各一次 |
| T6 contract-execution | 最小协作会话执行到完成 |
| T7 supervisor-dag | Supervisor 模式任务分解 + 失败重分配（可用 scripts/test-supervisor-execution.ts） |

**预期结果：** 各场景行为与拆分前一致，无新增报错

---

### TC-6: 行数达标

```bash
wc -l <每个新文件>
```

**预期结果：** 单文件 ≤ 600 行（编排类 ≤ 800 行且 PR 已说明）

---

## 自动化测试验证 goal

本 Story 完成后创建自动化测试验证 goal，目标为通过 TC-1 ~ TC-6。TC-5 冒烟中依赖 LLM 实际响应的场景，允许以「事件流到达 + 无错误」为自动化断言；无法自动化的步骤在 goal 输出中记录人工步骤与剩余风险。
