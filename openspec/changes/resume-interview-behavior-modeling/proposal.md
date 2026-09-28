# Proposal

## Why

项目访谈完成概念与关系后，重新进入项目不会识别缺少 FactType、Action、Rule、状态和流转，导致方案设计只能发现缺口，无法回到正确的业务确认环节。

## What Changes

- 新增恢复时的本体完备性判定：概念与关系已发布但行为契约为空时进入业务行为确认。
- 在访谈界面展示该阶段及草稿状态，引导用户补充行动、输入输出、状态、规则和权限并确认发布。
- 方案设计仅报告精确缺口并提供返回项目访谈的入口，不再将自然语言描述视为可执行契约。

## Capabilities

### New Capabilities
- `interview-behavior-recovery`: 项目访谈恢复时识别并续接未完成的业务行为建模。

## Impact

- **epic-id**：ONT；**story-id**：访谈语义建模；**task-id**：恢复行为建模；**owner**：OriginOS 项目本体；**来源**：`docs/specs/epic-ONT/`。
- 影响 `packages/core` 项目本体入口与项目 Agent prompt、`packages/web` 访谈和方案界面；不修改既有 canonical 事实，不新增数据库或 IPC 协议。
- 上线后对已有项目只读判定；用户确认前不生成 FactType、Action、Rule。回滚仅移除恢复提示，不影响已发布本体。
