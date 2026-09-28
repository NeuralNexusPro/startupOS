# 测试策略 - Story AG.11

**Story:** 重复与死代码嗅探治理
**Epic:** AG — 架构治理与围栏对齐
**最后更新:** 2026-09-28

---

## 测试策略

删除类改动以「引用确认留痕 + 双端构建 + 打包冒烟 + 测试基线」验证；knip 集成以「可运行 + 报告归档」验收。

### 测试前置条件

- 记录基线：`pnpm test` 通过数、仓库 git 追踪文件数。

---

## 验收测试用例

### TC-1: knip 可运行

```bash
npx knip --version && npx knip 2>&1 | head -50
```

**预期结果：** 正常退出并产出报告（warning 允许存在，error 不得来自配置错误）；报告已归档至 `knip-baseline.md`

---

### TC-2: 双文档树处置生效

```bash
git ls-files .teamai | wc -l
```

**预期结果：** 按 B-2 落地选项验证——B-2-a 为 `0`；B-2-b 保持 868 但两份 index.md 均已标注权威关系（grep 验证）

---

### TC-3: 空壳清理生效

```bash
ls packages/service 2>/dev/null        # 预期 No such file（或 AGENTS.md 已记录保留理由）
ls data/data 2>/dev/null               # 预期 No such file（或数据已迁移）
ls release 2>/dev/null                 # 预期 No such file
ls packages/web/data 2>/dev/null       # 预期 No such file（或已迁移并记录）
```

---

### TC-4: 双端构建

```bash
pnpm --filter @originos/web build
pnpm --filter @originos/desktop build
```

**预期结果：** 0 error（确认删除项不在编译链路）

---

### TC-5: 打包冒烟

```bash
pnpm desktop:build:app && 启动打包产物
```

**预期结果：** 主进程正常启动；会话/项目读写正常（确认删除的 data 目录不在运行链路）

---

### TC-6: 测试基线不回退

```bash
pnpm test && pnpm --filter @originos/desktop test
```

**预期结果：** 通过数 ≥ 基线

---

## 自动化测试验证 goal

本 Story 完成后创建自动化测试验证 goal，目标为通过 TC-1 ~ TC-6。TC-5 打包冒烟若部分依赖人工（安装 dmg 观察启动日志），在 goal 输出中记录人工步骤、观察点与剩余风险。
