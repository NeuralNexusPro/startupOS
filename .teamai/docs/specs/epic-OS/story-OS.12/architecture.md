# 架构设计 - Story OS.12

**Story:** 系统级 Office 文件读取能力（Word / Excel / CSV）
**Epic:** OS — Phase 0 OS 交互基础
**最后更新:** 2026-07-20

---

## 技术栈

| 技术 | 用途 | 说明 |
|------|------|------|
| mammoth | .docx 解析 | 提取正文和基础表格 |
| exceljs | .xlsx 解析 | 保留 workbook 结构 |
| papaparse | .csv 解析 | 成熟 CSV 解析 |
| TypeScript | 类型定义 | 文档 AST 结构 |

---

## 数据结构

### DocumentAst（文档 AST）

```typescript
export interface DocumentAst {
  type: 'docx' | 'txt' | 'md';
  title?: string;
  blocks: Array<DocumentBlock>;
  tables: Array<DocumentTable>;
  metadata: DocumentMetadata;
}

export interface DocumentBlock {
  type: 'paragraph' | 'heading' | 'list' | 'table';
  content: string;
  level?: number; // heading level
  rows?: DocumentTableRow[]; // for table
}

export interface DocumentTable {
  id: string;
  rows: DocumentTableRow[];
}

export interface DocumentTableRow {
  cells: string[];
}

export interface DocumentMetadata {
  pageCount?: number;
  wordCount?: number;
  author?: string;
  createdAt?: string;
}
```

### WorkbookAst（表格 AST）

```typescript
export interface WorkbookAst {
  type: 'xlsx' | 'csv';
  sheets: Array<WorkbookSheet>;
  metadata: WorkbookMetadata;
}

export interface WorkbookSheet {
  name: string;
  rows: string[][];
  headers?: string[];
  rowCount: number;
  columnCount: number;
}

export interface WorkbookMetadata {
  sheetCount: number;
  totalRows: number;
  totalColumns: number;
}
```

---

## 模块设计

### 文件解析基础层

**目录：** `packages/core/src/lib/features/document/`

**职责：**
- 提供统一的文档解析接口
- 支持 .docx / .xlsx / .csv / .md / .txt 格式
- 返回结构化的 AST（Abstract Syntax Tree）

**核心模块：**

#### docx-parser.ts

```typescript
import mammoth from 'mammoth';

export async function parseDocx(filePath: string): Promise<DocumentAst> {
  const result = await mammoth.convertToHtml({ path: filePath });
  // 解析 HTML 为 DocumentBlock 数组
  // 提取表格、段落、标题
  return {
    type: 'docx',
    title: extractTitle(result.value),
    blocks: parseBlocks(result.value),
    tables: extractTables(result.value),
    metadata: extractMetadata(result.value),
  };
}
```

#### xlsx-parser.ts

```typescript
import ExcelJS from 'exceljs';

export async function parseXlsx(filePath: string): Promise<WorkbookAst> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  
  const sheets = workbook.worksheets.map(sheet => ({
    name: sheet.name,
    rows: sheetToRows(sheet),
    headers: extractHeaders(sheet),
    rowCount: sheet.rowCount,
    columnCount: sheet.columnCount,
  }));
  
  return {
    type: 'xlsx',
    sheets,
    metadata: {
      sheetCount: sheets.length,
      totalRows: sheets.reduce((sum, s) => sum + s.rowCount, 0),
      totalColumns: Math.max(...sheets.map(s => s.columnCount)),
    },
  };
}
```

#### csv-parser.ts

```typescript
import Papa from 'papaparse';

export async function parseCsv(filePath: string): Promise<WorkbookAst> {
  const content = await fs.readFile(filePath, 'utf-8');
  const result = Papa.parse(content, { header: true });
  
  return {
    type: 'csv',
    sheets: [{
      name: 'Sheet1',
      rows: result.data as string[][],
      headers: result.meta.fields,
      rowCount: result.data.length,
      columnCount: result.meta.fields?.length || 0,
    }],
    metadata: {
      sheetCount: 1,
      totalRows: result.data.length,
      totalColumns: result.meta.fields?.length || 0,
    },
  };
}
```

