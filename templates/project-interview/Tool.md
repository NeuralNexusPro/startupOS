---
toolsVersion: 1.0.0
allowedTools: [write_file, read_file, edit_file, list_files, delete_file, read_document, read_spreadsheet, list_document_structure, extract_document_tables, execute_command, query_ontology, create_domain, create_concept, search_ontology, record_project_interview_observation, get_current_time]
---

# 可用工具

本 Agent 可以使用以下内置工具完成访谈任务。

## 文件工具

### write_file
写入内容到文件（完整覆盖，目录不存在时自动创建）

**参数**:
- `filePath` (string): 相对路径，如 `output/business-model.json`
- `content` (string): 文件的完整内容字符串

**使用场景**: 保存访谈进度、写入或更新业务模型 JSON、更新记忆文件

### read_file
读取文件内容

**参数**:
- `filePath` (string): 相对路径

**使用场景**: 读取已有访谈记录、加载业务模型

### edit_file
通过查找替换编辑文件内容（局部修改，避免全量重写）

**参数**:
- `filePath` (string): 相对路径
- `oldString` (string): 要替换的原始内容
- `newString` (string): 替换后的新内容
- `replaceAll` (boolean, 可选): 是否替换所有匹配项，默认 false

**使用场景**: 更新访谈进度中的特定字段、修改业务模型局部内容

### list_files
列出目录中的文件和子目录

**参数**:
- `directory` (string): 目录路径，默认 `.`

**使用场景**: 查看项目输出文件、检查文件是否存在

### delete_file
删除文件或目录

**参数**:
- `filePath` (string): 文件路径

**使用场景**: 清理临时文件（操作前需用户确认）

## 文档读取工具

### read_document
读取 Word(.docx)、Markdown、Text、JSON/XML/HTML 文档，支持分页。

**参数**:
- `filePath` (string): 相对路径，如 `files/需求说明.docx`
- `offset` / `cursor` (可选): 分页读取位置
- `limit` (number, 可选): 本次最多返回字符数

**使用场景**: 读取用户上传的需求文档、会议纪要、业务说明，并用于业务模型提取。

### read_spreadsheet
读取 Excel(.xlsx) 或 CSV，按工作表和行范围返回表格内容。

**参数**:
- `filePath` (string): 相对路径，如 `files/设备清单.xlsx`
- `sheetName` (string, 可选): 工作表名称
- `offset` / `cursor` (可选): 起始行
- `limit` (number, 可选): 本次最多返回行数

**使用场景**: 读取业务台账、设备清单、角色表、需求矩阵。

### list_document_structure
查看文档结构，不读取全文。

**使用场景**: 读取大文件前先查看章节、表格、sheet、行列规模。

### extract_document_tables
只提取 Word / Excel / CSV 中的表格。

**使用场景**: 从业务文档中抽取结构化实体、字段、清单数据。

## 本体工具

### record_project_interview_observation
将本轮已确认的业务领域、关键对象和联系直接记录到当前项目模型。首次调用会自动建立项目本体；每次确认新内容后立即调用。

### query_ontology
查询本体中的领域、概念或关系

**参数**:
- `ontologyId` (string): 本体 ID
- `query` (string): 查询条件

**使用场景**: 查找已有实体、检查重复、获取相关概念

### create_domain
在本体中创建业务领域

**参数**:
- `ontologyId` (string): 本体 ID
- `name` (string): 领域名称
- `description` (string): 领域描述

**使用场景**: 建立业务领域分类

### create_concept
在本体中创建业务概念（实体）

**参数**:
- `ontologyId` (string): 本体 ID
- `domainId` (string): 所属领域 ID
- `name` (string): 概念名称
- `properties` (object): 概念属性

**使用场景**: 创建业务实体、建立领域模型

### search_ontology
在本体中搜索相关概念

**参数**:
- `ontologyId` (string): 本体 ID
- `keyword` (string): 搜索关键词

**使用场景**: 快速定位相关概念、避免重复创建

## 系统工具

### get_current_time
获取当前时间戳（ISO 8601 格式）

**使用场景**: 记录访谈时间、标记文档生成时间

## 工作流技能

项目初始化时会自动把三个访谈阶段技能复制到当前项目的 `skills/` 目录。每次回复前根据当前阶段调用 `read_file` 加载对应技能文件，按其指引推进对话；确认的业务信息使用 `record_project_interview_observation` 写入 canonical ontology。

当访谈中出现行动、状态变化、输入输出记录或业务约束时，先用 `save_project_interview_behavior_draft` 保存可审阅草稿。草稿只保留来源消息 ID，不写入消息正文；权限、引用或业务含义不明确时必须列为待确认项。草稿不会自动写入本体，也不能执行行动。用户在界面明确确认前，只能继续澄清和审阅。

| 阶段 | 触发条件 | 技能文件 |
|------|----------|----------|
| Phase 1 领域发现 | 初次访谈 | `skills/domain-discovery/SKILL.md` |
| Phase 2 业务精炼 | 已确认核心业务概念后 | `skills/business-refinement/SKILL.md` |
| Phase 3 模型审阅 | 用户主动要求审阅或模型完整 | `skills/model-review/SKILL.md` |

## 工具使用原则

1. **路径始终用相对路径** - 系统自动解析到项目目录，无需拼接项目 ID
2. **每次对话后保存进度** - 调用 `write_file` 更新 `output/interview-progress.md`
3. **Office 文件先看结构再读取** - 大文档/大表优先调用 `list_document_structure`，再分页调用 `read_document` 或 `read_spreadsheet`
4. **重要操作先确认** - 删除文件前向用户确认
5. **工具调用失败时** - 向用户说明并提供替代方案
l
