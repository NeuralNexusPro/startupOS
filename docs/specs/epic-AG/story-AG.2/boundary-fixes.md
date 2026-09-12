# AG2-T1 违规修复映射

基线来自 AG.5/lint-baseline.md。以下为原34条诊断与实际归属调整。原围栏与扫描脚本保持不变；合并后扫描866个生产文件，0诊断。

Core目标省略 packages/core/src/lib/；types位于packages/core/src/types/。所有条目均已通过原边界检查。

| 原文件位置 | 调整后的归属或依赖 |
|---|---|
| `packages/core/src/lib/integrations/electron/ipc-protocol.ts:223` | `types/skill-service.ts + types/user-registry.ts` |
| `packages/core/src/lib/integrations/electron/ipc-protocol.ts:241` | `types/skill-service.ts + types/user-registry.ts` |
| `packages/core/src/lib/integrations/electron/services/misc.ts:3` | `types/agent-entry.ts` |
| `packages/core/src/lib/integrations/electron/services/user-registry.ts:3` | `types/user-registry.ts` |
| `packages/core/src/lib/integrations/pi-agent/agent-manager.ts:17` | `shared/cognitive/cognition-types.ts + features/agent/cognitive/in-process.ts (injected integrateMemory)` |
| `packages/core/src/lib/integrations/pi-agent/agent-manager.ts:366` | `shared/cognitive/cognition-types.ts + features/agent/cognitive/in-process.ts (injected integrateMemory)` |
| `packages/core/src/lib/integrations/pi-agent/agent-manager.ts:367` | `shared/cognitive/cognition-types.ts + features/agent/cognitive/in-process.ts (injected integrateMemory)` |
| `packages/core/src/lib/integrations/pi-agent/agent-manager.ts:369` | `shared/cognitive/cognition-types.ts + features/agent/cognitive/in-process.ts (injected integrateMemory)` |
| `packages/core/src/lib/integrations/pi-agent/cognitive/knowledge-provider.ts:15` | `shared/cognitive/cognition-types.ts` |
| `packages/core/src/lib/integrations/pi-agent/cognitive/knowledge-provider.ts:16` | `shared/cognitive/cognition-types.ts` |
| `packages/core/src/lib/integrations/pi-agent/cognitive/pattern/extractor.ts:14` | `features/agent/cognitive/pattern/extractor.ts` |
| `packages/core/src/lib/integrations/pi-agent/cognitive/pattern/index.ts:15` | `features/agent/cognitive/pattern/index.ts` |
| `packages/core/src/lib/integrations/pi-agent/cognitive/pattern/index.ts:19` | `features/agent/cognitive/pattern/index.ts` |
| `packages/core/src/lib/integrations/pi-agent/cognitive/pattern/index.ts:20` | `features/agent/cognitive/pattern/index.ts` |
| `packages/core/src/lib/integrations/pi-agent/cognitive/pattern/index.ts:21` | `features/agent/cognitive/pattern/index.ts` |
| `packages/core/src/lib/integrations/pi-agent/cognitive/pattern/renderer.ts:10` | `features/agent/cognitive/pattern/renderer.ts` |
| `packages/core/src/lib/integrations/pi-agent/cognitive/provider-factory.ts:7` | `features/agent/cognitive/provider-factory.ts` |
| `packages/core/src/lib/integrations/pi-agent/config.ts:115` | `storage/user-config.ts` |
| `packages/core/src/lib/integrations/pi-agent/persistent-agent-manager.ts:26` | `features/agent/persistent-agent-manager.ts` |
| `packages/core/src/lib/integrations/pi-agent/persistent-agent.ts:13` | `injected sessionPersistence from features/agent` |
| `packages/core/src/lib/integrations/pi-agent/project-agent/project-context.ts:11` | `shared/cognitive/memory-markdown.ts` |
| `packages/core/src/lib/integrations/pi-agent/role-agent/role-context.ts:15` | `shared/cognitive/memory-markdown.ts` |
| `packages/core/src/lib/integrations/pi-agent/role-agent/role-context.ts:24` | `shared/cognitive/memory-markdown.ts` |
| `packages/core/src/lib/integrations/pi-agent/role-agent/system-prompt.ts:17` | `shared/agent-permissions.ts` |
| `packages/core/src/lib/integrations/pi-agent/tools/document-tools.ts:20` | `features/agent/tools/document-tools.ts` |
| `packages/core/src/lib/integrations/pi-agent/tools/ontology-data-tools.ts:11` | `features/agent/tools/ontology-data-tools.ts -> ontology-data-store/index.ts` |
| `packages/core/src/lib/integrations/pi-agent/tools/ontology-data-tools.ts:12` | `features/agent/tools/ontology-data-tools.ts -> ontology-data-store/index.ts` |
| `packages/core/src/lib/integrations/pi-agent/tools/ontology-data-tools.ts:13` | `features/agent/tools/ontology-data-tools.ts -> ontology-data-store/index.ts` |
| `packages/core/src/lib/integrations/pi-agent/tools/ontology-data-tools.ts:17` | `features/agent/tools/ontology-data-tools.ts -> ontology-data-store/index.ts` |
| `packages/core/src/lib/integrations/pi-agent/tools/ontology-data-tools.ts:485` | `features/agent/tools/ontology-data-tools.ts -> ontology-data-store/index.ts` |
| `packages/core/src/lib/integrations/pi-agent/tools/ontology-tools.ts:11` | `features/agent/tools/ontology-tools.ts -> ontology-data-store/index.ts` |
| `packages/core/src/lib/integrations/pi-agent/tools/schedule-tools.ts:10` | `features/agent/tools/schedule-tools.ts -> modules/scheduler/index.ts` |
| `packages/core/src/lib/integrations/pi-agent/user-preferences.ts:1` | `storage/user-config.ts` |
| `packages/web/src/components/ui/chat/ChatMessageList.tsx:7` | `web/src/components/ui/chat/ToolExecutionFrame.tsx` |