#### text-parser.ts

```typescript
export async function parseText(filePath: string): Promise<DocumentAst> {
  const content = await fs.readFile(filePath, 'utf-8');
  const blocks = content.split('\n\n').map(para => ({
    type: 'paragraph' as const,
    content: para,
  }));
  
  return {
    type: 'md',
    blocks,
    tables: [],
    metadata: {
      wordCount: content.split(/\s+/).length,
    },
  };
}
```

### Agent 工具层

**文件：** `packages/core/src/lib/integrations/pi-agent/tools/document-tools.ts`

**工具列表：**

#### read_document

```typescript
export const readDocumentTool: ToolRegistration = {
  name: 'read_document',
  description: '读取 .docx / .md / .txt 文件，返回分页正文和表格摘要。',
  parameters: Type.Object({
    filePath: Type.String({
      description: '文件路径。相对当前工作目录解析，不要拼接 data/projects/...',
    }),
    offset: Type.Optional(Type.Number({
      description: '起始位置（字符偏移或章节编号）',
    })),
    limit: Type.Optional(Type.Number({
      description: '最大读取量（字符数或章节数）',
    })),
  }),
  execute: async (input, context) => {
    const fullPath = resolvePath(context.workingDirectory, input.filePath);
    const ast = await parseDocument(fullPath);
    
    // 分页逻辑
    const content = extractContent(ast, input.offset, input.limit);
    if (content.length > MAX_CHARS) {
      return {
        success: true,
        content: content.slice(0, MAX_CHARS),
        truncated: true,
        nextCursor: input.offset + MAX_CHARS,
      };
    }
    
    return {
      success: true,
      content,
      truncated: false,
    };
  },
};
```

#### read_spreadsheet

```typescript
export const readSpreadsheetTool: ToolRegistration = {
  name: 'read_spreadsheet',
  description: '读取 .xlsx / .csv 文件，返回 sheet / range / rows。',
  parameters: Type.Object({
    filePath: Type.String({
      description: '文件路径。相对当前工作目录解析。',
    }),
    sheetName: Type.Optional(Type.String({
      description: 'Sheet 名称。不指定则返回第一个 sheet。',
    })),
    range: Type.Optional(Type.String({
      description: '单元格范围，如 A1:D10。不指定则返回全部。',
    })),
    offset: Type.Optional(Type.Number({
      description: '行偏移',
    })),
    limit: Type.Optional(Type.Number({
      description: '最大行数',
    })),
  }),
  execute: async (input, context) => {
    const fullPath = resolvePath(context.workingDirectory, input.filePath);
    const ast = await parseWorkbook(fullPath);
    
    const sheet = input.sheetName 
      ? ast.sheets.find(s => s.name === input.sheetName)
      : ast.sheets[0];
    
    if (!sheet) {
      return { success: false, error: 'Sheet not found' };
    }
    
    // 分页逻辑
    const rows = extractRows(sheet, input.offset, input.limit);
    if (rows.length > MAX_ROWS) {
      return {
        success: true,
        sheetName: sheet.name,
        rows: rows.slice(0, MAX_ROWS),
        truncated: true,
        nextCursor: (input.offset || 0) + MAX_ROWS,
      };
    }
    
    return {
      success: true,
      sheetName: sheet.name,
      rows,
      truncated: false,
    };
  },
};
```

#### list_document_structure

```typescript
export const listDocumentStructureTool: ToolRegistration = {
  name: 'list_document_structure',
  description: '返回文档章节、表格、sheet、行列规模，不读取全文。',
  parameters: Type.Object({
    filePath: Type.String({
      description: '文件路径。相对当前工作目录解析。',
    }),
  }),
  execute: async (input, context) => {
    const fullPath = resolvePath(context.workingDirectory, input.filePath);
    const ast = await parseDocument(fullPath);
    
    return {
      success: true,
      structure: {
        title: ast.title,
        blockCount: ast.blocks.length,
        tableCount: ast.tables.length,
        headings: ast.blocks
          .filter(b => b.type === 'heading')
          .map(b => ({ level: b.level, content: b.content })),
      },
    };
  },
};
```

