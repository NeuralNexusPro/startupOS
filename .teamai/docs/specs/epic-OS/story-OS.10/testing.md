# 测试策略 - Story OS.10

**Story:** 系统工具语义说明加固（Tool Schema Description Hardening）
**Epic:** OS — Phase 0 OS 交互基础
**最后更新:** 2026-07-20

---

## 测试目标

验证所有 25 个系统工具的 schema description 完整性和准确性，确保：

1. 所有工具的输入参数都有清晰的 description
2. 本体工具的 ontologyId / domainId 说明一致且明确
3. 所有工具的工具级 description 包含返回结构说明
4. 易错点有防御性提示
5. LLM 能正确理解并使用这些说明

---

## 测试范围

### 1. 本体工具 Description 测试

#### 测试用例

**TC-1.1: ontologyId 参数说明一致性**

- **输入**：检查所有 10 个本体工具的 `ontologyId` 参数
- **预期**：所有工具的 `ontologyId` description 内容一致，明确说明"形如 `ontology-{projectId}`"、"不要自己生成"
- **验证方式**：代码审查 + 自动化检查

**TC-1.2: domainId 参数说明一致性**

- **输入**：检查所有需要 `domainId` 的本体工具
- **预期**：所有工具的 `domainId` description 内容一致，明确说明"先调 query_ontology"
- **验证方式**：代码审查 + 自动化检查

**TC-1.3: conceptId 参数说明**

- **输入**：检查需要 `conceptId` 的工具
- **预期**：description 明确说明"从 list_concepts 获取，不要自己生成"
- **验证方式**：代码审查

**TC-1.4: instanceId 参数说明**

- **输入**：检查需要 `instanceId` 的工具
- **预期**：description 明确说明"从 query_instances 获取，不要自己生成"
- **验证方式**：代码审查

**TC-1.5: fields 参数说明**

- **输入**：检查 `create_instance` / `update_instance` 的 `fields` 参数
- **预期**：description 明确说明"结构由 concept 定义决定，可先调用 get_concept_schema"
- **验证方式**：代码审查

**TC-1.6: conceptType 枚举说明**

- **输入**：检查 `create_concept` 的 `conceptType` 参数
- **预期**：description 列出所有枚举值：entity / process / attribute / relation
- **验证方式**：代码审查

---

### 2. 文件工具 Description 测试

#### 测试用例

**TC-2.1: filePath 参数说明**

- **输入**：检查 `read_file` / `write_file` / `edit_file` / `delete_file` 的 `filePath` 参数
- **预期**：所有工具的 `filePath` description 一致，明确说明"默认相对于工作目录"、"不要拼接 data/projects/..."
- **验证方式**：代码审查

**TC-2.2: content 参数说明**

- **输入**：检查 `write_file` 的 `content` 参数
- **预期**：description 明确说明"文件内容"
- **验证方式**：代码审查

**TC-2.3: oldString 参数说明**

- **输入**：检查 `edit_file` 的 `oldString` 参数
- **预期**：description 明确说明"必须是文件内唯一存在的子串"
- **验证方式**：代码审查

**TC-2.4: newString 参数说明**

- **输入**：检查 `edit_file` 的 `newString` 参数
- **预期**：description 明确说明"替换后的新字符串"
- **验证方式**：代码审查

**TC-2.5: replaceAll 参数说明**

- **输入**：检查 `edit_file` 的 `replaceAll` 参数
- **预期**：description 明确说明"是否替换所有匹配项，默认 false"
- **验证方式**：代码审查

---

### 3. 工具级返回结构测试

#### 测试用例

**TC-3.1: 本体工具返回结构**

- **输入**：检查所有 10 个本体工具的 description
- **预期**：每个工具的 description 末尾包含返回结构说明，如 `{ success, ontologyId, ontology: { domains[], concepts[], relations[] } }`
- **验证方式**：代码审查

**TC-3.2: 文件工具返回结构**

- **输入**：检查所有 5 个文件工具的 description
- **预期**：每个工具的 description 末尾包含返回结构说明，如 `{ success, content: string, lineCount }`
- **验证方式**：代码审查

**TC-3.3: Bash/代码工具返回结构**

- **输入**：检查 `execute_command` / `search_code` / `glob_files` 的 description
- **预期**：包含返回结构说明
- **验证方式**：代码审查

**TC-3.4: 文档工具返回结构**

- **输入**：检查 `read_document` 的 description
- **预期**：包含返回结构说明
- **验证方式**：代码审查

**TC-3.5: 技能工具返回结构**

- **输入**：检查 `list_skills` / `Skill` 的 description
- **预期**：包含返回结构说明
- **验证方式**：代码审查

**TC-3.6: 系统工具返回结构**

- **输入**：检查 4 个系统工具的 description
- **预期**：包含返回结构说明
- **验证方式**：代码审查

**TC-3.7: URL/HITL 工具返回结构**

- **输入**：检查 `generate_file_url` / `ask_user_question` 的 description
- **预期**：包含返回结构说明
- **验证方式**：代码审查

---

### 4. 易错点防御性提示测试

#### 测试用例

**TC-4.1: edit_file 防御性提示**

- **输入**：检查 `edit_file` 的 description
- **预期**：明确说明"oldString 必须是文件内唯一存在的子串，否则要 replaceAll=true"
- **验证方式**：代码审查

**TC-4.2: write_file 防御性提示**

- **输入**：检查 `write_file` 的 description
- **预期**：明确说明"会完整覆盖原文件，需要追加请用 read_file + write_file 模式"
- **验证方式**：代码审查

**TC-4.3: delete_file 防御性提示**

- **输入**：检查 `delete_file` 的 description
- **预期**：明确说明"目录会递归删除，慎用"
- **验证方式**：代码审查

