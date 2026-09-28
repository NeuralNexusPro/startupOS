# Story OS.14: Agent Runtime 工作目录与输出目录边界收敛

**Epic:** OS — Phase 0 OS 交互基础
**状态:** ✅ Complete
**优先级:** High（影响 Agent / Skill / RoleAgent / Project Agent 的文件工具一致性）
**估计工时:** 1-2 天

---

## Story 概览

> 作为 OriginOS 用户，我希望不同类型的 Agent 在读取项目文件、写入方案产物或执行技能时，文件工具始终使用当前运行时明确注入的工作目录，不因为技能输出目录、项目目录或 Agent 目录混用而读错文件或写错位置。

---

## 快速导航

- [需求规格](./requirements.md) - 用户故事、功能需求、验收标准
- [架构设计](./architecture.md) - 技术栈、数据结构、模块设计
- [测试策略](./testing.md) - 测试用例、验收标准测试

---

## 核心问题

Agent Runtime 中长期存在两类目录语义混用：

- `workingDirectory`：当前 Agent 调用工具时的工作目录
- `outputDir`：当前 Agent / Skill 的产物输出目录

此前工具层直接接收 `skillOutputDir`，导致路径漂移：

- `execute_command` 运行在项目根目录，但 `list_files` / `read_file` 被解析到 `solutions/`
- `skillOutputDir` 被注入 `ToolExecutionContext`，让所有工具都能依赖输出目录语义
- `Skill` 元工具在执行中修改全局 tool context，扩大上下文污染风险

---

## 目标架构

### 工具层

- 只理解一个语义：`workingDirectory`
- 所有相对路径都基于当前注入的 `workingDirectory`
- 不知道 `outputDir`、`skillOutputDir`、项目根、solutions 或 Agent 目录

### Agent / Runtime 层

- 持有 `workingDirectory` 与 `outputDir`
- 根据当前任务阶段决定调用工具时的 `workingDirectory`
- 在 system prompt 中可呈现输出目录信息，指导 Agent 使用相对路径写入产物目录
- 不把 `outputDir` 下推进通用工具上下文

---

## 关键变更

- ✅ `ToolExecutionContext` 只保留 `sessionId` 和 `workingDirectory`
- ✅ `AgentManager` 不再把 `outputDir` 注入为 `skillOutputDir`
- ✅ 所有工具（file/document/url/bash）只基于 `workingDirectory` 解析路径
- ✅ `Skill` 元工具不再修改 tool context 注入输出目录
- ✅ 输出目录语义保留在 Runtime / Prompt 层

---

## 依赖关系

- **前置依赖：** OS.7（Agent 托管服务）已交付、OS.10（系统工具语义说明加固）

---

## 相关文档

- [需求规格](./requirements.md)
- [架构设计](./architecture.md)
- [测试策略](./testing.md)

