# 测试策略 - Story AG.8

**Story:** 包边界治理 — 消灭跨包相对路径穿透
**Epic:** AG — 架构治理与围栏对齐
**最后更新:** 2026-09-29

---

## 测试策略

以**静态扫描 + 编译 + 打包冒烟 + IPC 行为回归**四层验证。静态扫描确认清零，编译确认类型链完整，打包冒烟确认 Electron 运行时解析，IPC 回归确认核心链路未破坏。

### 测试前置条件

- 记录基线：`pnpm lint:boundaries` 诊断数、`pnpm test` 通过数（Epic AG 既有基线延续）。
- **AG.8-T1 基线（2026-09-29 实测）**：desktop 非测试 `from` 形态 123 处 / 30 文件，side-effect 21 处；self-test 43 例；desktop 测试存量失败 6（email-provisioning ×5、verify-windows-package ×1，未改动主 workspace 同样失败）。

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

---

## AG.8-T1 测试结果记录（2026-09-29）

| 用例 | 结果 | 证据 |
|------|------|------|
| TC-1 | 部分达成（T1 范围内） | spike 3 文件清零（commit 8256af7）；存量 128 留待 T2，`lint:boundaries` 基线一致 |
| TC-2 | ✅ 通过 | `check-architecture-boundaries.cjs --self-test` 50/50（43→50，新增 side-effect / import type / 动态 import / typeof import 反例）；拦截机制为 `no-restricted-syntax`（zones 误报 ~589 被弃，见 architecture.md A-0） |
| TC-3 | ✅ 通过 | `pnpm --filter @originos/desktop build` 0 error；web type-check 通过 |
| TC-4 | ✅ 通过 | `build:app` 端到端 0 退出；`verify-ontology-runtime.js` 开发态全项 ok（含恢复账本、冻结 WorkItem、Task Runtime 恢复）；electron-builder `--dir` 打包成功；说明符字面量确认保留（`setup-data-root.js:1` = `require("@originos/core/lib/paths")`），F1 staging 24/24 说明符 resolve 通过（fail-fast 内建于 prepare-core-runtime.js）。前置既有缺陷修复 2 处（prepare-web-standalone.js 误拒 hoisting、verify-ontology-runtime.js 挂起不退出） |
| TC-5 | ⏳ 待打包产物启动后人工回归 | Agent 会话 / 本体读写 / 协作会话三场景；--dir 产物启动冒烟由 3.1 完成，IPC 手工回归在合并前执行 |
| TC-6 | ✅ 无回退 | desktop 测试失败 6 全部为存量（与未改动主 workspace 对照一致）；core/web 套件无新增失败 |

**自动化覆盖说明：** TC-5 无法完全自动化（需真实 Electron 窗口交互），人工步骤：`pnpm --filter @originos/desktop pack` → 启动 `release/mac-arm64/OriginOS CE.app` → 验证 [setup-data-root] 日志、无 MODULE_NOT_FOUND → 走 TC-5 三场景。剩余风险：动态计算 import 的 @originos/core 说明符目前不存在，若未来引入，打包态会在启动期以 MODULE_NOT_FOUND 显式暴露（staging 闭集校验只覆盖静态 require）。