**TC-4.4: execute_command 防御性提示**

- **输入**：检查 `execute_command` 的 description
- **预期**：明确说明"默认超时 30000ms，长任务请显式传 timeout"
- **验证方式**：代码审查

**TC-4.5: Skill 防御性提示**

- **输入**：检查 `Skill` 的 description
- **预期**：明确说明"调用后会收到技能完整指令，不要嵌套调用其他工具直到收到指令"
- **验证方式**：代码审查

---

### 5. 类型检查测试

#### 测试用例

**TC-5.1: TypeScript 编译通过**

- **输入**：执行 `npx tsc --noEmit --skipLibCheck`
- **预期**：0 error
- **验证命令**：`npx tsc --noEmit --skipLibCheck`

**TC-5.2: ESLint 检查通过**

- **输入**：执行 `npm run lint`
- **预期**：0 error
- **验证命令**：`npm run lint`

---

### 6. 集成验证测试

#### 测试用例

**TC-6.1: 协作会话本体任务验证**

- **输入**：在协作会话上跑一次本体相关任务
- **预期**：Agent 不再出现自造 `design-data-ontology` 这类 ID
- **验证方式**：查看协作会话日志，检查 Agent 是否正确获取 ontologyId

**TC-6.2: LLM prompt 注入验证**

- **输入**：抽查 3 个工具的 description
- **预期**：description 在 LLM 调用时正确进入 prompt（通过 pi-ai 的 tool 注入路径验证）
- **验证方式**：查看 LLM 请求日志，确认 tool schema 正确传递

---

### 7. 参数覆盖度测试

#### 测试用例

**TC-7.1: 所有非空对象参数都有 description**

- **输入**：检查所有 25 个工具的 parameters schema
- **预期**：所有非空对象参数（不含 `Type.Object({})`）均有 `description` 字段
- **验证方式**：自动化脚本检查

**TC-7.2: 统计参数说明覆盖度**

- **输入**：运行脚本统计所有参数的 description 覆盖率
- **预期**：覆盖率 100%（除 `Type.Object({})` 外）
- **验证方式**：自动化脚本

---

## 测试执行

### 自动化检查

```bash
# TypeScript 编译检查
npx tsc --noEmit --skipLibCheck

# ESLint 检查
npm run lint

# 参数 description 覆盖率检查（自定义脚本）
node scripts/check-tool-descriptions.mjs
```

### 手动验证

1. 代码审查所有工具文件
2. 检查 description 内容是否符合规约
3. 检查返回结构说明是否完整
4. 检查易错点提示是否清晰

### 集成测试

1. 启动协作会话
2. 执行本体相关任务
3. 查看 Agent 行为日志
4. 验证是否正确获取 ontologyId / domainId

---

## 验收标准测试

### AC-1: 参数 description 完整性

- **测试用例**：TC-1.1 ~ TC-2.5, TC-7.1 ~ TC-7.2
- **预期结果**：所有非空对象参数都有 description
- **通过标准**：覆盖率 100%

### AC-2: 本体工具说明一致性

- **测试用例**：TC-1.1 ~ TC-1.6
- **预期结果**：ontologyId / domainId / conceptId / instanceId 说明一致
- **通过标准**：100% 一致

### AC-3: 返回结构说明完整性

- **测试用例**：TC-3.1 ~ TC-3.7
- **预期结果**：所有 25 个工具的 description 末尾包含返回结构
- **通过标准**：覆盖率 100%

### AC-4: 易错点提示完整性

- **测试用例**：TC-4.1 ~ TC-4.5
- **预期结果**：所有易错点都有防御性提示
- **通过标准**：100% 覆盖

### AC-5: 类型检查通过

- **测试用例**：TC-5.1 ~ TC-5.2
- **预期结果**：TypeScript 和 ESLint 检查 0 error
- **通过标准**：0 error

### AC-6: 集成验证通过

- **测试用例**：TC-6.1 ~ TC-6.2
- **预期结果**：Agent 不再自造 ID，description 正确进入 prompt
- **通过标准**：协作会话验证通过

---

## 测试报告模板

```markdown
# Story OS.10 测试报告

**测试日期**：YYYY-MM-DD
**测试人员**：[姓名]
**测试环境**：[环境描述]

## 测试执行摘要

| 测试类别 | 测试用例数 | 通过数 | 失败数 | 通过率 |
|---------|----------|--------|--------|--------|
| 本体工具 Description | 6 | | | |
| 文件工具 Description | 5 | | | |
| 工具级返回结构 | 7 | | | |
| 易错点防御性提示 | 5 | | | |
| 类型检查 | 2 | | | |
| 集成验证 | 2 | | | |
| 参数覆盖度 | 2 | | | |
| **总计** | **29** | | | |

## 失败用例详情

### [用例编号]：[用例名称]

- **输入**：
- **预期结果**：
- **实际结果**：
- **失败原因**：
- **修复建议**：

## 参数 Description 覆盖率

| 工具类别 | 参数总数 | 有 description | 覆盖率 |
|---------|---------|---------------|--------|
| 本体工具 | | | |
| 文件工具 | | | |
| Bash/代码工具 | | | |
| 文档工具 | | | |
| 技能工具 | | | |
| 系统工具 | | | |
| URL/HITL 工具 | | | |
| **总计** | | | |

## 测试结论

- [ ] 所有验收标准测试通过
- [ ] 参数 description 覆盖率 100%
- [ ] 可以合入主分支

## 备注

[其他需要说明的事项]
```

---

## 相关文档

- [需求规格](./requirements.md)
- [架构设计](./architecture.md)
- [Story OS.10 README](./README.md)
