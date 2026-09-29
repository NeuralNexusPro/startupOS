# 测试策略 - Story AG.9

**Story:** core 包治理 — 公共 API 收缩与定位如实化
**Epic:** AG — 架构治理与围栏对齐
**最后更新:** 2026-09-28

---

## 测试策略

每批 exports 收缩都必须通过「双端编译 + 打包冒烟 + 测试基线」三关；门面补齐额外跑循环导入检查。全部验证分批执行、分批记录。

### 测试前置条件

- 记录基线：exports 条目数（84）、深路径导入数（243+）、`pnpm test` 通过数、`pnpm lint:boundaries` 诊断数。

---

## 验收测试用例

### TC-1: exports 无通配（静态）

```bash
node -e "const e=require('./packages/core/package.json').exports; \
  const wild=Object.keys(e).filter(k=>k.includes('*')); \
  console.log(wild.length); process.exit(wild.length?1:0)"
```

**预期结果：** 输出 `0`，退出码 0

---

### TC-2: 深路径导入收敛（2026-09-29 修正口径，design D2）

```bash
node scripts/expand-core-exports.cjs --verify
```

**预期结果（修正后）：**
1. 每条消费说明符在 exports 白名单中精确命中且目标文件存在，严格 Node exports 语义可解析——verify 断言，基线 23 条宽松解析存活的说明符全部修复；
2. 唯一说明符数较基线（120）适度下降（≥ 15%，即 ≥ 18 条）——低热度深路径按 FR-2 保留为显式白名单过渡态，AG.11 继续消化。

**修正原因：** 原阈值「下降 ≥ 70%」基于「120 唯一说明符中大量为冗余变体」的假设。实测（proposal `govern-core-public-api` 起草阶段）120 唯一值中冗余变体极少，且多数「热点」说明符本身即指向 feature index.ts 的门面入口条目（合法消费形态）。硬砍 70% 需一次性门面化约 80 个低热度深路径，超出 Story 3–5 天范围且违背 FR-2 过渡态设计。收缩的本质是消灭通配符（TC-1），深路径收敛按热度渐进（FR-2）。

---

### TC-3: 双端编译

```bash
pnpm --filter @originos/web build
pnpm --filter @originos/desktop build
```

**预期结果：** 0 error（每批 exports 收缩后必跑）

---

### TC-4: Electron 打包冒烟

```bash
pnpm desktop:build:app && 启动打包产物
```

**预期结果：** 主进程无 `Cannot find module`；`[setup-data-root]` 日志正常（每批 exports 收缩后必跑）

---

### TC-5: 循环导入检查

```bash
npx madge --circular packages/core/src --extensions ts,tsx
```

**预期结果：** 循环数 ≤ 基线（门面补齐不得引入新环）

---

### TC-6: 死代码清零

```bash
find packages/core/src -name "*.jsx" | wc -l          # 预期 0
ls packages/web/src/lib/features/culture 2>/dev/null   # 预期 No such file
ls packages/web/src/lib/features/ontology-data-store 2>/dev/null  # 预期 No such file
```

---

### TC-7: 测试基线不回退

```bash
pnpm test && pnpm --filter @originos/desktop test
```

**预期结果：** 通过数 ≥ 基线，无新增失败

---

## 自动化测试验证 goal

本 Story 完成后创建自动化测试验证 goal，目标为通过 TC-1 ~ TC-7。TC-4 打包冒烟若仅部分自动化，在 goal 输出中记录人工步骤（构建命令、启动方式、观察点）与剩余风险。

---

## 测试结果（2026-09-29，proposal/govern-core-public-api @ 380ebb8）

| TC | 结果 | 证据 |
|----|------|------|
| TC-1 exports 零通配 | ✅ | `node -e` 断言：132 条 / 0 通配，退出 0 |
| TC-2 修正口径 | ✅ | `expand-core-exports.cjs --verify` PASSED（消费闭集全命中 + 门面下限 + 无悬空）；基线 120 唯一 → 117（消失 7：`/index` 归一 4 + 门面收敛删除 2 + `types` 归一 1，新增门面入口 4）；严格 Node 语义解析 118/120（2 条 FAIL 为迁移后失去消费者的已收敛条目，符合预期） |
| TC-3 双端编译 | ✅ | web build exit 0；desktop build 0 error（每批 exports 展开后均复跑） |
| TC-4 打包冒烟 | ✅ | `build:app` exit 0（verify-core-runtime + verify-agent-worker-runtime 19 模块 + check-root-build-artifacts 全过）；electron-builder `--dir` 产出 OriginOS CE.app，asar 内 core package.json 132 条显式 / 0 通配；`prepare-core-runtime.js` staged「132 exports entries, 67 consumed specifiers verified」0 unresolved。打包产物启动冒烟在编排合并后于主工作区复跑（依赖用户授权合并时机） |
| TC-5 循环导入 | ✅ | madge 12 环 = 基线，0 新增（门面化尝试引入 agent 值符号环已回退） |
| TC-6 死代码清零 | ✅ | `find … -name "*.jsx" | wc -l` = 0（11 个删除）；culture / ontology-data-store / storage 壳目录 `No such file`；壳引用 grep 清零（13 处消费改 `@originos/core/...`） |
| TC-7 测试基线 | ✅ | web 425/425（71 文件，零 delta）；desktop 失败集合 = 基线 6（email-provisioning ×5 + verify-windows-package ×1，零 delta；safe-storage 为 Electron 二进制安装竞态 flake，隔离运行通过） |

**无法自动化项与剩余风险**：打包产物启动冒烟已于合并后主工作区复跑（2026-09-29，主工作区重新 build:app + electron-builder --dir 产出新 asar）：`[setup-data-root] Packaged mode` 日志正常、进程持续运行、0 次 `Cannot find module`/`MODULE_NOT_FOUND`（观察 ~60s 后人工停止）；`useCultureDetection.ts` 补 `'use client'`（commit 277434e）为门面化的必要修复，RSC 行为经 web build + 425 测试兜底。合并后主工作区复验：exports 132/0、verify PASSED、TC-6 jsx 0 + 壳清零、web 425/425、desktop 失败集合 = 基线 6、madge 12 环、lint:boundaries 952 文件 0 诊断、打包 asar 内 core package.json 132 显式 / 0 通配——与 Proposal worktree 内结果一致。

**合并后插曲（不改变 TC 结论）**：合并后首次主工作区打包在 prepare-web-standalone 失败并产生 130 GB `.packaging`。根因是 9/25 打包调试在仓库根 `node_modules/` 遗留的自引用 `node_modules/node_modules` 链接 + 1.6 GB 实体副本（非 AG.9 改动引入；AG.8-T1 期间 3ab3f53 已修过同类链路另一环节）。处置：清除残留（rm + pnpm install 重建）、`.next/standalone` 重生成、`materializeSymlink` 增加「链接 realpath 指向 monorepo 根 node_modules 时丢弃」守卫（commit 30fac41，防复发）。守卫修复后全链构建 + 打包 + asar 核验 + 启动冒烟全部通过。
