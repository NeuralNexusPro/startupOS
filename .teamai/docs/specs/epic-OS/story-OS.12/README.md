# Story OS.12: 系统级 Office 文件读取能力（Word / Excel / CSV）

**Epic:** OS — Phase 0 OS 交互基础
**状态:** 📋 Planning
**优先级:** High（影响项目访谈、知识沉淀、RoleAgent 与技能执行的文件理解能力）
**估计工时:** 3-5 天

---

## Story 概览

> 作为 OriginOS 用户，我希望在项目访谈、角色 Agent 对话或技能执行中上传 Word、Excel、CSV 文件后，系统能稳定读取其中的正文、表格和结构化数据，让 Agent 可以基于真实业务文档完成项目建模、知识沉淀和后续协作，而不是要求我手动复制粘贴文件内容。

---

## 快速导航

- [需求规格](./requirements.md) - 用户故事、功能需求、验收标准
- [架构设计](./architecture.md) - 技术栈、数据结构、模块设计
- [测试策略](./testing.md) - 测试用例、验收标准测试

---

## 核心问题

OriginOS 当前 Office 类文件理解能力不应由每个技能自行实现：

1. **解析不一致** — 不同技能对标题、表格、sheet、合并单元格、公式值的处理不一致
2. **路径边界风险** — 技能自行读文件容易绕开 `workingDirectory` / `agentBaseDir` / `projectContext.currentPath` 约束
3. **上下文爆炸** — Excel 大表或长文档如果一次性塞给 LLM，会导致 token 超限和响应不稳定
4. **认知系统难以复用** — Knowledge / Patterns / Project Agent 都需要相同的文档中间格式作为事实来源

因此需要提供系统级、受控、可分页的文件读取基础设施。

---

## 设计原则

1. **系统级能力，不是技能私有实现** - Office 解析放在 `packages/core` 的基础能力层
2. **确定性解析与 LLM 理解分离** - 基础层只负责文件解析和结构化输出
3. **默认受路径边界保护** - 工具只能读取当前会话允许的工作目录内文件
4. **大文件必须分页 / 切片** - Word 按章节、Excel 按 sheet/range、CSV 按 offset/limit

---

## 关键变更

- 📋 新增 `packages/core/src/lib/features/document/` 文档解析基础层
- 📋 新增工具：`read_document` / `read_spreadsheet` / `list_document_structure` / `extract_document_tables`
- 📋 支持 `.docx` / `.xlsx` / `.csv` / `.md` / `.txt` 格式
- 📋 所有工具遵守会话工作目录边界，支持分页读取

---

## 依赖关系

- **前置依赖：** OS.7（Agent 托管服务）已交付、OS.10（系统工具语义说明加固）建议先完成

---

## 相关文档

- [需求规格](./requirements.md)
- [架构设计](./architecture.md)
- [测试策略](./testing.md)

