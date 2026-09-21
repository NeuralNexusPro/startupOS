# M14-T6 Task 2.2 架构 QA 证据

- 日期：2026-09-18
- 分支：`task/m14-context-architecture-qa`
- 基线：`a30ec81`
- 环境：Node.js `v24.21.0`、pnpm `9.15.9`、macOS arm64

## 隔离环境

指定 worktree 初始没有 `node_modules`。曾尝试复用主工作区符号链接，但 Web 的 workspace 依赖因此错误解析到主工作区源码；该轮输出作废。随后删除符号链接并执行：

| 命令 | 退出码 | 结果 |
|---|---:|---|
| `pnpm install --offline --frozen-lockfile` | 0 | 复用本机 pnpm store，在当前 worktree 建立正确的 workspace 链接；锁文件未变。 |

以下均为隔离修正后的有效结果。

## 构建、类型与 lint

| 命令 | 退出码 | 结果与归因 |
|---|---:|---|
| `pnpm --filter @originos/core build` | 0 | Core 没有 `build` script；pnpm 输出 `None of the selected packages has a "build" script`，因此以下一行的 `tsc --noEmit` 是 Core 的实际编译门禁。 |
| `pnpm exec tsc -p packages/core/tsconfig.json --noEmit` | 0 | Core 类型检查通过。 |
| `pnpm --filter @originos/web build` | 0 | Next.js 生产构建通过。 |
| `pnpm type-check` | 2 | 仅有 ontology 存量的 6 个严格类型错误，见“既有 blocker”。 |
| `pnpm lint` | 0 | 0 error、2998 warning；warning 为当前 lint 基线，本 Task 未批量改写。 |
| `pnpm --filter @originos/pi-agent-adapter build` | 0 | Agent adapter runtime 构建通过。 |
| `pnpm --filter @originos/perception-plugin-email build` | 0 | 修复 M.14 ES2021 兼容回归后通过。 |
| `pnpm --filter @originos/perception-plugin-wecom build` | 0 | 通过。 |
| `pnpm --filter @originos/perception-plugin-feishu build` | 0 | 通过。 |
| `pnpm --filter @originos/perception-plugin-dingtalk build` | 0 | 通过。 |
| `pnpm --filter @originos/desktop build` | 2 | 插件预构建后只剩与 Web type-check 相同的 ontology 存量 6 错误，见“既有 blocker”。 |

## M.14 直接回归与最小修复

首次执行 `pnpm --filter @originos/perception-plugin-email build` 退出码为 2。M14-T3 新增的两处 `Array.findLastIndex` 超出四个感知插件的 ES2020 target / ES2021 lib，另有一处可选缓存访问在该严格配置下不能安全收窄。修复位于共享根因 `packages/core/src/lib/integrations/pi-agent/core/agent.ts`：

- 用 ES2021 已支持的 `map(...).lastIndexOf('user')` 替代两处 `findLastIndex`。
- 将 `cached.timestamp` 改为 `cached?.timestamp`。

修复后四个感知插件构建均退出 0；没有新增依赖或抽象。

回归检查：

| 命令 | 退出码 | 结果 |
|---|---:|---|
| `pnpm --filter @originos/core exec vitest run src/lib/integrations/pi-agent/cognitive/__tests__/turn-cognitive-prefetch.test.ts src/lib/integrations/pi-agent/core/__tests__/agent-token-estimate.test.ts src/lib/features/agent/__tests__/runtime-restore.test.ts` | 0 | 3 个测试文件、7 个测试全部通过。 |

## 架构与 worker/package 校验

| 命令 | 退出码 | 结果 |
|---|---:|---|
| `pnpm lint:boundaries` | 0 | 扫描 887 个生产文件，0 条诊断。 |
| `node scripts/check-architecture-boundaries.cjs --self-test` | 0 | 43 个导入用例 × 2 个 CWD 全部通过。 |
| `node packages/desktop/scripts/verify-agent-worker-runtime.js` | 0 | 19 个 packaged worker runtime modules 与 ESM bootstrap 路径通过。 |
| `pnpm --filter @originos/desktop verify:pi-task-runtime` | 0 | development runtime package 校验通过。 |
| `pnpm --filter @originos/desktop test:pi-task-runtime-package` | 0 | 15 个测试全部通过。 |
| `pnpm --filter @originos/desktop verify:workspace-upload` | 0 | Workspace upload IPC smoke 通过。 |

## 既有 blocker

Web type-check 与 Desktop TypeScript build 都被以下 6 个 ontology 错误阻塞：

- `packages/core/src/lib/features/ontology/canonical-ontology-store.ts`：3 个 TS4111、1 个 TS2532、1 个 TS2345。
- `packages/core/src/lib/features/ontology/ontology-osdk.ts`：1 个 TS4111。

归因命令：

```bash
git diff --quiet a1a6f92^..HEAD -- \
  packages/core/src/lib/features/ontology/canonical-ontology-store.ts \
  packages/core/src/lib/features/ontology/ontology-osdk.ts
```

退出码为 0，证明两个文件从 M.14 开始前到本 Task 基线均未变化。因此它们不是 M.14 回归，本 Task 不扩大范围修复。Web 生产构建仍退出 0；Desktop `tsc` 门禁保持 blocker 状态，不能记为通过。

## OpenSpec 与差异检查

| 命令 | 退出码 | 结果 |
|---|---:|---|
| `npx -y @fission-ai/openspec validate m14-context-integration-verification --strict` | 0 | change 严格校验通过。 |
| `git diff --check` | 0 | 无空白错误。 |
