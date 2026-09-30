# knip dead-code 基线 — Story AG.11

**生成日期:** 2026-09-30（proposal `clean-redundant-docs-and-dead-code` worktree @ 45ac675）
**knip 版本:** 6.38.0　**配置:** 仓库根 `knip.json`　**命令:** `npx knip`

**性质：基线只记录不删除**（FR-1 / D2）；导出级清理另行排期；不在本 Story 接 CI fail（AG.5 CI 接入任务边界）。

## 总览

| 分组 | 数量 |
|------|------|
| Unused files | 121 |
| Unused exports | 80 |
| Unused exported types | 71 |
| Unused dependencies | 64 |
| Unused devDependencies | 32 |

## Unused files (121)

```
eslint-rules/agents-compliance.js
packages/core/src/lib/features/agent/prompts/agent-system-prompts.ts
packages/core/src/lib/features/agent/prompts/project-interview.ts
packages/core/src/lib/features/skills/project-initialization/loader.ts
packages/core/src/lib/hooks/use-file-upload.ts
packages/core/src/lib/integrations/pi-agent/goal-extension.ts
packages/core/src/lib/integrations/pi-agent/mocks/pi-mono-mocks.ts
packages/core/src/lib/integrations/pi-agent/taste-generator.ts
packages/core/src/lib/integrations/pi-agent/tools/coding-tools.ts
packages/core/src/lib/integrations/pi-agent/tools/retry.ts
packages/core/src/modules/collaboration-runtime/engine/task-orchestrator.ts
packages/core/src/modules/collaboration-runtime/integrations/agent-registry.ts
packages/core/src/modules/collaboration-runtime/sandbox/agent-worker.mts
packages/core/src/modules/collaboration-runtime/ui/BlackboardDetail.tsx
packages/core/src/modules/collaboration-runtime/ui/BlackboardViewer.tsx
packages/core/src/modules/collaboration-runtime/ui/CollaborationViewer.tsx
packages/core/src/modules/collaboration-runtime/ui/EventTimeline.tsx
packages/core/src/modules/collaboration-runtime/ui/MetricsPanel.tsx
packages/core/src/modules/neural-channel/src/utils.ts
packages/desktop/scripts/notarize-mac-app.js
packages/desktop/scripts/notify-release-service.js
packages/desktop/scripts/publish-all-platforms.js
packages/desktop/scripts/publish-all-v0.1.12.js
packages/desktop/scripts/publish-macos-only.js
packages/desktop/scripts/publish-windows-only.js
packages/desktop/scripts/verify-agent-business-runtime.js
packages/desktop/src/lib/hooks/use-workspace.ts
packages/desktop/src/lib/integrations/electron/env.ts
packages/desktop/src/lib/integrations/electron/ipc-protocol.ts
packages/desktop/src/lib/integrations/electron/local-agent.ts
packages/desktop/src/lib/integrations/electron/local-fs.ts
packages/desktop/src/lib/integrations/electron/window.ts
packages/desktop/src/main/agent-worker-runtime-deps.ts
packages/perception-plugins/feishu/scripts/check-sdk-logging.cjs
packages/perception-plugins/wecom/scripts/check-sdk-logging.cjs
packages/pi-tasks/src/commands.d.ts
packages/pi-tasks/src/ids.d.ts
packages/pi-tasks/src/model.d.ts
packages/pi-tasks/src/pi-types.d.ts
packages/pi-tasks/src/reducer.d.ts
packages/pi-tasks/src/render.d.ts
packages/pi-tasks/src/schema.d.ts
packages/pi-tasks/src/state-events.d.ts
packages/pi-tasks/src/tools.d.ts
packages/pi-tasks/src/widget.d.ts
packages/pi-tasks/upstream/index.js
packages/pi-tasks/upstream/reducer.js
packages/web/src/components/framework/AppWindow.tsx
packages/web/src/components/framework/OSFramework.tsx
packages/web/src/components/framework/Sidebar.tsx
packages/web/src/components/framework/StatusBar.tsx
packages/web/src/components/framework/Taskbar.tsx
packages/web/src/components/interview/SkillInterview.tsx
packages/web/src/components/molecules/ChatInput.tsx
packages/web/src/components/molecules/index.ts
packages/web/src/components/molecules/MessageList.tsx
packages/web/src/components/os/agent-dialog/ChatInput.tsx
packages/web/src/components/os/agent-dialog/index.ts
packages/web/src/components/os/agent-host/index.ts
packages/web/src/components/os/cui/thinking/components/StreamingDots.tsx
packages/web/src/components/os/cui/thinking/index.ts
packages/web/src/components/os/cui/thinking/ThinkingContent.tsx
packages/web/src/components/os/cui/thinking/ThinkingHeader.tsx
packages/web/src/components/os/cui/thinking/ThinkingProcess.tsx
packages/web/src/components/os/data-editor/CreateRelationDialog.tsx
packages/web/src/components/os/data-editor/DataDocumentView.tsx
packages/web/src/components/os/data-editor/DataFormView.tsx
packages/web/src/components/os/data-editor/DataTableView.tsx
packages/web/src/components/os/data-editor/DataWindowContent.tsx
packages/web/src/components/os/data-editor/index.ts
packages/web/src/components/os/data-editor/InstanceDetailPanel.tsx
packages/web/src/components/os/data-editor/OntologyConceptGraphEditor.tsx
packages/web/src/components/os/data-editor/OntologyGraphView.tsx
packages/web/src/components/os/data-editor/OntologyStructureEditor.tsx
packages/web/src/components/os/data-editor/SchemaEditor.tsx
packages/web/src/components/os/data-editor/VersionPanel.tsx
packages/web/src/components/os/index.ts
packages/web/src/components/os/ontology-preview/index.ts
packages/web/src/components/os/ontology-preview/OntologyPreview.tsx
packages/web/src/components/os/ontology-preview/ProjectCompletion.tsx
packages/web/src/components/os/window/index.ts
packages/web/src/components/project/index.ts
packages/web/src/components/project/ProjectCreationWizard.tsx
packages/web/src/components/project/wizard/CreatingState.tsx
packages/web/src/components/project/wizard/index.ts
packages/web/src/components/project/wizard/StepBackground.tsx
packages/web/src/components/project/wizard/StepConfirm.tsx
packages/web/src/components/project/wizard/StepPriorities.tsx
packages/web/src/components/project/wizard/StepWorkMode.tsx
packages/web/src/components/project/wizard/SuccessState.tsx
packages/web/src/components/taste/index.ts
packages/web/src/components/taste/TasteComplete.tsx
packages/web/src/components/taste/TasteConversation.tsx
packages/web/src/components/taste/UserTasteDetection.tsx
packages/web/src/components/ui/pixel-icons.tsx
packages/web/src/components/ui/progress.tsx
packages/web/src/hooks/agent.ts
packages/web/src/hooks/index.ts
packages/web/src/hooks/useAgent.ts
packages/web/src/hooks/useAgentLauncher.ts
packages/web/src/hooks/useDesktopGrid.ts
packages/web/src/hooks/useLocalAgent.ts
packages/web/src/hooks/useProjectInitialization.ts
packages/web/src/hooks/useResponsive.ts
packages/web/src/hooks/useThinkingProcess.ts
packages/web/src/hooks/useViewReconciler.ts
packages/web/src/lib/utils.ts
packages/web/src/modules/view-reconciler/src/index.ts
packages/web/src/store/agentHostStore.ts
scripts/ipc-migration-scan.ts
scripts/migrate-solutions.ts
scripts/test-collaboration-e2e.mjs
scripts/test-collaboration-flow.mjs
scripts/test-supervisor-execution.ts
templates/skills/info-query/handler.ts
templates/skills/task-manager/handler.ts
tests/e2e/epic-2-workspace.spec.ts
tests/mocks/@originos/pi-agent-adapter/ai.ts
tests/mocks/@originos/pi-agent-adapter/index.ts
tests/mocks/onnxruntime-node.ts
tests/setup.ts

## Unused exports (80)

```
default                         function  packages/core/src/lib/features/animations/useSpring.ts:286:16
listCollaborationSessions       function  packages/core/src/lib/integrations/electron/services/collaboration.ts:33:23
getCollaborationSession         function  packages/core/src/lib/integrations/electron/services/collaboration.ts:64:23
abortCollaborationSession       function  packages/core/src/lib/integrations/electron/services/collaboration.ts:78:23
getCollaborationBlackboard      function  packages/core/src/lib/integrations/electron/services/collaboration.ts:135:23
respondToHumanReview            function  packages/core/src/lib/integrations/electron/services/collaboration.ts:149:23
isOAuthToken                    function  packages/core/src/lib/integrations/pi-agent/config.ts:247:17
parseBlocksFromMarkdown                   packages/core/src/lib/integrations/pi-agent/role-agent/role-context.ts:24:10
rebuildStateMemoryLayer         function  packages/core/src/lib/integrations/pi-agent/role-agent/system-prompt.ts:108:17
renderMemoryBlocksXML                     packages/core/src/lib/integrations/pi-agent/role-agent/system-prompt.ts:113:10
isToolDisabled                  function  packages/core/src/lib/integrations/pi-agent/tool-config-loader.ts:113:17
getCustomTools                  function  packages/core/src/lib/integrations/pi-agent/tool-config-loader.ts:121:17
wrapWorkerHumanReviewRequest    function  …ckages/core/src/modules/collaboration-runtime/engine/supervisor-dag.ts:121:17
computeTaskLevels               function  …ckages/core/src/modules/collaboration-runtime/engine/supervisor-dag.ts:712:17
executeCollaborationRuntime     function  …kages/core/src/modules/collaboration-runtime/engine/supervisor-dag.ts:2142:23
DEFAULT_INTERVIEW_QUESTIONS               packages/core/src/types/interview.ts:152:14
getProjectDataDir               function  packages/desktop/src/main/paths.ts:58:17
getAgentsDataDir                function  packages/desktop/src/main/paths.ts:65:17
getSkillsDataDir                function  packages/desktop/src/main/paths.ts:72:17
getTemplatesDir                 function  packages/desktop/src/main/paths.ts:79:17
getClaudeDir                    function  packages/desktop/src/main/paths.ts:86:17
TASK_SNAPSHOT_CUSTOM_TYPE                 packages/pi-tasks/src/model.js:2:14
replayTaskEvents                function  packages/pi-tasks/src/reducer.js:44:17
listRuntimeAgents               function  packages/web/src/app/api/agent/_runtime-agent-registry.ts:35:17
ProjectInterview                          packages/web/src/components/interview/index.ts:2:10
CUIDialogPanel                            packages/web/src/components/interview/index.ts:6:10
ArtifactDisplayPanel                      packages/web/src/components/interview/index.ts:7:10
ResizableLayout                           packages/web/src/components/interview/index.ts:8:10
WelcomeScreen                             packages/web/src/components/interview/index.ts:11:10
QuestionInput                             packages/web/src/components/interview/index.ts:12:10
GeneratingState                           packages/web/src/components/interview/index.ts:13:10
OntologyPreview                           packages/web/src/components/interview/index.ts:14:10
OntologyEditor                            packages/web/src/components/interview/index.ts:15:10
AcrylicDialog                             packages/web/src/components/os/acrylic/index.ts:6:21
AgentInitializer                function  packages/web/src/components/os/AgentInitializer.tsx:14:17
ScheduleDialog                            packages/web/src/components/os/schedules/index.ts:2:10
default                         function  packages/web/src/components/os/sense-center/SenseCenter.tsx:311:16
default                         function  packages/web/src/components/os/window/AppWindow.tsx:180:16
default                         function  packages/web/src/components/os/window/AppWindowContainer.tsx:52:16
default                         function  packages/web/src/components/os/window/ViewRenderer.tsx:291:16
default                         function  packages/web/src/components/os/window/WindowControls.tsx:63:16
default                         function  packages/web/src/components/os/window/WindowResizer.tsx:156:16
default                         function  packages/web/src/components/os/window/WindowTitleBar.tsx:52:16
FileList                        function  packages/web/src/components/os/workspace/FileList.tsx:17:17
DataTabView                               packages/web/src/components/os/workspace/index.ts:3:10
FileList                                  packages/web/src/components/os/workspace/index.ts:4:10
MarkdownViewer                            packages/web/src/components/os/workspace/index.ts:5:10
MarkdownEditor                            packages/web/src/components/os/workspace/index.ts:6:10
CreateFileDialog                          packages/web/src/components/os/workspace/index.ts:7:10
DeleteConfirmDialog                       packages/web/src/components/os/workspace/index.ts:8:10
ProjectSidebar                            packages/web/src/components/os/workspace/index.ts:9:10
ProjectTaskBoard                          packages/web/src/components/os/workspace/index.ts:10:10
ProjectSidebar                  function  packages/web/src/components/os/workspace/ProjectSidebar.tsx:15:17
SandboxIframe                             packages/web/src/components/sandbox/index.tsx:2:10
SandboxConsole                            packages/web/src/components/sandbox/index.tsx:3:10
SandboxErrorPanel                         packages/web/src/components/sandbox/index.tsx:4:10
default                         function  packages/web/src/components/sandbox/SandboxConsole.tsx:95:16
default                         function  packages/web/src/components/sandbox/SandboxErrorPanel.tsx:32:16
default                         function  packages/web/src/components/sandbox/SandboxIframe.tsx:156:16
SkillBrowser                              packages/web/src/components/skills/index.ts:8:10
SkillExecutionComponent                   packages/web/src/components/skills/index.ts:10:28
SkillBrowser                    function  packages/web/src/components/skills/SkillBrowser.tsx:26:17
ChatMessage                     function  packages/web/src/components/ui/chat-message.tsx:355:17
resolveSvgIcon                  function  packages/web/src/components/ui/icon-registry.tsx:46:17
getSystemApp                    function  packages/web/src/config/system-apps.ts:29:17
useSupportsBackdropFilter       function  packages/web/src/hooks/useAcrylic.ts:92:17
default                         function  packages/web/src/hooks/useAcrylic.ts:100:16
default                         function  packages/web/src/hooks/useAppWindow.ts:157:16
default                         function  packages/web/src/hooks/useAppWindowManager.ts:301:16
useContextMenu                  function  packages/web/src/hooks/useContextMenu.ts:18:17
default                         function  packages/web/src/hooks/useDockIconAnimation.ts:109:16
useGlobalShortcut               function  packages/web/src/hooks/useGlobalShortcut.ts:51:17
appWindowManager                          packages/web/src/services/AppWindowManager.ts:301:14
listPendingPerceptionDecisions  function  packages/web/src/services/perceptionDecisionService.ts:5:23
registerPerceptionConnector     function  packages/web/src/services/perceptionWebhookService.ts:19:17
setPerceptionConnectorEnabled   function  packages/web/src/services/perceptionWebhookService.ts:25:17
selectAgents                              packages/web/src/store/agentRegistry.ts:95:14
selectAgent                               packages/web/src/store/agentRegistry.ts:102:14
selectAgentsByStatus                      packages/web/src/store/agentRegistry.ts:109:14
selectAgentsByType                        packages/web/src/store/agentRegistry.ts:116:14

