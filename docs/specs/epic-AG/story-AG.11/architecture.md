# 架构设计 - Story AG.11

**Story:** 重复与死代码嗅探治理
**Epic:** AG — 架构治理与围栏对齐
**最后更新:** 2026-09-28

---

## 必做项

### A：knip 接入（基线）

- [ ] **A-1** devDependencies 加入 `knip`；新建 `knip.json`：entry 覆盖 Next.js（`packages/web/src/app/**/{page,layout,route}.ts(x)`）、Electron main（`packages/desktop/src/main/main.ts`、preload）、adapter entry（`packages/agent/src/*-entry.js`）；`ignore` 排除 `.next/`、`dist*/`、`release/`。
- [ ] **A-2** 运行 `npx knip`，报告整理为 `knip-baseline.md`（按「文件级死码 / 导出级死码 / 依赖级死码」分组）；**基线只记录不删除**，导出级清理另行排期。

### B：双文档树处置

- [ ] **B-1** 消费方确认：`grep -rn "teamai" scripts/ packages/*/scripts package.json .github/`；检查 teamai 工具链是否读取 `.teamai/docs`。
- [ ] **B-2** 依据确认结果二选一：
  - **B-2-a（若仅快照）**：`git rm -r --cached .teamai/docs` + `.gitignore` 追加 `.teamai/`（或仅 docs 子树），保留本地副本过渡，下一个版本目录清理时物理删除。
  - **B-2-b（若被工具依赖）**：在 `docs/index.md` 与 `.teamai/docs/index.md` 双向标注权威方为 `docs/`，`.teamai/docs` 标注「工具快照，勿手改」，并在本 story 备忘同步脚本需求（后续 task）。

### C：空壳与误嵌套

- [ ] **C-1** `packages/service/`：`grep -rn "@originos/service" packages/ --include="*.ts*" --include="*.json" | grep -v node_modules`；零引用 → 删除目录。有引用（如 openspec/AGENTS.md 规划性提及）→ AGENTS.md 目录树条目标注「预留，暂空」。
- [ ] **C-2** `data/data/`：检查 `data/data/sessions` 内容（`ls -la`、抽样 JSON 时间戳）；确认是否为旧版本误写路径产物；无消费 → 删除；有数据 → 迁移到 `data/sessions/` 并记录。
- [ ] **C-3** `release/`：确认 `.gitignore` 含 `release/`；本地 `rm -rf release/`（构建产物，可随时重建）。
- [ ] **C-4** `packages/web/data/`（agents、projects 子目录）：与根 `data/` 对照内容新旧；确认为旧开发态遗留 → 删除；若含独有数据 → 迁移到根 `data/` 对应子目录。`packages/desktop/data` 若存在同法处置。
- [ ] **C-5** 处置后核对 AGENTS.md 目录树与数据存储章节（v2.6.3），更新与现实不符的条目。

## 技术细节

### knip 初始配置草案

```jsonc
// knip.json
{
  "$schema": "./node_modules/knip/schema.json",
  "workspaces": {
    "packages/web": { "entry": ["src/app/**/{page,layout,route}.ts{,x}", "next.config.mjs"] },
    "packages/desktop": { "entry": ["src/main/main.ts", "src/main/preload.ts"] },
    "packages/core": { "entry": ["src/index.ts"] }
  },
  "ignore": ["**/.next/**", "**/dist*/**", "release/**", "**/__tests__/**", "**/*.test.*"]
}
```

（实施时按实际 monorepo 结构调整；workspace 协议依赖 `workspace:*` 已天然支持。）

### 引用确认命令清单

```bash
grep -rn "@originos/service" packages/ --include="*.ts*" --include="*.json" | grep -v node_modules
git grep -l "data/data" -- "*.ts" "*.tsx" "*.md" | head
ls -la data/data/sessions/
ls -la packages/web/data/ packages/desktop/data/ 2>/dev/null
git grep "\.teamai" -- "*.ts" "*.js" "*.cjs" "*.mjs" "*.sh" "*.yml" "*.yaml"
```
