# 架构设计 - Story AG.5

## 2026-09-11：首轮可执行任务 AG5-T1

本轮仅实施现有 Monorepo 边界检查修正，提案为 `fix-monorepo-boundary-lint`，状态为待批准。下方历史整套工具链规划不作为 AG5-T1 验收要求；不得因此宣称 AG.5 全部完成。现行架构以 AGENTS.md 为准，旧 `src/`、atoms/organisms 目录及旧 CLI 命令仅作为历史背景。


**Story:** 自动化围栏（ESLint 边界 + dead-code 工具 + any 预算 + CI 接入）
**Epic:** AG — 架构治理与围栏对齐
**最后更新:** 2026-07-20

---

## 技术栈

| 工具 | 用途 | 说明 |
|------|------|------|
| ESLint | 依赖边界检查 | `no-restricted-imports` 规则 |
| knip | Dead-code 检测 | 未使用文件/export/依赖 |
| madge | 循环依赖检测 | 可视化依赖图 |
| 自定义脚本 | `any` 预算统计 | grep 模式匹配 |
| GitHub Actions | CI 集成 | 自动化检查流水线 |

---

## 技术细节

### ESLint 渐进式启用时间线

```
Week 1                Week 2                Week 3+
─────────────────     ─────────────────     ─────────────────
warn 级全量            error 级 PR diff      error 级全量
统计基线               触达 PR 才阻塞         所有提交阻塞
写入 lint-baseline.md  历史遗留不阻塞         历史已被 AG.1~AG.3 清理完
```

### Knip 与 ts-prune 对比

| 维度 | knip | ts-prune |
|------|------|---------|
| 维护活跃度 | 高（2025+ 持续更新） | 低（2023 后停滞） |
| Next.js / monorepo 支持 | 原生 | 需手工配置 |
| 检测维度 | 未使用文件 / export / 依赖 / binary | 仅未使用 export |
| 配置复杂度 | 中（需写 entry） | 低（零配置可用） |
| 误报率 | 低 | 较高（type-only export） |

默认采用 **knip**；若 knip 在 Next.js App Router 下检测异常 → 降级 ts-prune 仅检测 export 维度。

### `any` 预算计数规则

仅匹配以下 5 类作为 `any` 计数：

```regex
:\s*any\b           # 类型注解 : any
\bas\s+any\b        # 类型断言 as any
<any[,>]            # 泛型参数 <any> / <any, X>
Array<any>          # 显式 Array<any>
Record<string, any> # 显式 Record<string, any>
```

**不计入预算的「正当 any」**：

- `.d.ts` 类型声明文件（外部依赖可能必须 any）
- `*.test.ts` / `*.test.tsx` / `__tests__/**`
- 注释中的 any
- `eslint-disable-next-line @typescript-eslint/no-explicit-any` 后被显式豁免的行（PR 必须说明理由）

### `no-restricted-imports` 与 module 豁免的关系

```
src/modules/{module}/
├── index.ts                    # 模块入口（被外部 import）
├── *.ts                        # 模块内部代码：禁止 import @/lib/** @/components/**（shared 除外）
└── ui/                         # 模块 UI 子目录（豁免在 A-1 配置中）
    └── *.tsx                   # 仍禁止 import @/lib/**，但允许通过 deps 注入获取外部 UI
```

> AG.2 已规定 module UI 通过 `CollaborationRuntimeUiDeps` 接口注入外部 UI 组件。本 Story 的 ESLint 规则就是把这个约定写进规则。

---

## 模块设计

### ESLint 规则模块

**配置结构：**

```typescript
interface ESLintOverride {
  files: string[];           // 匹配文件模式
  excludedFiles?: string[];  // 排除文件模式
  rules: {
    'no-restricted-imports': ['error' | 'warn', {
      patterns: Array<{
        group: string[];     // 导入路径模式
        message: string;     // 违规提示信息
      }>;
    }];
  };
}
```

**规则层级：**

