# 测试策略 - Story AG.5

## 2026-09-11：首轮可执行任务 AG5-T1

本轮仅实施现有 Monorepo 边界检查修正，提案为 `fix-monorepo-boundary-lint`，状态为 AG5-T1 已验证完成，AG.5 其余任务待实施。下方历史整套工具链规划不作为 AG5-T1 验收要求；不得因此宣称 AG.5 全部完成。现行架构以 AGENTS.md 为准，旧 `src/`、atoms/organisms 目录及旧 CLI 命令仅作为历史背景。


**Story:** 自动化围栏（ESLint 边界 + dead-code 工具 + any 预算 + CI 接入）
**Epic:** AG — 架构治理与围栏对齐
**最后更新:** 2026-07-20

---

## 测试目标

验证架构围栏工具链的正确性和有效性，确保：

1. ESLint 规则能正确识别依赖边界违规
2. knip 能检测未使用的代码和依赖
3. any 预算脚本能准确统计 any 使用
4. madge 能检测循环依赖
5. CI 流水线能自动执行所有检查

---

## 测试范围

### 1. ESLint 边界规则测试

#### 测试用例

**TC-1.1: modules 层依赖检查**

- **输入**：在 `src/modules/collaboration-runtime/index.ts` 中添加 `import { X } from '@/lib/features/...'`
- **预期**：ESLint 报错，提示 "modules 不得 import @/lib/**，请通过 deps 注入或 lib/shared 共享类型"
- **验证命令**：`npm run lint:boundaries`

**TC-1.2: modules/ui 子目录依赖检查**

- **输入**：在 `src/modules/collaboration-runtime/ui/Component.tsx` 中添加 `import { X } from '@/components/...'`
- **预期**：ESLint 报错，提示 "module ui 子目录不得直接 import @/components/**，UI 通过 deps 注入"
- **验证命令**：`npm run lint:boundaries`

**TC-1.3: lib/shared 层依赖检查**

- **输入**：在 `src/lib/shared/types.ts` 中添加 `import { X } from '@/lib/features/...'`
- **预期**：ESLint 报错，提示 "shared 层为 Layer 0，不得依赖任何上层"
- **验证命令**：`npm run lint:boundaries`

**TC-1.4: lib/shared 层 React 依赖检查**

- **输入**：在 `src/lib/shared/types.ts` 中添加 `import React from 'react'`
- **预期**：ESLint 报错，提示 "shared 仅含纯类型，禁止 React 运行时依赖"
- **验证命令**：`npm run lint:boundaries`

**TC-1.5: lib/features 层依赖检查**

- **输入**：在 `src/lib/features/ontology/index.ts` 中添加 `import { X } from '@/components/...'`
- **预期**：ESLint 报错，提示 "features 不得依赖上层（components/services/app）"
- **验证命令**：`npm run lint:boundaries`

**TC-1.6: 基础设施层依赖检查**

- **输入**：在 `src/lib/storage/json-store.ts` 中添加 `import { X } from '@/lib/features/...'`
- **预期**：ESLint 报错，提示 "基础设施层不得依赖上层"
- **验证命令**：`npm run lint:boundaries`

**TC-1.7: 合法导入不报错**

- **输入**：在 `src/modules/collaboration-runtime/index.ts` 中添加 `import { X } from '@/lib/shared/types'`
- **预期**：ESLint 不报错（shared 层豁免）
- **验证命令**：`npm run lint:boundaries`

---

### 2. Dead-code 检测测试

#### 测试用例

**TC-2.1: 未使用 export 检测**

- **输入**：在 `src/lib/utils/helper.ts` 中导出 `export function unusedFunction() {}`，但项目中无任何引用
- **预期**：knip 报告该函数为未使用 export
- **验证命令**：`npm run deadcode`

**TC-2.2: 未使用文件检测**

- **输入**：创建 `src/lib/utils/unused-file.ts`，不在任何入口文件中引用
- **预期**：knip 报告该文件为未使用文件
- **验证命令**：`npm run deadcode`

**TC-2.3: 未使用依赖检测**

- **输入**：在 `package.json` 中添加一个未使用的依赖 `lodash`
- **预期**：knip 报告该依赖为未使用依赖
- **验证命令**：`npm run deadcode`

