# 测试策略 - Story AG.11

**Story:** 重复与死代码嗅探治理
**Epic:** AG — 架构治理与围栏对齐
**最后更新:** 2026-09-30

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

**结果（2026-09-30，Proposal worktree）：** ✅ knip 6.38.0，报告归档 `knip-baseline.md`（files 121 / exports 80 / exported types 71 / deps 64 / devDeps 32；含人工甄别注记，perception-plugin-* 与 pi-agent-adapter 为 `pnpm --filter` 构建脚本消费的 knip 已知误报）

---

### TC-2: 双文档树处置生效

```bash
git ls-files .teamai | wc -l
```

**预期结果：** 按 B-2 落地选项验证——B-2-a 为 `0`；B-2-b 保持 868 但两份 index.md 均已标注权威关系（grep 验证）

**结果（2026-09-30）：** ✅ B-2-a：`git ls-files .teamai | wc -l` = 0；`.gitignore` 含 `.teamai/`；本地 `.teamai/docs` 保留（commit bea3547）

---

### TC-3: 空壳清理生效

```bash
ls packages/service 2>/dev/null        # 预期 No such file（或 AGENTS.md 已记录保留理由）
ls data/data 2>/dev/null               # 预期 No such file（或数据已迁移）
ls release 2>/dev/null                 # 预期 No such file
ls packages/web/data 2>/dev/null       # 预期 No such file（或已迁移并记录）
```

**结果（2026-09-30）：** ✅ `packages/service` No such file（commit bd773e5）；`packages/web/data` git 追踪 0 且本地已删（commit 45ac675）；`release/` 实测 `.gitignore` 已含 `/release`（Story 盘点已过时，无需删除）；`data/data` 未在 Proposal worktree 出现（未追踪运行数据不随 worktree 传播），主工作区物理删除留待合并后执行并回写

---

### TC-4: 双端构建

```bash
pnpm --filter @originos/web build
pnpm --filter @originos/desktop build
```

**预期结果：** 0 error（确认删除项不在编译链路）

**结果（2026-09-30）：** ✅ web build exit 0；desktop tsc 通过（worktree 首次需先构建 4 个 perception-plugin 包 + pi-agent-adapter 以产出 dist 供类型解析，属环境前置而非本次删除导致）

---

### TC-5: 打包冒烟

```bash
pnpm desktop:build:app && 启动打包产物
```

**预期结果：** 主进程正常启动；会话/项目读写正常（确认删除的 data 目录不在运行链路）

**结果（2026-09-30）：** ✅ `pnpm desktop:build` exit 0（19 worker runtime 模块校验 OK）；electron-builder --dir 产出 `release/mac-arm64/OriginOS CE.app`（985M；macOS 签名因无 Developer ID 证书跳过，预期行为）；打包启动 60s 观察：`[setup-data-root] Packaged mode → DATA_ROOT: ~/Library/Application Support/@originos/desktop/data`，0 MODULE_NOT_FOUND

---

### TC-6: 测试基线不回退

```bash
pnpm test && pnpm --filter @originos/desktop test
```

**预期结果：** 通过数 ≥ 基线

**结果（2026-09-30）：** ✅ web 425/425（71 files）；desktop 6 failed | 176 passed (182)，失败集合 = 基线（email-provisioning ×5 + verify-windows-package ×1，2 files）。首跑出现 safe-storage-credential-adapter 短暂失败（3 files / 174 passed），复跑两次均回到基线，隔离运行 2/2 通过——定性为 Electron safeStorage 并发竞态 flake（与 AG.9 基线记录的先例一致），非本次删除回归

---

## 自动化测试验证 goal

本 Story 完成后创建自动化测试验证 goal，目标为通过 TC-1 ~ TC-6。TC-5 打包冒烟若部分依赖人工（安装 dmg 观察启动日志），在 goal 输出中记录人工步骤、观察点与剩余风险。

## 测试验证 goal 执行记录（2026-09-30）

- TC-1 ~ TC-6 全部执行并记录于上表；TC-1/TC-2/TC-3/TC-4/TC-6 完全自动化通过，TC-5 打包冒烟以 CLI 启动 + 日志观察替代 dmg 安装（0 MODULE_NOT_FOUND + setup-data-root 日志证明数据根解析正确），无剩余人工步骤。
- 剩余风险：data/data 主工作区物理删除在合并后执行（未追踪产物，无自动化断言意义）；desktop 测试基线的 safeStorage flake 已知（AG.9 起记录），如需根治应在 desktop 测试基建 Story 处理。
