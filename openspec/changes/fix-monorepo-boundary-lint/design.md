# 设计：让现有检查按真实目录运行

## 背景

AG.5 原方案包含多种新工具，但当前先要修复现有 ESLint 的路径基准。AG.1 旧目标（服务壳、CommandInterface、死 bridge 导入）在本次生产源码扫描中已不存在；不重复做历史删除。现存 active changes 集中在感知插件和任务运行时，本次不修改其业务实现。

## 目标与非目标

目标：从根目录和包目录运行均识别同一条依赖违规；建立涵盖真实包路径的可重复基线。
非目标：见 proposal.md；尤其不把警告清零当成本轮任务，不通过豁免隐藏真实违规。

## 决策

1. 将现有 `.eslintrc.json` 等价转换为 `.eslintrc.cjs`，使用 `__dirname` 定位仓库。保留无关规则；只调整架构 zones 与包级解析设置。备选的绝对路径硬编码不能移植，分别复制配置会产生多份事实源，均不采用。
2. 使用现有 `import/no-restricted-paths`，按包设置 resolver 的 tsconfig；不得在 Core/Web 共用一个有歧义的 `@/*` 解析。相对导入、alias、workspace 公共导出均应参与检查。优先复用已安装解析器，不增加分析依赖。
3. 本轮落实 AGENTS.md 明确禁止的包反向依赖、Web services/store 到 components/app、ui/molecules 到业务组件、Core 基础设施到 features/modules，以及插件到 Web/Desktop。app 到 Core 公共 API 是合法路径，不再反向禁止。跨 feature 私有导入与循环检测单列后续任务。
4. 一个 `scripts/check-architecture-boundaries.cjs` 复用 ESLint API：默认全量架构扫描，`--self-test` 用 Node assert 验证正反例。扫描用独立最小 ESLint 配置，避免把无关 React/命名警告混入架构报告；边界定义必须复用正式配置，不复制规则。
5. `pnpm lint:boundaries` 对真实违规返回非零；原 `pnpm lint` 保留 warning 级兼容性。输出路径、位置和规则原因；本轮不把有存量违规的扫描接为强制 CI 门禁，不新增 allowlist。

## 范围与约束

仅变更开发配置、脚本及规格；依赖方向以 AGENTS.md 为准，不改业务 API、数据所有权、并发或恢复逻辑。扫描包含 Web/Core/Desktop 与四个平台插件生产源码，排除 node_modules、dist、dist-electron、.next、release、数据目录和测试文件；自测单独覆盖隔离夹具。空扫描集合和配置解析失败必须明确失败，不能报告全绿。断言夹具放临时目录，扫描结束清理，不向运行数据写入。

## 风险与取舍

- 存量违规显露：记录到 AG.5 本轮基线，后续独立修复，不降低现行规约。
- resolver 漏报：用实际存在的被导入模块分别测试相对、alias、workspace 路径和两个工作目录；不能只断言配置对象。
- 动态计算 import 无法静态确定：明确报告静态分析覆盖限制，不承诺全面证明运行时无越界。
- 配置改名影响工具发现：运行原 pnpm lint 和两个目录自测验证；不得同时留下两份竞争配置。

## 实施边界与回滚

AG5-T1 只有一个应用工作包：配置和自测共享同一规则源，有串行依赖，由一个 subagent 在独立 Task worktree 实施。Proposal 主 worktree 负责文档和回归集成。批准前只保存规划文档。实施后将自动化命令补充到 AGENTS.md，并更新版本和变更记录；回滚仅撤销本提案提交。
