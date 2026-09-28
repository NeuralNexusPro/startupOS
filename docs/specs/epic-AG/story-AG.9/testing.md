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

### TC-2: 深路径导入收敛

```bash
grep -rEoh "@originos/core/(lib|modules)/[a-z0-9/-]+" packages/web/src packages/desktop/src \
  --include="*.ts" --include="*.tsx" | sort -u | wc -l
```

**预期结果：** 唯一深路径说明符数较基线下降 ≥ 70%；且每条均能在 exports 白名单中精确命中（脚本校验，纳入 `expand-core-exports.cjs` 的 `--verify` 模式）

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