## Unused exported types (71)

```
LoadedSkill                    type       packages/core/src/lib/features/skills/registry.ts:129:3
SkillMetadata                  type       packages/core/src/lib/features/skills/registry.ts:130:3
SkillRegistry                  type       packages/core/src/lib/features/skills/registry.ts:131:3
SkillRouter                    type       packages/core/src/lib/features/skills/registry.ts:132:3
SkillRoutingRequest            type       packages/core/src/lib/features/skills/registry.ts:133:3
SkillRoutingRule               type       packages/core/src/lib/features/skills/registry.ts:134:3
TrustModel                     interface  packages/core/src/lib/features/taste/trust-stub.ts:24:18
CorrectionSignal               type       packages/core/src/lib/integrations/pi-agent/cognitive/types.ts:7:15
EventHandler                   type       packages/core/src/lib/integrations/pi-agent/types.ts:350:13
ProgressCallback               interface  packages/core/src/lib/integrations/pi-agent/types.ts:355:18
ToolDefinition                 interface  packages/core/src/lib/integrations/pi-agent/types.ts:369:18
SessionData                    interface  packages/core/src/lib/integrations/pi-agent/types.ts:483:18
AgentStatus                    type       packages/core/src/types/agent-host.ts:5:13
ProjectMetadata                interface  packages/core/src/types/api.ts:92:18
CreateProjectRequest           interface  packages/core/src/types/api.ts:103:18
UpdateProjectRequest           interface  packages/core/src/types/api.ts:116:18
ProjectListItem                interface  packages/core/src/types/api.ts:130:18
SkillDetail                    interface  packages/core/src/types/api.ts:155:18
SkillExecutionStartRequest     interface  packages/core/src/types/api.ts:185:18
SkillExecutionStartResponse    interface  packages/core/src/types/api.ts:191:18
SkillExecutionMessageRequest   interface  packages/core/src/types/api.ts:199:18
SkillExecutionCompleteRequest  interface  packages/core/src/types/api.ts:216:18
Interview                      interface  packages/core/src/types/interview.ts:126:18
InterviewProgress              interface  packages/core/src/types/interview.ts:141:18
OntologyWithStatus             interface  packages/core/src/types/ontology.ts:142:18
EntityType                     type       packages/core/src/types/ontology.ts:179:13
RelationKind                   type       packages/core/src/types/ontology.ts:200:13
OrganizationProperties         interface  packages/core/src/types/ontology.ts:238:18
EventProperties                interface  packages/core/src/types/ontology.ts:293:18
LocationProperties             interface  packages/core/src/types/ontology.ts:308:18
DocumentProperties             interface  packages/core/src/types/ontology.ts:320:18
MessageProperties              interface  packages/core/src/types/ontology.ts:333:18
ThreadProperties               interface  packages/core/src/types/ontology.ts:346:18
NoteProperties                 interface  packages/core/src/types/ontology.ts:357:18
AccountProperties              interface  packages/core/src/types/ontology.ts:368:18
DeviceProperties               interface  packages/core/src/types/ontology.ts:378:18
CredentialProperties           interface  packages/core/src/types/ontology.ts:389:18
ActionProperties               interface  packages/core/src/types/ontology.ts:399:18
PolicyProperties               interface  packages/core/src/types/ontology.ts:411:18
IpcChannel                     type       packages/desktop/src/main/ipc-protocol.ts:170:13
BehaviorDraftReviewDto         interface  packages/web/src/components/os/workspace/project-canonical-ontology.ts:72:18
SkillDefinition                type       packages/web/src/components/skills/index.ts:6:15
SkillMessage                   type       packages/web/src/components/skills/index.ts:6:32
SkillExecution                 type       packages/web/src/components/skills/index.ts:11:15
SkillExecutionProps            type       packages/web/src/components/skills/index.ts:11:31
SkillExecutionStep             type       packages/web/src/components/skills/index.ts:11:52
ChatMessageListProps           type       packages/web/src/components/ui/chat/index.ts:1:54
Duplicate exports (23)
useSpring|default                                      packages/core/src/lib/features/animations/useSpring.ts
CultureDetectionStatusSchema|SessionState              packages/core/src/lib/features/culture/types.ts
UserTasteProfileSchema|UserTasteProfile                packages/core/src/lib/features/culture/types.ts
CultureDetectionSessionSchema|CultureDetectionSession  packages/core/src/lib/features/culture/types.ts
StartDetectionRequestSchema|StartDetectionRequest      packages/core/src/lib/features/culture/types.ts
StartDetectionResponseSchema|StartDetectionResponse    packages/core/src/lib/features/culture/types.ts
GetTasteDraftResponseSchema|GetTasteDraftResponse      packages/core/src/lib/features/culture/types.ts
AgentInitializer|default                               packages/web/src/components/os/AgentInitializer.tsx
SenseCenter|default                                    packages/web/src/components/os/sense-center/SenseCenter.tsx
AppWindow|default                                      packages/web/src/components/os/window/AppWindow.tsx
AppWindowContainer|default                             packages/web/src/components/os/window/AppWindowContainer.tsx
ViewRenderer|default                                   packages/web/src/components/os/window/ViewRenderer.tsx
WindowControls|default                                 packages/web/src/components/os/window/WindowControls.tsx
WindowResizer|default                                  packages/web/src/components/os/window/WindowResizer.tsx
WindowTitleBar|default                                 packages/web/src/components/os/window/WindowTitleBar.tsx
SandboxConsole|default                                 packages/web/src/components/sandbox/SandboxConsole.tsx
SandboxErrorPanel|default                              packages/web/src/components/sandbox/SandboxErrorPanel.tsx
SandboxIframe|default                                  packages/web/src/components/sandbox/SandboxIframe.tsx
SandboxWindow|default                                  packages/web/src/components/sandbox/SandboxWindow.tsx
useAcrylic|default                                     packages/web/src/hooks/useAcrylic.ts
useAppWindow|default                                   packages/web/src/hooks/useAppWindow.ts
useAppWindowManager|default                            packages/web/src/hooks/useAppWindowManager.ts
useDockIconAnimation|default                           packages/web/src/hooks/useDockIconAnimation.ts

## Unused dependencies (64)

```
@dagrejs/dagre                        package.json:73:6
@dnd-kit/core                         package.json:74:6
@neural-nexus/view-manager            package.json:77:6
@originos/perception-plugin-dingtalk  package.json:78:6
@originos/perception-plugin-email     package.json:79:6
@originos/perception-plugin-feishu    package.json:80:6
@originos/perception-plugin-wecom     package.json:81:6
@originos/pi-agent-adapter            package.json:82:6
@radix-ui/react-progress              package.json:83:6
@radix-ui/react-slot                  package.json:84:6
@tanstack/react-table                 package.json:86:6
@types/d3-force                       package.json:87:6
@typesafe-ai/sdk                      package.json:88:6
@xyflow/react                         package.json:89:6
archiver                              package.json:90:6
class-variance-authority              package.json:91:6
d3-force                              package.json:93:6
highlight.js                          package.json:94:6
mermaid                               package.json:98:6
react-markdown                        package.json:104:6
rehype-highlight                      package.json:105:6
remark-gfm                            package.json:106:6
undici                                package.json:108:6
uuid                                  package.json:109:6
yaml                                  package.json:110:6
zod                                   package.json:111:6
@anthropic-ai/sdk                     packages/agent/package.json:41:6
@aws-sdk/client-bedrock-runtime       packages/agent/package.json:42:6
@google/genai                         packages/agent/package.json:47:6
@mistralai/mistralai                  packages/agent/package.json:48:6
@opentelemetry/api                    packages/agent/package.json:49:6
@smithy/node-http-handler             packages/agent/package.json:51:6
http-proxy-agent                      packages/agent/package.json:52:6
https-proxy-agent                     packages/agent/package.json:53:6
openai                                packages/agent/package.json:55:6
@anthropic-ai/sandbox-runtime         packages/desktop/package.json:39:6
@larksuiteoapi/node-sdk               packages/desktop/package.json:40:6
@originos/pi-agent-adapter            packages/desktop/package.json:46:6
@sinclair/typebox                     packages/desktop/package.json:47:6
@typesafe-ai/sdk                      packages/desktop/package.json:48:6
@wecom/aibot-node-sdk                 packages/desktop/package.json:49:6
electron-log                          packages/desktop/package.json:52:6
electron-updater                      packages/desktop/package.json:53:6
ignore                                packages/desktop/package.json:54:6
imapflow                              packages/desktop/package.json:55:6
mailparser                            packages/desktop/package.json:56:6
onnxruntime-node                      packages/desktop/package.json:57:6
uuid                                  packages/desktop/package.json:59:6
zod                                   packages/desktop/package.json:60:6
zustand                               packages/desktop/package.json:61:6
yaml                                  packages/desktop/package.json:62:6
@anthropic-ai/sandbox-runtime         packages/web/package.json:16:6
@micro-zoe/micro-app                  packages/web/package.json:20:6
@radix-ui/react-progress              packages/web/package.json:21:6
@tanstack/react-table                 packages/web/package.json:24:6
clsx                                  packages/web/package.json:27:6
d3-force                              packages/web/package.json:28:6
framer-motion                         packages/web/package.json:29:6
ignore                                packages/web/package.json:31:6
llpage                                packages/web/package.json:32:6
onnxruntime-node                      packages/web/package.json:36:6
qiankun                               packages/web/package.json:37:6
tailwind-merge                        packages/web/package.json:43:6
undici                                packages/web/package.json:44:6