**TC-2.4: 入口文件不报错**

- **输入**：`src/app/page.tsx` 作为 Next.js 入口
- **预期**：knip 不报告该文件为未使用（因为在 `entry` 配置中）
- **验证命令**：`npm run deadcode`

**TC-2.5: 测试文件豁免**

- **输入**：创建 `src/lib/utils/helper.test.ts`
- **预期**：knip 不报告该文件（因为在 `ignore` 配置中）
- **验证命令**：`npm run deadcode`

---

### 3. any 预算脚本测试

#### 测试用例

**TC-3.1: 预算内通过**

- **输入**：`src/modules/` 下有 25 个 any 使用（预算 30）
- **预期**：脚本输出 "✅ any 预算在范围内"，退出码 0
- **验证命令**：`npm run any:budget`

**TC-3.2: 预算超限失败**

- **输入**：`src/modules/` 下有 35 个 any 使用（预算 30）
- **预期**：脚本输出 "❌ any budget exceeded"，退出码 1
- **验证命令**：`npm run any:budget`

**TC-3.3: 正确统计 : any**

- **输入**：代码中包含 `const x: any = 1`
- **预期**：统计计数 +1
- **验证方式**：手动检查脚本输出

**TC-3.4: 正确统计 as any**

- **输入**：代码中包含 `const x = value as any`
- **预期**：统计计数 +1
- **验证方式**：手动检查脚本输出

**TC-3.5: 正确统计 <any>**

- **输入**：代码中包含 `const x = fn<any>()`
- **预期**：统计计数 +1
- **验证方式**：手动检查脚本输出

**TC-3.6: 正确统计 Array<any>**

- **输入**：代码中包含 `const x: Array<any> = []`
- **预期**：统计计数 +1
- **验证方式**：手动检查脚本输出

**TC-3.7: 正确统计 Record<string, any>**

- **输入**：代码中包含 `const x: Record<string, any> = {}`
- **预期**：统计计数 +1
- **验证方式**：手动检查脚本输出

**TC-3.8: 测试文件不计入**

- **输入**：在 `src/lib/utils/helper.test.ts` 中使用 `any`
- **预期**：不计入统计
- **验证方式**：手动检查脚本输出

**TC-3.9: .d.ts 文件不计入**

- **输入**：在 `src/types/external.d.ts` 中使用 `any`
- **预期**：不计入统计
- **验证方式**：手动检查脚本输出

---

### 4. 循环依赖检测测试

#### 测试用例

**TC-4.1: 无循环依赖通过**

- **输入**：项目中无循环依赖
- **预期**：madge 输出 "No circular dependency found"，退出码 0
- **验证命令**：`npm run circular`

**TC-4.2: 存在循环依赖失败**

- **输入**：创建 `a.ts` 导入 `b.ts`，`b.ts` 导入 `a.ts`
- **预期**：madge 输出循环依赖列表，退出码非 0
- **验证命令**：`npm run circular`

**TC-4.3: 生成可视化图片**

- **输入**：执行 `npm run circular:image`
- **预期**：生成 `circular.svg` 文件
- **验证命令**：`npm run circular:image`

---

### 5. CI 集成测试

#### 测试用例

**TC-5.1: CI 工作流存在**

- **输入**：检查 `.github/workflows/` 目录
- **预期**：存在 `architecture-guardrails.yml` 文件
- **验证方式**：文件检查

**TC-5.2: CI 工作流配置正确**

- **输入**：检查 `.github/workflows/architecture-guardrails.yml`
- **预期**：包含 TypeScript check、ESLint boundaries、Dead-code check、any budget、Circular dependencies 5 个步骤
- **验证方式**：文件内容检查

**TC-5.3: CI 在 PR 时触发**

- **输入**：创建 pull request 到 main 分支
- **预期**：CI 工作流自动执行
- **验证方式**：GitHub Actions 页面查看

**TC-5.4: CI 在 push 时触发**

- **输入**：推送代码到 main 分支
- **预期**：CI 工作流自动执行
- **验证方式**：GitHub Actions 页面查看

**TC-5.5: CI 失败时阻塞合并**

