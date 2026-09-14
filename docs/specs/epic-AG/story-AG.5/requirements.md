# 需求规格 - Story AG.5

## 2026-09-11：首轮可执行任务 AG5-T1

本轮仅实施现有 Monorepo 边界检查修正，提案为 `fix-monorepo-boundary-lint`，状态为 AG5-T1 已验证完成，AG.5 其余任务待实施。下方历史整套工具链规划不作为 AG5-T1 验收要求；不得因此宣称 AG.5 全部完成。现行架构以 AGENTS.md 为准，旧 `src/`、atoms/organisms 目录及旧 CLI 命令仅作为历史背景。


**Story:** 自动化围栏（ESLint 边界 + dead-code 工具 + any 预算 + CI 接入）
**Epic:** AG — 架构治理与围栏对齐
**最后更新:** 2026-07-20

---

## 用户故事

> 作为 OriginOS 维护者，我需要把 CLAUDE.md 中的架构围栏从「人工评审」升级为「CI 自动拦截」。当前没有 ESLint `no-restricted-imports` 全局规则、没有 dead-code 工具、没有 `any` 预算门 — 任何穿透模块边界、`any` 滥用、未使用导出都依赖人工 PR review 把关。本 Story 接入工具链，让违规在 CI 阶段被拦截在合入前。

---

## 背景与问题

当前 OriginOS 缺少自动化架构治理工具：

- 没有 ESLint `no-restricted-imports` 全局规则
- 没有 dead-code 检测工具
- 没有 `any` 预算门控

所有架构围栏依赖人工 PR review 把关，容易遗漏。

---

## 范围

### 必做项

#### A. ESLint `no-restricted-imports` 边界规则

- [ ] **A-1** 在 `.eslintrc.json`（或现有 ESLint 配置）中追加 `overrides` 段，按目录注入 `no-restricted-imports`：
  ```jsonc
  {
    "overrides": [
      {
        "files": ["src/modules/**/*.{ts,tsx}"],
        "excludedFiles": [
          "src/modules/*/ui/**"
        ],
        "rules": {
          "no-restricted-imports": ["error", {
            "patterns": [
              { "group": ["@/lib/*", "!@/lib/shared/*"], "message": "modules 不得 import @/lib/**，请通过 deps 注入或 lib/shared 共享类型" },
              { "group": ["@/components/*"], "message": "modules 不得 import @/components/**，请通过 ui-deps 注入" },
              { "group": ["@/services/*"], "message": "modules 不得 import @/services/**" },
              { "group": ["@/app/*"], "message": "modules 不得 import @/app/**" }
            ]
          }]
        }
      },
      {
        "files": ["src/modules/*/ui/**/*.{ts,tsx}"],
        "rules": {
          "no-restricted-imports": ["error", {
            "patterns": [
              { "group": ["@/lib/*", "!@/lib/shared/*"], "message": "module ui 子目录同样不得 import @/lib/**（shared 除外）" },
              { "group": ["@/components/*"], "message": "module ui 子目录不得直接 import @/components/**，UI 通过 deps 注入" }
            ]
          }]
        }
      },
      {
        "files": ["src/lib/shared/**/*.{ts,tsx}"],
        "rules": {
          "no-restricted-imports": ["error", {
            "patterns": [
              { "group": ["@/lib/features/*", "@/lib/integrations/*", "@/lib/storage/*", "@/lib/hooks/*", "@/components/*", "@/services/*", "@/app/*", "@/modules/*"], "message": "shared 层为 Layer 0，不得依赖任何上层" },
              { "group": ["react", "react-dom"], "message": "shared 仅含纯类型，禁止 React 运行时依赖" }
            ]
          }]
        }
      },
      {
        "files": ["src/lib/features/**/*.{ts,tsx}"],
        "rules": {
          "no-restricted-imports": ["error", {
            "patterns": [
              { "group": ["@/components/*", "@/services/*", "@/app/*"], "message": "features 不得依赖上层（components/services/app）" }
            ]
          }]
        }
      },
      {
        "files": ["src/lib/storage/**/*.{ts,tsx}", "src/lib/integrations/**/*.{ts,tsx}", "src/lib/hooks/**/*.{ts,tsx}"],
        "rules": {
          "no-restricted-imports": ["error", {
            "patterns": [
              { "group": ["@/lib/features/*", "@/components/*", "@/services/*", "@/app/*", "@/modules/*"], "message": "基础设施层不得依赖上层" }
            ]
          }]
        }
      }
    ]
  }
  ```
