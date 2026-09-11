# AG5-T1 架构检查基线

日期：2026-09-11。Task 提交：`05ae193`。本轮修复检查器，未修复下表业务层存量；所有条目均待治理。

## 验证结果

| 检查 | 结果 |
|---|---|
| 真实导入自测 | 43 个用例 × 2 CWD，通过；含类型导入、重导出、字面量动态导入、workspace 导出、两包 alias |
| CLI 行为 | 合法扫描退出 0；违规、空集合、非法配置非零；产物/数据/测试排除正确 |
| Web lint | 383 文件，0 errors / 2920 warnings，退出 0 |
| 非架构 lint 对比 | 逐条位置、规则、消息对比：0 新增 / 0 删除；全部配置保持一致 |
| 架构诊断变化 | 删除旧误报 12 条，增加真实 UI 反向导入 1 条 |
| 独立生产扫描 | 853 文件，34 条边界违规，退出 1（预期，非通过） |
| Task / Proposal 一致性 | 集成环境独立复验后，34 条路径、位置与原因完全一致 |

命令：`node scripts/check-architecture-boundaries.cjs --self-test`、`pnpm lint`、`pnpm lint:boundaries`。

## 剩余违规

Core integrations 反向依赖 features/modules 共 33 条，Web 基础 UI 反向依赖业务组件共 1 条。应在后续独立 Story Task 中逐组评估调用方、类型所有权和组合入口，不用 allowlist 隐藏，也不为通过检查一律添加工厂。

