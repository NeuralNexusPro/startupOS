# 跨包说明符边界

## Purpose

为下游包（desktop/web/感知插件）访问 core 建立静态边界契约：唯一合法方式是 `@originos/core/...` 包名说明符，任何解析到其他包 `src/` 的相对导入在 lint 阶段被拦截，且迁移后的导入在开发态与 Electron 打包产物中均可解析。

## ADDED Requirements

### Requirement: 跨包相对导入拦截

架构检查 SHALL 对 `packages/desktop/src`、`packages/web/src`、`packages/perception-plugins` 中解析到 `packages/core/src` 的相对导入（含 `from`、side-effect、`import type`、动态 import 形态）报告诊断；规则 MUST 以 warning 起步，存量迁移完成后升级为 error。

#### Scenario: desktop 相对路径穿 core

- **WHEN** desktop 服务文件包含 `from '../../../../core/src/lib/paths'`
- **THEN** lint SHALL 报告跨包相对路径违规并附指引 message

#### Scenario: side-effect 导入同样拦截

- **WHEN** 文件包含 `import '../../../core/src/lib/integrations/pi-agent/core/agent'`（无绑定符号）
- **THEN** lint SHALL 与普通 import 同样报告违规

#### Scenario: import type 不豁免

- **WHEN** 文件包含 `import type { X } from '../../../core/src/types'`
- **THEN** lint SHALL 报告违规（编译擦除不改变源码边界已被破坏的事实）

#### Scenario: 包名说明符放行

- **WHEN** desktop 文件使用 `import { setElectronDataRoot } from '@originos/core/lib/paths'`
- **THEN** lint SHALL 不报告跨包相对路径违规

### Requirement: 自测覆盖三形态正反例

边界检查自测 MUST 使用真实 ESLint 运行新增规则的正反例，覆盖 `from`、side-effect、`import type` 三种违规形态与合法说明符；自测 MUST 通过且不改动既有 zones 的判定语义。

#### Scenario: 自测含新增用例

- **WHEN** 执行 `node scripts/check-architecture-boundaries.cjs --self-test`
- **THEN** 输出 MUST 包含 desktop→core 相对路径的 invalid 判定与 `@originos/core/...` 的 valid 判定，且全部用例通过

### Requirement: 存量迁移不改行为

启动关键文件的说明符迁移 MUST 只改 import 说明符，不改导出符号、运行逻辑与文件位置；迁移后开发态编译与 Electron 打包产物 MUST 均可正常启动，不出现模块解析失败。

#### Scenario: 数据根注入在打包产物中正常

- **WHEN** 迁移后的 desktop 打包产物（`pnpm desktop:build:app`）启动
- **THEN** 主进程日志 SHALL 无 `Cannot find module` / `MODULE_NOT_FOUND`，且 `[setup-data-root]` 指向正确数据根

#### Scenario: side-effect emit 语义保持

- **WHEN** `agent-worker-runtime-deps.ts` 的 side-effect import 改为说明符形态后执行 desktop 构建
- **THEN** tsc SHALL 0 error，且相关 core 模块仍被 emit 进产物（原强制 emit 职责不变）

### Requirement: 产物解析结论留痕

spike MUST 将产物模块解析机制（tsc paths 编译期解析或 Fallback 预案选择）以证据形式记录在 Story 文档中；若产物保留说明符字面量导致 Node 无法加载 `.ts` exports，MUST 在 F1（打包 files 纳入 core 产物）或 F2（stage 脚本同步）中择一并留证后方可合入。

#### Scenario: 产物保留说明符字面量

- **WHEN** 编译产物中 require 语句保留 `@originos/core/...` 且运行时报模块解析失败
- **THEN** 实施 MUST 启用 Fallback 预案并在打包冒烟通过后记录选择依据，不得直接合入