- **输入**：在 PR 中引入 ESLint 违规
- **预期**：CI 检查失败，PR 无法合并
- **验证方式**：GitHub PR 页面查看

---

### 6. 渐进式启用测试

#### 测试用例

**TC-6.1: Week 1 warn 级别**

- **输入**：ESLint 配置为 warn 级别，存在违规代码
- **预期**：ESLint 输出警告但不失败，退出码 0
- **验证命令**：`npm run lint:boundaries`

**TC-6.2: Week 2 PR diff error 级别**

- **输入**：ESLint 配置为 error 级别，PR 修改的文件存在违规
- **预期**：ESLint 报错，退出码非 0
- **验证命令**：`npm run lint:boundaries:diff`

**TC-6.3: Week 3+ 全量 error 级别**

- **输入**：ESLint 配置为 error 级别，项目中存在违规代码
- **预期**：ESLint 报错，退出码非 0
- **验证命令**：`npm run lint:boundaries`

---

### 7. 基线报告测试

#### 测试用例

**TC-7.1: ESLint 基线报告生成**

- **输入**：执行 `npm run lint:boundaries`（warn 级别）
- **预期**：生成 `docs/specs/epic-AG/story-AG.5/lint-baseline.md`，包含所有违规统计
- **验证方式**：文件内容检查

**TC-7.2: knip 基线报告生成**

- **输入**：执行 `npm run deadcode`
- **预期**：生成 `docs/specs/epic-AG/story-AG.5/knip-baseline.md`，包含所有未使用代码统计
- **验证方式**：文件内容检查

---

## 测试执行

### 单元测试

```bash
# ESLint 规则测试
npm run lint:boundaries

# Dead-code 检测
npm run deadcode

# any 预算检查
npm run any:budget

# 循环依赖检测
npm run circular
```

### 集成测试

```bash
# 完整 CI 流水线
npm run ci:guardrails
```

### 手动测试

1. 创建测试文件引入违规依赖
2. 运行对应检查命令
3. 验证错误提示是否准确
4. 删除测试文件

---

## 验收标准测试

### AC-1: ESLint 边界规则生效

- **测试用例**：TC-1.1 ~ TC-1.7
- **预期结果**：所有违规被正确识别，合法导入不报错
- **通过标准**：100% 测试用例通过

### AC-2: Dead-code 检测生效

- **测试用例**：TC-2.1 ~ TC-2.5
- **预期结果**：未使用代码被正确识别，入口文件和测试文件豁免
- **通过标准**：100% 测试用例通过

### AC-3: any 预算统计准确

- **测试用例**：TC-3.1 ~ TC-3.9
- **预期结果**：统计准确，预算控制有效
- **通过标准**：100% 测试用例通过

### AC-4: 循环依赖检测生效

- **测试用例**：TC-4.1 ~ TC-4.3
- **预期结果**：循环依赖被正确识别
- **通过标准**：100% 测试用例通过

### AC-5: CI 集成成功

- **测试用例**：TC-5.1 ~ TC-5.5
- **预期结果**：CI 工作流正确配置，自动执行，失败时阻塞合并
- **通过标准**：100% 测试用例通过

### AC-6: 渐进式启用正常

- **测试用例**：TC-6.1 ~ TC-6.3
- **预期结果**：warn/error 级别切换正常，PR diff 模式正常
- **通过标准**：100% 测试用例通过

### AC-7: 基线报告生成

- **测试用例**：TC-7.1 ~ TC-7.2
- **预期结果**：基线报告正确生成，内容完整
- **通过标准**：100% 测试用例通过

---

## 测试报告模板

```markdown
# Story AG.5 测试报告

**测试日期**：YYYY-MM-DD
**测试人员**：[姓名]
**测试环境**：[环境描述]

## 测试执行摘要

| 测试类别 | 测试用例数 | 通过数 | 失败数 | 通过率 |
|---------|----------|--------|--------|--------|
| ESLint 边界规则 | 7 | | | |
| Dead-code 检测 | 5 | | | |
| any 预算脚本 | 9 | | | |
| 循环依赖检测 | 3 | | | |
| CI 集成 | 5 | | | |
| 渐进式启用 | 3 | | | |
| 基线报告 | 2 | | | |
| **总计** | **34** | | | |

## 失败用例详情

### [用例编号]：[用例名称]

- **输入**：
- **预期结果**：
- **实际结果**：
- **失败原因**：
- **修复建议**：

## 测试结论

- [ ] 所有验收标准测试通过
- [ ] 可以进入下一阶段（warn 期 / PR diff 期 / 全量强制期）
- [ ] 需要修复后重新测试

## 备注

[其他需要说明的事项]
```

