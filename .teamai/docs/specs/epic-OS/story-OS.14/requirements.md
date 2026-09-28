# 需求规格 - Story OS.14

**Story:** Agent Runtime 工作目录与输出目录边界收敛
**Epic:** OS — Phase 0 OS 交互基础
**最后更新:** 2026-07-20

---

## 用户故事

> 作为 OriginOS 用户，我希望不同类型的 Agent 在读取项目文件、写入方案产物或执行技能时，文件工具始终使用当前运行时明确注入的工作目录，不因为技能输出目录、项目目录或 Agent 目录混用而读错文件或写错位置。

---

## 背景与问题

Agent Runtime 中长期存在两类目录语义：

- `workingDirectory`：当前 Agent 调用工具时的工作目录
- `outputDir`：当前 Agent / Skill 的产物输出目录

此前工具层曾直接接收 `skillOutputDir`，并在文件工具、文档工具或 shell 工具中自行判断路径基准。这导致工具层同时理解"工作目录"和"输出目录"，破坏了分层边界，也让 AI 解决方案窗体这类"项目根目录 + solutions 输出目录"的场景出现路径漂移。

典型问题：

- `execute_command` 运行在项目根目录，但 `list_files` / `read_file` 被解析到 `solutions/`
- `skillOutputDir` 被注入 `ToolExecutionContext`，让所有工具都能依赖输出目录语义
- `Skill` 元工具在执行中修改全局 tool context，进一步扩大上下文污染风险
- 测试仍断言工具上下文包含 `skillOutputDir`，使旧架构被持续固化

---

## 范围

### A. ToolExecutionContext 收敛（必须）

- [x] `ToolExecutionContext` 只保留 `sessionId` 和 `workingDirectory`
- [x] `AgentManager` 不再把 `outputDir` 注入为 `skillOutputDir`
- [x] `bind-session` 文档只描述 `workingDirectory`

### B. 工具实现去耦（必须）

- [x] `file-tools` 只基于 `workingDirectory` 解析路径
- [x] `document-tools` 只基于 `workingDirectory` 解析路径
- [x] `url-tools` 对相对路径只基于 `workingDirectory`
- [x] `bash-tools` 不再从 tool context 注入 `SKILL_OUTPUT_DIR`
- [x] `Skill` 元工具不再修改 tool context 注入输出目录

### C. Runtime / Prompt 层保留输出目录语义（必须）

- [x] `SkillLauncher` 仍可解析 skill frontmatter 的 `outputDir`
- [x] `SkillDialog` / `SkillLauncher` 在 system prompt 中说明输出目录
- [x] 输出目录只作为 Agent 决策上下文，不进入通用工具上下文

### D. 测试与回归（必须）

- [x] 工作目录测试验证工具上下文只包含 `workingDirectory`
- [x] 验证文件工具始终基于注入的工作目录
- [x] 保留 outputDir 相关测试在 runtime 层，避免误删产物目录能力

---

## 非目标

- ❌ 不重构所有 Agent 类型的阶段调度器
- ❌ 不新增动态 per-tool workingDirectory 切换协议
- ❌ 不移除 launcher / skill metadata 中的 `outputDir`
- ❌ 不改变已有数据目录结构

---

## 验收标准

1. - [x] `ToolExecutionContext` 类型中不存在 `skillOutputDir`
2. - [x] 工具层代码不再读取 `toolContext.skillOutputDir`
3. - [x] `AgentManager` 不再向工具上下文注入 `outputDir`
4. - [x] `Skill` 元工具不再改写全局 tool context
5. - [x] 文件类工具只以 `workingDirectory` 为路径边界
6. - [x] AI 解决方案窗体可继续通过 prompt 获得输出目录信息，但工具默认路径不漂移到 `solutions/`
7. - [x] 定向测试覆盖工作目录语义并通过

---

## 依赖关系

- **前置依赖：** OS.7（Agent 托管服务）已交付、OS.10（系统工具语义说明加固）
- **优先级：** High（影响 Agent / Skill / RoleAgent / Project Agent 的文件工具一致性）
- **估计工时：** 1-2 天

---

## 与其他 Story 的关系

- **OS.7 Agent 托管服务**：本 Story 收敛 Agent 托管时传入工具层的上下文语义
- **OS.10 系统工具语义说明加固**：本 Story 将工具 schema 和 runtime contract 对齐
- **OS.12 系统级 Office 文件读取能力**：文档工具必须继承同一工作目录边界
- **P2 AI 解决方案设计**：解决项目根目录与 `solutions/` 输出目录混用导致的路径漂移

---

## 相关文档

- [架构设计](./architecture.md)
- [测试策略](./testing.md)
- [Story OS.14 README](./README.md)