1. **modules 层**：禁止依赖 lib/components/services/app（shared 除外）
2. **modules/ui 子目录**：同样禁止依赖 lib（shared 除外）和 components
3. **lib/shared 层**：Layer 0，禁止依赖任何上层，禁止 React 运行时
4. **lib/features 层**：禁止依赖 components/services/app
5. **基础设施层**（storage/integrations/hooks）：禁止依赖 features/components/services/app/modules

### Dead-code 检测模块

**knip 配置结构：**

```typescript
interface KnipConfig {
  entry: string[];           // 入口文件模式
  project: string[];         // 项目文件模式
  ignore: string[];          // 忽略文件模式
  ignoreDependencies: string[]; // 忽略依赖模式
}
```

**入口文件识别：**

- `src/app/**/page.tsx` — Next.js 页面
- `src/app/**/route.ts` — API 路由
- `src/app/layout.tsx` — 根布局
- `src/modules/*/index.ts` — 模块入口

### any 预算脚本模块

**脚本结构：**

```typescript
interface BudgetConfig {
  [directory: string]: number; // 目录 → 预算上限
}

interface BudgetReport {
  [directory: string]: {
    count: number;      // 实际计数
    budget: number;     // 预算上限
    status: 'pass' | 'fail';
  };
}
```

**执行流程：**

1. 遍历预算配置目录
2. 对每个目录执行 grep 统计 any 使用
3. 对比实际计数与预算上限
4. 输出报告，任一目录超限则 exit(1)

### 循环依赖检测模块

**madge 配置：**

```bash
madge --circular --extensions ts,tsx src/
```

**输出要求：**

- 必须输出 `No circular dependency found`
- 可选生成可视化图片：`madge --circular --image circular.svg`

---

## 代码变更

### 新增文件

| 文件路径 | 说明 |
|---------|------|
| `.eslintrc.json`（修改） | 追加 `overrides` 段，配置 `no-restricted-imports` |
| `knip.json` | knip 配置文件 |
| `scripts/any-budget.mjs` | any 预算统计脚本 |
| `.github/workflows/architecture-guardrails.yml` | CI 工作流配置 |
| `docs/specs/epic-AG/story-AG.5/lint-baseline.md` | ESLint 基线报告 |
| `docs/specs/epic-AG/story-AG.5/knip-baseline.md` | knip 基线报告 |

### 修改文件

| 文件路径 | 说明 |
|---------|------|
| `package.json` | 添加 lint/deadcode/any/circular 脚本 |
| `CLAUDE.md` | §依赖验证 章节列出 5 项 CI 检查命令 |

---

## 渐进式启用计划

```
Day 1 (本 Story 开工)
├── 安装工具链：knip / madge
├── 写 scripts/any-budget.mjs
├── 写 .eslintrc overrides（warn 级）
└── 跑全量基线 → 写 lint-baseline.md / knip-baseline.md

Day 2
├── CI workflow 接入（all jobs 设为 continue-on-error: true 仅做提示）
├── PR 内自测一遍
└── 协调团队，宣布 1 周 warn 期开始

Week 2
├── ESLint warn → error（PR diff 范围）
├── knip 接入 baseline ignore，新增 fail
├── any 预算硬阈值
└── continue-on-error 全部移除

Week 3+
├── ESLint error 全量
├── knip baseline 每周清理一批
└── any 预算季度收敛（每季度下调 5–10）
```

---

## 相关文档

- [需求规格](./requirements.md)
- [测试策略](./testing.md)
- [Epic AG README — 验收门禁 #6](../README.md)
- [Story AG.1 / AG.2 / AG.3 / AG.4](../)
- [CLAUDE.md §依赖验证 / §禁止事项](../../../../CLAUDE.md)
- [knip 官方文档](https://knip.dev/)
- [madge 官方仓库](https://github.com/pahen/madge)

## AG5-T1 架构决策

单一 `.eslintrc.cjs` 以自身目录确定根路径，现有 import 规则与包级 tsconfig resolver 负责检查，一个 Node 脚本负责扫描和断言。详细边界与覆盖限制见 `openspec/changes/fix-monorepo-boundary-lint/design.md`。本轮不创建业务 shared 工厂，不新增依赖，不改变运行时分层；旧的全工具链设计保留为后续规划。
