# Tasks

## 1. Story 与 Core 策略模型

- [x] 1.1 `P29-T1-A`（串行；依赖：Proposal 批准；角色：Solution Core subagent；写入：`docs/specs/epic-P2/story-P2.9/`、`docs/specs/epic-P2/README.md`、`packages/core/src/lib/features/solution/` 及定向测试）建立 Story P2.9 文档，新增节点产出验收配置的公共类型、校验、读取与未发布方案原子保存服务；验证自动验收、用户确认、指定角色确认、非法角色、confirmed/published 禁止修改及 contractHash 纳入策略。

## 2. 产品配置入口

- [x] 2.1 `P29-T1-B`（串行；依赖：1.1；角色：Solution UI/Integration subagent；写入：`packages/core/src/lib/integrations/electron/`、`packages/desktop/src/main/`、`packages/web/src/services/`、`packages/web/src/app/api/projects/[id]/solutions/`、`packages/web/src/components/solution/` 及定向测试）增加 Web/Electron 双通道策略读写适配，并在解决方案拓扑或发布面板提供“产出验收”编辑器；验证节点中文名称、自动/用户/指定角色切换、保存反馈和已锁定版本只读。

## 3. 运行时与看板语义

- [x] 3.1 `P29-T1-C`（可与 2.1 并行；依赖：1.1；角色：Collaboration Runtime subagent；写入：`packages/core/src/modules/collaboration-runtime/`、`packages/web/src/components/os/task-board/` 及定向测试）确保 verifier 通过后按冻结 HITL 策略自动接纳或进入人工确认，退回进入 revision；看板将 reported、blocked、waiting_hitl、verifying、revision 分栏或明确标记，并验证下游仅在 completed 后可执行。

## 4. 集成与验收

- [x] 4.1 `P29-T1-D`（串行；依赖：2.1、3.1；角色：Integration/QA subagent；写入：Story testing evidence 与本 change tasks）运行 Core/Web/Desktop 定向测试、TypeScript、`pnpm lint:boundaries`、架构自测、core exports 验证与 `openspec validate add-solution-output-acceptance --strict`；在 desktop:dev 验证策略保存、发布、待确认、退回和下游推进，并记录可复核证据。