#### extract_document_tables

```typescript
export const extractDocumentTablesTool: ToolRegistration = {
  name: 'extract_document_tables',
  description: '只提取 Word / Excel / CSV 表格，便于业务建模。',
  parameters: Type.Object({
    filePath: Type.String({
      description: '文件路径。相对当前工作目录解析。',
    }),
    tableIndex: Type.Optional(Type.Number({
      description: '表格索引。不指定则返回所有表格。',
    })),
  }),
  execute: async (input, context) => {
    const fullPath = resolvePath(context.workingDirectory, input.filePath);
    const ast = await parseDocument(fullPath);
    
    const tables = input.tableIndex !== undefined
      ? [ast.tables[input.tableIndex]]
      : ast.tables;
    
    return {
      success: true,
      tables: tables.map(t => ({
        id: t.id,
        rowCount: t.rows.length,
        columnCount: t.rows[0]?.cells.length || 0,
        rows: t.rows,
      })),
    };
  },
};
```

---

## 代码变更

### 新增文件

| 文件路径 | 说明 |
|---------|------|
| `packages/core/src/lib/features/document/index.ts` | 模块导出 |
| `packages/core/src/lib/features/document/types.ts` | 类型定义 |
| `packages/core/src/lib/features/document/docx-parser.ts` | Word 解析器 |
| `packages/core/src/lib/features/document/xlsx-parser.ts` | Excel 解析器 |
| `packages/core/src/lib/features/document/csv-parser.ts` | CSV 解析器 |
| `packages/core/src/lib/features/document/text-parser.ts` | 文本解析器 |
| `packages/core/src/lib/features/document/__tests__/` | 解析测试 |

### 修改文件

| 文件路径 | 说明 |
|---------|------|
| `packages/core/src/lib/integrations/pi-agent/tools/document-tools.ts` | 增加 Word / Excel / CSV 读取工具 |
| `packages/core/src/lib/integrations/pi-agent/tools/registry.ts` | 注册新增工具 |
| `packages/web/src/components/skills/SkillDialog.tsx` | 如需，在 system prompt 中说明可读取上传 Office 文件 |
| `packages/core/src/lib/integrations/pi-agent/project-agent/project-prompt.ts` | 如需，提示 Project Agent 优先读取用户上传业务文档 |

---

## 输出控制

### 默认限制

- `read_document` 单次最多返回 `12000` 字符
- `read_spreadsheet` 单次最多返回 `200` 行或 `20000` 单元格字符
- 所有超限返回 `truncated: true` 和 `nextCursor`

### 分页策略

**文档分页：**
- 按字符数分页（默认 12000 字符）
- 支持按章节分页（offset 为章节编号）
- 返回 `nextCursor` 供下次读取

**表格分页：**
- 按行数分页（默认 200 行）
- 支持按单元格字符数分页（默认 20000 字符）
- 返回 `nextCursor` 供下次读取

---

## 阶段化交付

| PR | 范围 | 价值 |
|----|------|------|
| PR-A | `read_document` 支持 `.docx` / `.md` / `.txt` | 项目访谈可读取需求文档、会议纪要 |
| PR-B | `read_spreadsheet` 支持 `.xlsx` / `.csv` | 可读取清单、业务台账、设备表、角色表 |
| PR-C | `list_document_structure` / `extract_document_tables` | 大文件先探测结构，再按需读取 |
| PR-D | Project Agent / RoleAgent 接入 | 文档内容进入业务建模和认知系统 |

---

## 相关文档

- [需求规格](./requirements.md)
- [测试策略](./testing.md)
- [Story OS.12 README](./README.md)
- [OS.10 系统工具语义说明加固](../story-OS.10/README.md)