---

## 相关文档

- [需求规格](./requirements.md)
- [架构设计](./architecture.md)
- [Story AG.5 README](./README.md)

## AG5-T1 测试矩阵（本轮权威范围）

| ID | 场景 | 预期 |
|---|---|---|
| T1-01 | 同一 service → UI 从根和 Web CWD 检查 | 两者报告同一违规 |
| T1-02 | 禁止方向以相对路径、alias、workspace 公共路径表达 | 均检出 |
| T1-03 | Core → Web/Desktop；storage/shared/integrations/types → features/modules | 均检出 |
| T1-04 | Web services/store → components/app；ui/molecules → 业务组件 | 均检出 |
| T1-05 | 感知插件 → Web/Desktop | 检出 |
| T1-06 | app → Core 公共 API、feature → storage/shared、业务组件 → ui | 不误报 |
| T1-07 | import type、export from、字面量动态 import | 禁止方向均检出 |
| T1-08 | 生产扫描命中测试、产物、node_modules、数据目录 | 排除；自测夹具显式执行 |
| T1-09 | 非法配置、空扫描集合 | 非零退出，明确原因 |
| T1-10 | 全量扫描有存量违规 | 非零退出且输出完整基线，不伪报通过 |
| T1-11 | 执行原 pnpm lint | 非架构规则与既有兼容级别保持 |

拟实施命令：`pnpm lint:boundaries`、`node scripts/check-architecture-boundaries.cjs --self-test`、`pnpm lint`。三条命令已执行，具体结果见下方验证记录。

2026-09-11 已执行只读基线：Node 24.21.0，dev ad6b2b1。使用现有 ESLint.lintText 和真实 button.tsx 作为目标，虚拟 Web service 导入 `../components/ui/button`：根 CWD 为 0 条边界诊断，Web CWD 为 1 条 warning。未落盘测试源码。旧 bridge/service/CommandInterface 的生产扫描只剩历史注释和测试描述，没有待删生产导入。

本轮无需 UI/安装包人工验收（不变更运行时）；CI 分支保护未实施，动态计算 import 的运行时依赖不在静态证明范围。源码阶段完成后创建验证 goal，目标为通过上述全部用例；全量扫描的失败是正确检测存量，不等同于存量已治理。

## AG5-T1 验证结果（2026-09-11）

T1-01–T1-10 全部由真实 ESLint 自测通过：43 imports × 2 个 CWD，覆盖正式配置 warning、生产排除、合法/违规退出、空集合与配置损坏；集成环境独立复验通过。自测修复了 macOS `/var` 与 `/private/var` realpath 不一致，避免夹具假漏报。

T1-11：Web lint 383 文件，0 errors / 2920 warnings；与变更前 2931 warnings 对比，非边界诊断逐条完全相同。配置级比较也证明除过时架构限制与 resolver 外全部规则保持一致。移除的是过期 app→feature 与 collaboration-runtime→lib 的架构限制，不是降低无关代码质量规则。

全量扫描实际返回 1：853 生产文件、34 条真实架构违规。此失败证明扫描器工作，不能记成仓库架构全绿；[完整基线](lint-baseline.md)保留每条路径、位置与原因。`git diff --check` 通过。自动化验证 goal 已建立，目标为通过 AG5-T1 全部 case 并完成 dev 集成与清理；最终状态随交付记录。

交付收尾：已合入本地 dev（`0eac78e`），主工作区自测再次通过；独立 Task/Proposal 分支和 worktree 已清理，提案归档到 `openspec/changes/archive/2026-09-11-fix-monorepo-boundary-lint/`，主规范新增 3 条需求。全部 T1 测试 case 已通过；34 条业务存量仍未修复。