- [ ] **A-2** 渐进式启用策略：
  - **第 1 周**：所有规则以 `"warn"` 级别启用，跑全量 lint，统计实际命中数；写入 `docs/specs/epic-AG/story-AG.5/lint-baseline.md`
  - **第 2 周**：升级为 `"error"`；CI 仅在 PR diff 范围内拦截（`eslint --fix-dry-run` + `lint-staged` 仅扫变更文件），避免历史遗留 error 阻塞日常开发
  - **第 3 周开始**：全仓 `"error"` 强制
- [ ] **A-3** 在 `package.json` 添加便捷脚本：
  ```json
  {
    "scripts": {
      "lint:boundaries": "eslint --rule 'no-restricted-imports: error' src/",
      "lint:boundaries:diff": "git diff --name-only origin/main...HEAD -- 'src/**/*.ts' 'src/**/*.tsx' | xargs eslint --rule 'no-restricted-imports: error'"
    }
  }
  ```

#### B. Dead-code 检查（ts-prune 或 knip）

- [ ] **B-1** 选型决策（默认 **knip**，备选 ts-prune）：
  - **knip**（推荐）：现代化、配置友好、支持 monorepo / Next.js 开箱、能识别 ts-prune 漏掉的「未使用文件」「未使用依赖」
  - **ts-prune**：轻量、零配置但维护停滞，仅识别未使用 export
- [ ] **B-2** 安装并初始化（以 knip 为例）：
  ```bash
  npm i -D knip
  npx knip --init
  ```
- [ ] **B-3** 配置 `knip.json`：
  ```json
  {
    "$schema": "https://unpkg.com/knip@5/schema.json",
    "entry": [
      "src/app/**/page.tsx",
      "src/app/**/route.ts",
      "src/app/layout.tsx",
      "src/modules/*/index.ts"
    ],
    "project": ["src/**/*.{ts,tsx}"],
    "ignore": [
      "src/lib/shared/**",
      "**/*.d.ts",
      "**/*.test.{ts,tsx}",
      "**/__tests__/**",
      "**/*.stories.{ts,tsx}"
    ],
    "ignoreDependencies": [
      "@types/.*"
    ]
  }
  ```
- [ ] **B-4** 在 `package.json` 添加：
  ```json
  {
    "scripts": {
      "deadcode": "knip",
      "deadcode:ci": "knip --reporter compact --no-progress"
    }
  }
  ```
- [ ] **B-5** 渐进式接入：
  - **第 1 周**：跑 `npm run deadcode` 收集基线；写入 `docs/specs/epic-AG/story-AG.5/knip-baseline.md`
  - **第 2 周**：CI 跑 `npm run deadcode:ci`，**新增** unused export / file 视为 error；既有基线列入 `knip.json` 的 `ignoreExportsUsedInFile` 或 ignore 段
  - **第 3 周开始**：基线允许量逐周收敛，每周清理一批

#### C. `any` 预算脚本

