# 需求规格 - Story OS.12

**Story:** 系统级 Office 文件读取能力（Word / Excel / CSV）
**Epic:** OS — Phase 0 OS 交互基础
**最后更新:** 2026-07-20

---

## 用户故事

> 作为 OriginOS 用户，我希望在项目访谈、角色 Agent 对话或技能执行中上传 Word、Excel、CSV 文件后，系统能稳定读取其中的正文、表格和结构化数据，让 Agent 可以基于真实业务文档完成项目建模、知识沉淀和后续协作，而不是要求我手动复制粘贴文件内容。

---

## 背景与问题

OriginOS 当前已有文件工具和文档工具入口，但 Office 类文件理解能力不应由每个技能自行实现。项目初始化、业务建模、知识库沉淀、角色 Agent 咨询都可能消费 `.docx` / `.xlsx` / `.csv` 文件，如果解析逻辑散落在技能中，会产生以下问题：

1. **解析不一致** — 不同技能对标题、表格、sheet、合并单元格、公式值的处理不一致
2. **路径边界风险** — 技能自行读文件容易绕开 `workingDirectory` / `agentBaseDir` / `projectContext.currentPath` 约束
3. **上下文爆炸** — Excel 大表或长文档如果一次性塞给 LLM，会导致 token 超限和响应不稳定
4. **认知系统难以复用** — Knowledge / Patterns / Project Agent 都需要相同的文档中间格式作为事实来源

因此需要提供系统级、受控、可分页的文件读取基础设施。

---

## 设计原则

1. **系统级能力，不是技能私有实现**
   - Office 解析放在 `packages/core` 的基础能力层
   - Agent / Skill 通过统一工具调用，不直接依赖第三方解析库

2. **确定性解析与 LLM 理解分离**
   - 基础层只负责文件解析和结构化输出
   - 摘要、抽取、建模由上层 Agent / Skill 决定

3. **默认受路径边界保护**
   - 工具只能读取当前会话允许的工作目录内文件
   - 遵循现有工具目录优先级：`agentBaseDir` > `projectContext.currentPath` > `workingDirectory` > `getDataRoot()`

4. **大文件必须分页 / 切片**
   - Word 支持按章节或字符范围读取
   - Excel 支持按 sheet、range、行偏移读取
   - CSV 支持按 offset / limit 读取

---

## 范围

### A. 文件解析基础层（必须）

在 `packages/core/src/lib/features/document/` 增加统一文档解析模块：

```typescript
export interface DocumentAst {
  type: 'docx' | 'txt' | 'md';
  title?: string;
  blocks: Array<DocumentBlock>;
  tables: Array<DocumentTable>;
  metadata: DocumentMetadata;
}

export interface WorkbookAst {
  type: 'xlsx' | 'csv';
  sheets: Array<WorkbookSheet>;
  metadata: WorkbookMetadata;
}
```

必须支持：

- [ ] `.docx`：提取正文段落、标题层级、表格文本、基础 metadata
- [ ] `.xlsx`：提取 workbook、sheet 列表、单元格值、公式计算值、合并单元格信息
- [ ] `.csv`：提取 header、rows、列数、行数、编码兼容处理
- [ ] `.md` / `.txt`：作为轻量文本读取统一纳入该模块

### B. Agent 工具层（必须）

在 `packages/core/src/lib/integrations/pi-agent/tools/document-tools.ts` 扩展或新增工具：

| 工具 | 用途 |
|------|------|
| `read_document` | 读取 `.docx` / `.md` / `.txt`，返回分页正文和表格摘要 |
| `read_spreadsheet` | 读取 `.xlsx` / `.csv`，返回 sheet / range / rows |
| `list_document_structure` | 返回文档章节、表格、sheet、行列规模，不读取全文 |
| `extract_document_tables` | 只提取 Word / Excel / CSV 表格，便于业务建模 |

工具输入必须包含 description，明确：

- [ ] `filePath` 相对当前工作目录解析，不要拼接 `data/projects/...`
- [ ] `sheetName` / `range` / `offset` / `limit` 用于控制大文件读取范围
- [ ] 超出最大读取量时返回 `truncated: true` 和下一页游标

### C. 项目访谈与知识沉淀接入（建议）

- [ ] Project Agent 在项目访谈中可调用 `read_document` / `read_spreadsheet` 读取上传文件
- [ ] 读取结果可作为 `business-model.json`、`Knowledge.md`、ontology 初始建模的事实来源
- [ ] RoleAgent 可将用户提供的文档片段沉淀到 `knowledge/wiki/` 或 `Memory.md`

### D. 不在范围

- ❌ `.doc` / `.xls` 老格式支持
- ❌ PDF OCR / 扫描件识别
- ❌ 图片内文字识别
- ❌ LLM 自动总结质量优化
- ❌ Office 文件写入 / 编辑

---

## 验收标准

1. - [ ] `.docx` 文件可通过 `read_document` 读取正文段落和表格
2. - [ ] `.xlsx` 文件可通过 `read_spreadsheet` 按 sheet 和 range 读取
3. - [ ] `.csv` 文件可通过 `read_spreadsheet` 或 CSV 分支分页读取
4. - [ ] 所有工具都遵守会话工作目录边界，不能读取边界外文件
5. - [ ] 大文件读取不会一次性返回全文，必须支持 `truncated` / `nextCursor`
6. - [ ] 工具 description 明确路径规则、分页规则、返回结构
7. - [ ] Project Agent / SkillDialog 上传文件后，Agent 能使用系统工具读取 Office 内容
8. - [ ] `pnpm --filter @originos/core test` 通过
9. - [ ] `pnpm --filter @originos/web build` 通过

---

## 依赖关系

- **前置依赖：** OS.7（Agent 托管服务）已交付、OS.10（系统工具语义说明加固）建议先完成
- **优先级：** High（影响项目访谈、知识沉淀、RoleAgent 与技能执行的文件理解能力）
- **估计工时：** 3-5 天

---

## 相关文档

- [OS.10 系统工具语义说明加固](../story-OS.10/README.md)
- [Epic 1 项目访谈](../../epic-1/)
- [Epic C 认知系统](../../epic-C/)
- [Epic R RoleAgent](../../epic-R/)