## Unused devDependencies (32)

```
@testing-library/jest-dom         package.json:116:6
@testing-library/user-event       package.json:118:6
vitest-canvas-mock                package.json:139:6
tsx                               packages/core/package.json:15:6
@types/adm-zip                    packages/desktop/package.json:66:6
@types/mailparser                 packages/desktop/package.json:68:6
tsx                               packages/desktop/package.json:74:6
@types/d3-force                   packages/web/package.json:53:6
@typescript-eslint/eslint-plugin  packages/web/package.json:57:6
@typescript-eslint/parser         packages/web/package.json:58:6
@vitejs/plugin-react              packages/web/package.json:59:6
@vitest/coverage-v8               packages/web/package.json:60:6
eslint-config-next                packages/web/package.json:63:6
eslint-plugin-import              packages/web/package.json:64:6
prettier                          packages/web/package.json:67:6
prettier-plugin-tailwindcss       packages/web/package.json:68:6
Unlisted dependencies (11)
eslint-import-resolver-typescript              .eslintrc.cjs:251:28
@modelcontextprotocol/sdk/client/index.js      packages/core/src/modules/mcp-in-browser/src/client.ts:2:24
reflect-metadata                               packages/core/src/modules/mcp-in-browser/src/decorator/index.ts:4:8
lodash                                         packages/core/src/modules/mcp-in-browser/src/decorator/index.ts:6:20
@modelcontextprotocol/sdk/server/mcp           packages/core/src/modules/mcp-in-browser/src/server.ts:2:27
lodash                                         packages/core/src/modules/mcp-in-browser/src/server.ts:5:20
@modelcontextprotocol/sdk/shared/transport.js  …core/src/modules/mcp-in-browser/src/transport/TabClientTransport.ts:1:32
@modelcontextprotocol/sdk/shared/transport.js  …core/src/modules/mcp-in-browser/src/transport/TabServerTransport.ts:1:32
@neural-nexus/view-reconciler                  packages/core/src/modules/view-manager/src/view.ts:1:95
postcss-load-config                            packages/web/postcss.config.mjs:1:10
postcss-load-config                            postcss.config.mjs:1:10
Unresolved imports (3)
eslint-import-resolver-typescript  .eslintrc.cjs
./contracts.ts                     packages/pi-tasks/src/store.d.ts:6:8
./model.ts                         packages/pi-tasks/src/store.d.ts:7:57

## 人工甄别注记（基线局限）

1. **依赖级误报样本**：`@originos/perception-plugin-*`（4 个）与 `@originos/pi-agent-adapter` 被 `packages/desktop/package.json` 的 `dev`/`build:app` 脚本以 `pnpm --filter` 显式消费，knip 无法解析脚本内 --filter 引用 → 非死依赖。依赖级清单全部条目需同法甄别后方可处置。
2. **文件级待甄别样本**：`packages/desktop/src/lib/integrations/electron/*`（5 文件）与 `agent-worker-runtime-deps.ts` 在 AG.9 迁移后疑为死码，但 `packages/pi-tasks/src/*.d.ts`、`upstream/` 为上游镜像结构，`collaboration-runtime/ui/*.tsx` 与 `MultiAgentLauncher` 家族关联——处置前必须逐文件确认（动态 import / F1 staging / 上游同步机制）。
3. **导出级**：大量 `@originos/core` feature types/schema 导出（culture/types.ts 等）——exports 白名单过渡态（AG.9 FR-2）已知形态，属 AG.11 后续按热度消化输入，不在本基线处置。
4. **配置 hints（6）**：knip 建议移除 ignore/entry 冗余项；保留原样（ignore 覆盖产物路径为防御性配置，`next.config.mjs` entry 显式声明提升可读性）。

**结论**：基线归档完成；文件级 121 / 导出级 80 / 类型级 47 / 依赖级 64+16 的处置排期见 Epic AG.11 后续（依赖 AG.10 并行节奏），不阻塞本 proposal。
