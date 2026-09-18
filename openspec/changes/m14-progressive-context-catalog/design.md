# Design：统一渐进式认知目录

## 背景

`memory-consumption.ts` 当前可直接返回 Knowledge/Patterns 全文，Project Agent 又各自实现了标题提取。重复逻辑导致入口行为不一致。

## 目标与非目标

- 目标：一个共享 helper 生成有界、确定的 Markdown 标题目录；四条 Agent prompt builder 共用。
- 非目标：语义召回、stable prompt 重排、存储迁移。

## 设计决策

1. 在现有 Pi Agent integration 的 `memory-consumption.ts` 增加目录渲染，避免新模块。
2. 只解析二至四级 Markdown 标题，保持文件顺序，以字符预算截断；不引入 Markdown parser 依赖。
3. `buildPromptMemorySections` 的 Knowledge/Pattern 输出改为目录和读取说明；Project Agent 删除私有重复 helper。
4. 普通 Agent 的 `buildAgentSystemPrompt` 也调用同一 helper；完整文件仍保留在工作目录。

## 依赖与边界

Core integration 仅依赖 Node/共享类型，不依赖 Web、Desktop 或业务 UI。无 public IPC、持久化、并发和迁移变化。

## 安全与性能

目录不扩展文件路径，不写日志正文。解析为单次线性扫描；固定预算避免超大文件进入 prompt。

## 替代方案

- 新建 Context Manager：职责重复，拒绝。
- 引入 Markdown AST 包：标题提取无需额外依赖，拒绝。
- 只修 RoleAgent：其他入口继续膨胀，拒绝。

## Subagent 实施边界

- Task worktree 可写：`packages/core/src/lib/integrations/pi-agent/memory-consumption.ts`、四个现有 prompt builder 及其定向测试。
- 不得写：Web、Desktop、Memory Core 存储、协作 worker。

## 回滚

回滚共享 helper 和调用方提交即可；无数据回滚。