| 文件与行 | 导入目标 | 违反的方向 |
|---|---|---|
| `packages/core/src/lib/integrations/electron/ipc-protocol.ts:223` | `../../features/skills/service` | Core 基础设施层禁止依赖业务功能层或模块层。 |
| `packages/core/src/lib/integrations/electron/ipc-protocol.ts:241` | `../../features/user-registry` | Core 基础设施层禁止依赖业务功能层或模块层。 |
| `packages/core/src/lib/integrations/electron/services/misc.ts:3` | `../../../features/services/launcher/base` | Core 基础设施层禁止依赖业务功能层或模块层。 |
| `packages/core/src/lib/integrations/electron/services/user-registry.ts:3` | `../../../features/user-registry` | Core 基础设施层禁止依赖业务功能层或模块层。 |
| `packages/core/src/lib/integrations/pi-agent/agent-manager.ts:17` | `../../../modules/memory-core` | Core 基础设施层禁止依赖业务功能层或模块层。 |
| `packages/core/src/lib/integrations/pi-agent/agent-manager.ts:366` | `../../../modules/memory-core` | Core 基础设施层禁止依赖业务功能层或模块层。 |
| `packages/core/src/lib/integrations/pi-agent/agent-manager.ts:367` | `../../../modules/memory-core/session/memory-provider` | Core 基础设施层禁止依赖业务功能层或模块层。 |
| `packages/core/src/lib/integrations/pi-agent/agent-manager.ts:369` | `../../../modules/memory-core/tools/archival-memory-tools` | Core 基础设施层禁止依赖业务功能层或模块层。 |
| `packages/core/src/lib/integrations/pi-agent/cognitive/knowledge-provider.ts:15` | `../../../../modules/memory-core/bank` | Core 基础设施层禁止依赖业务功能层或模块层。 |
| `packages/core/src/lib/integrations/pi-agent/cognitive/knowledge-provider.ts:16` | `../../../../modules/memory-core` | Core 基础设施层禁止依赖业务功能层或模块层。 |
| `packages/core/src/lib/integrations/pi-agent/cognitive/pattern/extractor.ts:14` | `../../../../../modules/memory-core/archival/archival-memory` | Core 基础设施层禁止依赖业务功能层或模块层。 |
| `packages/core/src/lib/integrations/pi-agent/cognitive/pattern/index.ts:15` | `../../../../../modules/memory-core/archival/archival-memory` | Core 基础设施层禁止依赖业务功能层或模块层。 |
| `packages/core/src/lib/integrations/pi-agent/cognitive/pattern/index.ts:19` | `../../../../../modules/memory-core/archival/pattern-ingest` | Core 基础设施层禁止依赖业务功能层或模块层。 |
| `packages/core/src/lib/integrations/pi-agent/cognitive/pattern/index.ts:20` | `../../../../../modules/memory-core/archival/pattern-ingest` | Core 基础设施层禁止依赖业务功能层或模块层。 |
| `packages/core/src/lib/integrations/pi-agent/cognitive/pattern/index.ts:21` | `../../../../../modules/memory-core/bank` | Core 基础设施层禁止依赖业务功能层或模块层。 |
| `packages/core/src/lib/integrations/pi-agent/cognitive/pattern/renderer.ts:10` | `../../../../../modules/memory-core/archival/archival-memory` | Core 基础设施层禁止依赖业务功能层或模块层。 |
| `packages/core/src/lib/integrations/pi-agent/cognitive/provider-factory.ts:7` | `../../../../modules/memory-core` | Core 基础设施层禁止依赖业务功能层或模块层。 |
| `packages/core/src/lib/integrations/pi-agent/config.ts:115` | `../../features/user-config` | Core 基础设施层禁止依赖业务功能层或模块层。 |
| `packages/core/src/lib/integrations/pi-agent/persistent-agent-manager.ts:26` | `../../../modules/memory-core` | Core 基础设施层禁止依赖业务功能层或模块层。 |
| `packages/core/src/lib/integrations/pi-agent/persistent-agent.ts:13` | `../../../lib/features/agent/session-service` | Core 基础设施层禁止依赖业务功能层或模块层。 |
| `packages/core/src/lib/integrations/pi-agent/project-agent/project-context.ts:11` | `../../../../modules/memory-core` | Core 基础设施层禁止依赖业务功能层或模块层。 |
| `packages/core/src/lib/integrations/pi-agent/role-agent/role-context.ts:15` | `../../../../modules/memory-core` | Core 基础设施层禁止依赖业务功能层或模块层。 |
| `packages/core/src/lib/integrations/pi-agent/role-agent/role-context.ts:24` | `../../../../modules/memory-core` | Core 基础设施层禁止依赖业务功能层或模块层。 |
| `packages/core/src/lib/integrations/pi-agent/role-agent/system-prompt.ts:17` | `../../../../lib/features/services/launcher/base` | Core 基础设施层禁止依赖业务功能层或模块层。 |
| `packages/core/src/lib/integrations/pi-agent/tools/document-tools.ts:20` | `../../../features/document` | Core 基础设施层禁止依赖业务功能层或模块层。 |
| `packages/core/src/lib/integrations/pi-agent/tools/ontology-data-tools.ts:11` | `../../../../lib/features/ontology-data-store/store` | Core 基础设施层禁止依赖业务功能层或模块层。 |
| `packages/core/src/lib/integrations/pi-agent/tools/ontology-data-tools.ts:12` | `../../../../lib/features/ontology-data-store/query-engine` | Core 基础设施层禁止依赖业务功能层或模块层。 |
| `packages/core/src/lib/integrations/pi-agent/tools/ontology-data-tools.ts:13` | `../../../../lib/features/ontology-data-store/schema-validator` | Core 基础设施层禁止依赖业务功能层或模块层。 |
| `packages/core/src/lib/integrations/pi-agent/tools/ontology-data-tools.ts:17` | `../../../../lib/features/ontology-data-store/instance-relations` | Core 基础设施层禁止依赖业务功能层或模块层。 |
| `packages/core/src/lib/integrations/pi-agent/tools/ontology-data-tools.ts:485` | `../../../../lib/features/ontology-data-store/ontology-ops` | Core 基础设施层禁止依赖业务功能层或模块层。 |
| `packages/core/src/lib/integrations/pi-agent/tools/ontology-tools.ts:11` | `../../../../lib/features/ontology-data-store/ontology-ops` | Core 基础设施层禁止依赖业务功能层或模块层。 |
| `packages/core/src/lib/integrations/pi-agent/tools/schedule-tools.ts:10` | `../../../../modules/scheduler` | Core 基础设施层禁止依赖业务功能层或模块层。 |
| `packages/core/src/lib/integrations/pi-agent/user-preferences.ts:1` | `../../features/user-config` | Core 基础设施层禁止依赖业务功能层或模块层。 |
| `packages/web/src/components/ui/chat/ChatMessageList.tsx:7` | `@/components/os/agent-dialog/ToolExecutionFrame` | 基础 UI 与 molecules 禁止依赖业务组件。 |

## 限制

这是依赖边界存量，不是全仓死代码或完整循环依赖审计。动态计算 import、跨 feature 私有导入、循环依赖不在本轮覆盖范围。配置/脚本不进入运行时，不需要 UI 或安装包功能回归；未执行全量业务测试，也不宣称全量业务测试通过。默认 lint 保留 warning，独立架构扫描对现存违规保持失败，尚不作为全量 CI 合并门禁。