- [ ] **C-1** 新建 `scripts/any-budget.mjs`：
  ```javascript
  #!/usr/bin/env node
  // any-budget.mjs — 统计非测试 .ts/.tsx 中 any 使用并对比预算
  import { execSync } from 'node:child_process';
  import process from 'node:process';

  const BUDGETS = {
    'src/modules/': 30,
    'src/lib/': 60,
  };

  // grep 模式：: any | as any | <any> | Array<any> | Record<string, any>
  const PATTERN = String.raw`(:\s*any\b|\bas\s+any\b|<any[,>]|\bAny\b\s*=\s*any)`;

  const result = {};
  for (const dir of Object.keys(BUDGETS)) {
    const cmd = `git ls-files '${dir}**/*.ts' '${dir}**/*.tsx' | grep -v -E '\\.test\\.|__tests__/' | xargs grep -E "${PATTERN}" 2>/dev/null | wc -l`;
    const count = parseInt(execSync(cmd, { shell: '/bin/bash' }).toString().trim(), 10);
    result[dir] = count;
  }

  let failed = false;
  console.log('\n=== Any Budget Report ===\n');
  for (const [dir, count] of Object.entries(result)) {
    const budget = BUDGETS[dir];
    const status = count <= budget ? '✅' : '❌';
    if (count > budget) failed = true;
    console.log(`${status} ${dir.padEnd(20)} ${count} / ${budget}`);
  }

  if (failed) {
    console.error('\n❌ any budget exceeded — 请清理 any 使用或调整预算（需架构 review）');
    process.exit(1);
  } else {
    console.log('\n✅ any 预算在范围内');
  }
  ```
- [ ] **C-2** 在 `package.json` 添加：
  ```json
  {
    "scripts": {
      "any:budget": "node scripts/any-budget.mjs"
    }
  }
  ```
- [ ] **C-3** 预算策略：
  - 当前基线：`src/lib/**` ≈ 115、`src/modules/**` ≈ 102
  - 本 Epic 完成后目标：`src/modules/**` ≤ 30、`src/lib/**` ≤ 60
  - CI 策略：`any` 数量**不得超过预算**；任何 PR 增加 `any` 都需在 PR 描述说明并由 reviewer 批准
  - PR diff 扫描（可选增强）：用 `git diff --unified=0 origin/main` 提取新增行，统计新增 `any`，单 PR 不得新增 > 0（除非显式打 `[any-budget-bypass]` 标签）

#### D. `madge` 循环依赖检查

- [ ] **D-1** 安装：
  ```bash
  npm i -D madge
  ```
- [ ] **D-2** 在 `package.json` 添加：
  ```json
  {
    "scripts": {
      "circular": "madge --circular --extensions ts,tsx src/",
      "circular:image": "madge --circular --image circular.svg --extensions ts,tsx src/"
    }
  }
  ```
- [ ] **D-3** AG.3 落地后，CI 中 `npm run circular` 必须输出 `No circular dependency found` — 否则 fail

#### E. CI 集成

- [ ] **E-1** 新增 `.github/workflows/architecture-guardrails.yml`（或集成到现有 CI）：
  ```yaml
  name: Architecture Guardrails

  on:
    pull_request:
      branches: [main]
    push:
      branches: [main]

  jobs:
    guardrails:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
          with:
            fetch-depth: 0  # madge / diff 需要完整历史
        - uses: actions/setup-node@v4
          with:
            node-version: '20'
            cache: 'npm'
        - run: npm ci

        - name: TypeScript check
          run: npx tsc --noEmit

        - name: ESLint boundaries (PR diff only first 2 weeks)
          run: npm run lint:boundaries

        - name: Dead-code check
          run: npm run deadcode:ci

        - name: any budget
          run: npm run any:budget

        - name: Circular dependencies
          run: npm run circular
  ```
- [ ] **E-2** 配置 `lint-staged` 与 `husky`（可选，建议引入）：
  ```json
  // package.json
  {
    "lint-staged": {
      "src/**/*.{ts,tsx}": [
        "eslint --rule 'no-restricted-imports: error'",
        "tsc --noEmit -p ."
      ]
    },
    "husky": {
      "hooks": {
        "pre-commit": "lint-staged"
      }
    }
  }
  ```
  > 仅在团队同意 pre-commit hook 时启用；不强制。

#### F. CLAUDE.md §依赖验证 章节同步

- [ ] **F-1** 由 AG.4 同步修订 CLAUDE.md §依赖验证段，列出本 Story 接入的 5 个检查命令：
  - `npm run lint:boundaries`
  - `npm run deadcode`
  - `npm run any:budget`
  - `npm run circular`
  - `npx tsc --noEmit`
