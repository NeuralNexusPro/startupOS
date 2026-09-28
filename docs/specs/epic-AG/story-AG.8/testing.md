# 测试策略 - Story AG.8

**Story:** 包边界治理 — 消灭跨包相对路径穿透
**Epic:** AG — 架构治理与围栏对齐
**最后更新:** 2026-09-28

---

## 测试策略

以**静态扫描 + 编译 + 打包冒烟 + IPC 行为回归**四层验证。静态扫描确认清零，编译确认类型链完整，打包冒烟确认 Electron 运行时解析，IPC 回归确认核心链路未破坏。

### 测试前置条件

- 记录基线：`pnpm lint:boundaries` 诊断数、`pnpm test` 通过数（Epic AG 既有基线延续）。

---

## 验收测试用例

### TC-1: 跨包相对导入清零（静态）

**验证目标：** 生产源码不再有解析到 core/src 的相对导入

```bash
grep -rEn "from ['\"](\.\./)+(\.\./)?core/src/" packages/desktop/src packages/web/src \
  --include="*.ts" --include="*.tsx" | grep -v "__tests__\|\.test\."
```

**预期结果：** 输出为空（0 行）

---

### TC-2: lint 规则生效（正反例）

**验证目标：** zones 规则能拦截新增违规、放行合法说明符

```bash
node scripts/check-architecture-boundaries.cjs --self-test
```

**预期结果：** 自测通过（含新增 desktop→core 相对路径 invalid 用例与 `@originos/core/...` valid 用例）

---

### TC-3: 双端编译

```bash
pnpm --filter @originos/desktop build   # tsc 0 error
pnpm --filter @originos/web type-check  # 0 error
```

**预期结果：** 均为 0 error

---

### TC-4: Electron 打包冒烟（关键失败路径防护）

**验证目标：** 产物内模块解析成立（防「开发态能跑、打包挂」）

```bash
pnpm desktop:build:app
# 启动打包产物（macOS：release/ 下最新 dmg 安装后启动，或 electron-builder --dir 产物二进制）
```

**预期结果：**
- 主进程启动日志正常，无 `Cannot find module` / `MODULE_NOT_FOUND`
- `[setup-data-root]` 日志出现且指向正确数据根
- dock/tray/窗口正常出现

---

### TC-5: 核心 IPC 行为回归

**验证目标：** 迁移只动说明符不动逻辑

| 场景 | 操作 | 预期 |
|------|------|------|
| Agent 会话 | 新建会话并发 1 条消息 | 流式回复正常 |
| 本体读写 | 打开项目本体编辑并保存 | 保存成功，版本号递增 |
| 协作会话 | 启动一个最小协作会话（2 agent） | 事件时间线出现，无 IPC 报错 |

---

### TC-6: 自动化测试基线不回退

```bash
pnpm test   # core + web 套件
pnpm --filter @originos/desktop test
```

**预期结果：** 通过数 ≥ Story 开始前基线，无新增失败

---

## 自动化测试验证 goal

本 Story 完成后创建自动化测试验证 goal，目标为通过 TC-1 ~ TC-6。TC-4（打包冒烟）与 TC-5（IPC 手工场景）若无法完全自动化，在 goal 输出中记录：自动化覆盖的部分、人工执行步骤（含启动命令与观察点）、剩余风险。
