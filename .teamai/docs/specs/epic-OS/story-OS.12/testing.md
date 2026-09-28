# 测试策略 - Story OS.12

**Story:** 系统级 Office 文件读取能力（Word / Excel / CSV）
**Epic:** OS — Phase 0 OS 交互基础
**最后更新:** 2026-07-20

---

## 测试目标

验证系统级 Office 文件读取能力的正确性和稳定性，确保：

1. .docx / .xlsx / .csv / .md / .txt 文件能正确解析
2. 工具遵守工作目录边界
3. 大文件分页机制有效
4. 工具 description 清晰准确
5. Project Agent / RoleAgent 能正确使用工具

---

## 测试范围

### 1. 文档解析基础层测试

#### 测试用例

**TC-1.1: .docx 文件解析**

- **输入**：包含标题、段落、表格的 .docx 文件
- **预期**：返回 DocumentAst，包含 blocks 和 tables
- **验证方式**：单元测试

**TC-1.2: .xlsx 文件解析**

- **输入**：包含多个 sheet 的 .xlsx 文件
- **预期**：返回 WorkbookAst，包含所有 sheet 的数据
- **验证方式**：单元测试

**TC-1.3: .csv 文件解析**

- **输入**：包含 header 和 rows 的 .csv 文件
- **预期**：返回 WorkbookAst，包含 headers 和 rows
- **验证方式**：单元测试

**TC-1.4: .md 文件解析**

- **输入**：Markdown 文件
- **预期**：返回 DocumentAst，包含段落 blocks
- **验证方式**：单元测试

**TC-1.5: .txt 文件解析**

- **输入**：纯文本文件
- **预期**：返回 DocumentAst，包含段落 blocks
- **验证方式**：单元测试

**TC-1.6: 大文件解析性能**

- **输入**：10MB 的 .docx 文件
- **预期**：解析时间 < 5s，内存占用 < 500MB
- **验证方式**：性能测试

**TC-1.7: 编码兼容处理**

- **输入**：UTF-8 / GBK / Latin-1 编码的 .csv 文件
- **预期**：所有编码都能正确解析
- **验证方式**：单元测试

---

### 2. read_document 工具测试

#### 测试用例

**TC-2.1: 读取 .docx 文件**

- **输入**：`read_document({ filePath: 'test.docx' })`
- **预期**：返回正文段落和表格摘要
- **验证方式**：单元测试 + 集成测试

**TC-2.2: 读取 .md 文件**

- **输入**：`read_document({ filePath: 'test.md' })`
- **预期**：返回 Markdown 内容
- **验证方式**：单元测试 + 集成测试

**TC-2.3: 读取 .txt 文件**

- **输入**：`read_document({ filePath: 'test.txt' })`
- **预期**：返回纯文本内容
- **验证方式**：单元测试 + 集成测试

**TC-2.4: 分页读取（按字符数）**

- **输入**：`read_document({ filePath: 'large.docx', offset: 0, limit: 5000 })`
- **预期**：返回前 5000 字符，`truncated: true`，`nextCursor: 5000`
- **验证方式**：单元测试

**TC-2.5: 分页读取（按章节）**

- **输入**：`read_document({ filePath: 'large.docx', offset: 2, limit: 3 })`
- **预期**：返回第 2-4 章节内容
- **验证方式**：单元测试

**TC-2.6: 工作目录边界检查**

- **输入**：`read_document({ filePath: '../../etc/passwd' })`
- **预期**：返回错误，不能读取边界外文件
- **验证方式**：单元测试

**TC-2.7: 相对路径解析**

- **输入**：`read_document({ filePath: 'docs/readme.md' })`，workingDirectory 为 `/project`
- **预期**：读取 `/project/docs/readme.md`
- **验证方式**：单元测试

---

### 3. read_spreadsheet 工具测试

#### 测试用例

**TC-3.1: 读取 .xlsx 文件**

- **输入**：`read_spreadsheet({ filePath: 'test.xlsx' })`
- **预期**：返回第一个 sheet 的数据
- **验证方式**：单元测试 + 集成测试

**TC-3.2: 读取指定 sheet**

- **输入**：`read_spreadsheet({ filePath: 'test.xlsx', sheetName: 'Sheet2' })`
- **预期**：返回 Sheet2 的数据
- **验证方式**：单元测试