- [ ] **F-2** 在 CLAUDE.md §禁止事项 末尾增补「架构围栏由 CI 强制」声明，链接到 `architecture-guardrails.yml`

---

## 非目标

- ❌ Tool returns schema 形式化（独立改造 ToolRegistration 类型）
- ❌ ontologyId 自动注入（改造沙箱工具调用协议）
- ❌ I18n / 多语言 description（暂统一用中文）
- ❌ 工具调用示例库（few-shot examples）

---

## 验收标准

1. - [ ] `.eslintrc.json` 已添加 `no-restricted-imports` 边界规则（含 modules / shared / features / 基础设施 4 个 overrides 段）
2. - [ ] `npm run lint:boundaries` 在 AG.1~AG.3 完成后 0 error
3. - [ ] `npm run deadcode` 已接入，knip baseline 已记录在 `docs/specs/epic-AG/story-AG.5/knip-baseline.md`
4. - [ ] CI 中 `deadcode:ci` 对**新增** unused export / file 输出 fail
5. - [ ] `scripts/any-budget.mjs` 已落地；`src/modules/**` ≤ 30、`src/lib/**` ≤ 60；CI 中 `any:budget` 0 error
6. - [ ] `madge --circular src/` CI 中输出 `No circular dependency found`
7. - [ ] `.github/workflows/architecture-guardrails.yml`（或等价 CI 配置）已合入并跑通一次完整流水线
8. - [ ] CLAUDE.md §依赖验证 章节列出 5 项 CI 检查命令（由 AG.4 协同修订）
9. - [ ] `docs/changes/changelog.md` 追加变更记录

---

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| ESLint 规则启用后大量历史 error 阻塞日常开发 | 严格遵守第 1 周 warn → 第 2 周 PR diff error → 第 3 周全量 error 的时间线；warn 级数据先收集再决策 |
| knip 在 Next.js App Router 下误报「未使用 page.tsx」 | `entry` 显式列出 `src/app/**/page.tsx` 与 `route.ts`；首轮误报全部加入 ignore，后续逐步收敛 |
| `any` 预算脚本的 grep 与项目 token 偏差（如 `any` 出现在字符串字面量） | 将正则收紧到「类型位」上下文；必要时改用 `ts-morph` AST 精确扫描（替代 grep） |
| `lint-staged` + `husky` 拖慢 commit 速度 | 仅扫变更文件；若仍慢则下沉到 pre-push hook，commit 不阻塞 |
| madge 输出异于 `tsc` 因 path alias 解析差异 | `madge` 支持 `--ts-config tsconfig.json` 读 alias；若仍误报则加 `--exclude` 暂时跳过 |

---

## 依赖关系

- **前置依赖：** AG.1 / AG.2 / AG.3（迁移完成后再接 lint，避免 lint 报错阻塞迁移本身）；AG.4（CLAUDE.md 条款落地后规则措辞才稳定）
- **优先级：** 🟡 Medium（治理「再发生」的护栏，需在 AG.1~AG.4 落地后再启用 error 级）
- **估计工时：** 2 天

---

## 相关文档

- [Epic AG README — 验收门禁 #6](../README.md)
- [Story AG.1 / AG.2 / AG.3 / AG.4](../)
- [CLAUDE.md §依赖验证 / §禁止事项](../../../../CLAUDE.md)
- [knip 官方文档](https://knip.dev/)
- [madge 官方仓库](https://github.com/pahen/madge)

## AG5-T1 详细需求

Given 现行 package 架构，When 从不同目录运行检查，Then 禁止导入一致被报告、合法导入不误报。Given 架构扫描失败或没有扫描到源码，When 生成结果，Then 非零退出且说明原因。输入为仓库源码，输出为开发诊断；不读写用户运行数据，不更改业务接口。新增依赖数量必须为零。

AG5-T1 对应 testing.md 的 T1-01–T1-11；其余原验收标准由后续独立 Task 承担。
