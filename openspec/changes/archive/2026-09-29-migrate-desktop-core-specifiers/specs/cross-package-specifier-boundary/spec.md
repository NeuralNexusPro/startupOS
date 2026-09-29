# cross-package-specifier-boundary 变更：存量清零与 error 升级（AG.8-T2）

## MODIFIED Requirements

### Requirement: 跨包相对导入拦截

架构检查 SHALL 对 `packages/desktop/src`、`packages/web/src`、`packages/perception-plugins` 中解析到 `packages/core/src` 的相对导入（含 `from`、side-effect、`import type`、动态 import 形态）报告诊断；规则 MUST 以 warning 起步，存量迁移完成后升级为 error。

升级为 error 后，`pnpm lint:boundaries` 与 `node scripts/check-architecture-boundaries.cjs` 对该类违规 MUST 以非零退出阻断，正式配置 MUST 不存在任何跨包相对导入存量。

#### Scenario: desktop 相对路径穿 core

- **WHEN** desktop 服务文件包含 `from '../../../../core/src/lib/paths'`
- **THEN** lint SHALL 以 error 报告跨包相对路径违规并附指引 message

#### Scenario: side-effect 导入同样拦截

- **WHEN** 文件包含 `import '../../../core/src/lib/integrations/pi-agent/core/agent'`（无绑定符号）
- **THEN** lint SHALL 与普通 import 同样报告违规

#### Scenario: import type 不豁免

- **WHEN** 文件包含 `import type { X } from '../../../core/src/types'`
- **THEN** lint SHALL 报告违规（编译擦除不改变源码边界已被破坏的事实）

#### Scenario: 包名说明符放行

- **WHEN** desktop 文件使用 `import { setElectronDataRoot } from '@originos/core/lib/paths'`
- **THEN** lint SHALL 不报告跨包相对路径违规

#### Scenario: 存量清零后 error 生效

- **WHEN** 全部存量迁移完成且 `pnpm lint:boundaries` 扫描 0 诊断
- **THEN** 规则 severity SHALL 为 error，新增违规导致扫描非零退出

## ADDED Requirements

### Requirement: 存量清零与 error 升级

desktop 与 web 生产源码及测试文件 MUST 不再包含解析到 `packages/core/src` 的相对导入（基线：desktop 非测试 128 处、测试 24 处、web 测试 2 处）；迁移完成并通过编译与打包验证后，拦截规则 MUST 从 warning 升级为 error，AGENTS.md 依赖验证段落 MUST 同步该状态。

#### Scenario: 生产源码清零

- **WHEN** 执行 `grep -rEn "from ['\"](\.\./)+core/src/" packages/desktop/src packages/web/src --include='*.ts' --include='*.tsx'` 并排除测试豁免后
- **THEN** 输出 SHALL 为空（0 行）

#### Scenario: 测试文件同型导入清零

- **WHEN** 对测试文件执行同型 grep（含 side-effect 与动态 import 形态）
- **THEN** 输出 SHALL 为空（0 行）

#### Scenario: AGENTS.md 状态同步

- **WHEN** 规则升级为 error 后
- **THEN** AGENTS.md 依赖验证段落 SHALL 记录该规则已进入 error 强制状态，并升级规约版本号

## MODIFIED Requirements

### Requirement: 存量迁移不改行为

全部存量（不限于启动关键文件）的说明符迁移 MUST 只改 import 说明符，不改导出符号、运行逻辑与文件位置；迁移后开发态编译与 Electron 打包产物 MUST 均可正常启动，不出现模块解析失败。动态 import 与 `typeof import` 类型位 MUST 同样仅改字面量为包名说明符。

#### Scenario: 数据根注入在打包产物中正常

- **WHEN** 迁移后的 desktop 打包产物（`pnpm desktop:build:app`）启动
- **THEN** 主进程日志 SHALL 无 `Cannot find module` / `MODULE_NOT_FOUND`，且 `[setup-data-root]` 指向正确数据根

#### Scenario: side-effect emit 语义保持

- **WHEN** `agent-worker-runtime-deps.ts` 的 side-effect import 改为说明符形态后执行 desktop 构建
- **THEN** tsc SHALL 0 error，且相关 core 模块仍被 emit 进产物（原强制 emit 职责不变）

#### Scenario: 动态 import 迁移后可加载

- **WHEN** `collaboration-service.ts` 与 `channel-runtime-service.ts` 的动态 import 改为 `import('@originos/core/...')` 后执行 desktop 构建与打包
- **THEN** 打包产物 SHALL 经 F1 staged exports 解析成功（`prepare-core-runtime.js` 扫描覆盖 `import(` 字面量），运行时懒加载 SHALL 正常