**TC-3.3: 读取指定 range**

- **输入**：`read_spreadsheet({ filePath: 'test.xlsx', range: 'A1:D10' })`
- **预期**：返回 A1:D10 范围的数据
- **验证方式**：单元测试

**TC-3.4: 分页读取（按行数）**

- **输入**：`read_spreadsheet({ filePath: 'large.xlsx', offset: 0, limit: 100 })`
- **预期**：返回前 100 行，`truncated: true`，`nextCursor: 100`
- **验证方式**：单元测试

**TC-3.5: 读取 .csv 文件**

- **输入**：`read_spreadsheet({ filePath: 'test.csv' })`
- **预期**：返回 CSV 数据
- **验证方式**：单元测试 + 集成测试

**TC-3.6: 工作目录边界检查**

- **输入**：`read_spreadsheet({ filePath: '../../etc/passwd' })`
- **预期**：返回错误
- **验证方式**：单元测试

---

### 4. list_document_structure 工具测试

#### 测试用例

**TC-4.1: 列出 .docx 结构**

- **输入**：`list_document_structure({ filePath: 'test.docx' })`
- **预期**：返回章节标题、表格数量、段落数量
- **验证方式**：单元测试

**TC-4.2: 列出 .xlsx 结构**

- **输入**：`list_document_structure({ filePath: 'test.xlsx' })`
- **预期**：返回 sheet 列表、每个 sheet 的行列数
- **验证方式**：单元测试

**TC-4.3: 列出 .csv 结构**

- **输入**：`list_document_structure({ filePath: 'test.csv' })`
- **预期**：返回列数、行数、headers
- **验证方式**：单元测试

---

### 5. extract_document_tables 工具测试

#### 测试用例

**TC-5.1: 提取 .docx 表格**

- **输入**：`extract_document_tables({ filePath: 'test.docx' })`
- **预期**：返回所有表格数据
- **验证方式**：单元测试

**TC-5.2: 提取指定表格**

- **输入**：`extract_document_tables({ filePath: 'test.docx', tableIndex: 0 })`
- **预期**：返回第一个表格数据
- **验证方式**：单元测试

**TC-5.3: 提取 .xlsx 表格**

- **输入**：`extract_document_tables({ filePath: 'test.xlsx' })`
- **预期**：返回所有 sheet 的数据（作为表格）
- **验证方式**：单元测试

**TC-5.4: 提取 .csv 表格**

- **输入**：`extract_document_tables({ filePath: 'test.csv' })`
- **预期**：返回 CSV 数据（作为表格）
- **验证方式**：单元测试

---

### 6. 工具 Description 测试

#### 测试用例

**TC-6.1: read_document description**

- **输入**：检查 `read_document` 的 description
- **预期**：明确说明路径规则、分页规则、返回结构
- **验证方式**：代码审查

**TC-6.2: read_spreadsheet description**

- **输入**：检查 `read_spreadsheet` 的 description
- **预期**：明确说明 sheetName / range / offset / limit 参数
- **验证方式**：代码审查

**TC-6.3: list_document_structure description**

- **输入**：检查 `list_document_structure` 的 description
- **预期**：明确说明返回结构信息
- **验证方式**：代码审查

**TC-6.4: extract_document_tables description**

- **输入**：检查 `extract_document_tables` 的 description
- **预期**：明确说明表格提取逻辑
- **验证方式**：代码审查

---

### 7. 集成测试

#### 测试用例

**TC-7.1: Project Agent 读取上传文件**

- **输入**：在项目访谈中上传 .docx 文件
- **预期**：Project Agent 能调用 `read_document` 读取内容
- **验证方式**：集成测试

**TC-7.2: RoleAgent 读取业务文档**

- **输入**：RoleAgent 对话中上传 .xlsx 文件
- **预期**：RoleAgent 能调用 `read_spreadsheet` 读取内容
- **验证方式**：集成测试

**TC-7.3: SkillDialog 读取上传文件**

- **输入**：在 SkillDialog 中上传 .csv 文件
- **预期**：Agent 能调用 `read_spreadsheet` 读取内容
- **验证方式**：集成测试

**TC-7.4: 文档内容进入 Knowledge Base**

- **输入**：RoleAgent 读取文档后沉淀到 `knowledge/wiki/`
- **预期**：文档内容正确写入知识库
- **验证方式**：集成测试

---

### 8. 构建测试

#### 测试用例

**TC-8.1: Core 包测试通过**

- **输入**：执行 `pnpm --filter @originos/core test`
- **预期**：所有测试通过
- **验证命令**：`pnpm --filter @originos/core test`

**TC-8.2: Web 包构建通过**

- **输入**：执行 `pnpm --filter @originos/web build`
- **预期**：构建成功，无错误
- **验证命令**：`pnpm --filter @originos/web build`

---

## 测试执行

### 单元测试

```bash
# 文档解析基础层测试
pnpm --filter @originos/core test -- document

# 工具层测试
pnpm --filter @originos/core test -- document-tools
```

### 集成测试

```bash
# 完整集成测试
pnpm --filter @originos/core test -- integration
```

### 手动测试

1. 上传各种格式的文档文件
2. 验证 Agent 能否正确读取
3. 检查分页是否正确
4. 验证工作目录边界

---

## 验收标准测试

### AC-1: .docx 文件读取

- **测试用例**：TC-1.1, TC-2.1
- **预期结果**：能正确读取正文段落和表格
- **通过标准**：100% 测试用例通过

### AC-2: .xlsx 文件读取

- **测试用例**：TC-1.2, TC-3.1 ~ TC-3.2
- **预期结果**：能按 sheet 和 range 读取
- **通过标准**：100% 测试用例通过

### AC-3: .csv 文件读取

- **测试用例**：TC-1.3, TC-3.5
- **预期结果**：能分页读取
- **通过标准**：100% 测试用例通过

### AC-4: 工作目录边界

- **测试用例**：TC-2.6, TC-3.6
- **预期结果**：不能读取边界外文件
- **通过标准**：100% 测试用例通过

### AC-5: 大文件分页

- **测试用例**：TC-2.4 ~ TC-2.5, TC-3.4
- **预期结果**：大文件不会一次性返回全文
- **通过标准**：100% 测试用例通过

### AC-6: 工具 Description

- **测试用例**：TC-6.1 ~ TC-6.4
- **预期结果**：description 清晰准确
- **通过标准**：100% 测试用例通过

### AC-7: 集成验证

- **测试用例**：TC-7.1 ~ TC-7.4
- **预期结果**：Project Agent / RoleAgent / SkillDialog 能正确使用工具
- **通过标准**：100% 测试用例通过

### AC-8: 构建通过

- **测试用例**：TC-8.1 ~ TC-8.2
- **预期结果**：Core 测试通过，Web 构建通过
- **通过标准**：0 error

---

## 测试报告模板

```markdown
# Story OS.12 测试报告

**测试日期**：YYYY-MM-DD
**测试人员**：[姓名]
**测试环境**：[环境描述]

## 测试执行摘要

| 测试类别 | 测试用例数 | 通过数 | 失败数 | 通过率 |
|---------|----------|--------|--------|--------|
| 文档解析基础层 | 7 | | | |
| read_document 工具 | 7 | | | |
| read_spreadsheet 工具 | 6 | | | |
| list_document_structure | 3 | | | |
| extract_document_tables | 4 | | | |
| 工具 Description | 4 | | | |
| 集成测试 | 4 | | | |
| 构建测试 | 2 | | | |
| **总计** | **37** | | | |

## 失败用例详情

### [用例编号]：[用例名称]

- **输入**：
- **预期结果**：
- **实际结果**：
- **失败原因**：
- **修复建议**：

## 文件格式支持验证

| 格式 | 解析 | 读取 | 分页 | 边界检查 | 结果 |
|------|------|------|------|---------|------|
| .docx | | | | | |
| .xlsx | | | | | |
| .csv | | | | | |
| .md | | | | | |
| .txt | | | | | |

## 测试结论

- [ ] 所有验收标准测试通过
- [ ] 所有文件格式支持
- [ ] 工作目录边界有效
- [ ] 分页机制有效
- [ ] 可以合入主分支

## 备注

[其他需要说明的事项]
```

---

## 相关文档

- [需求规格](./requirements.md)
- [架构设计](./architecture.md)
- [Story OS.12 README](./README.md)
