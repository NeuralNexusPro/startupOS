# 测试策略 - Story OS.14

**Story:** Agent Runtime 工作目录与输出目录边界收敛
**Epic:** OS — Phase 0 OS 交互基础
**最后更新:** 2026-07-20

---

## 测试目标

验证工作目录与输出目录边界收敛后的正确性，确保：

1. `ToolExecutionContext` 只包含 `workingDirectory`
2. 所有工具只基于 `workingDirectory` 解析路径
3. `AgentManager` 不再注入 `skillOutputDir`
4. `Skill` 元工具不再修改全局 tool context
5. AI 解决方案窗体通过 prompt 获得输出目录信息
6. 工具默认路径不漂移到 `solutions/`

---

## 测试范围

### 1. ToolExecutionContext 类型测试

#### 测试用例

**TC-1.1: 类型定义检查**

- **输入**：检查 `ToolExecutionContext` 类型定义
- **预期**：类型中不存在 `skillOutputDir` 字段
- **验证方式**：TypeScript 编译检查

**TC-1.2: 工具上下文构造**

- **输入**：构造 `ToolExecutionContext` 实例
- **预期**：只包含 `sessionId` 和 `workingDirectory`
- **验证方式**：单元测试

---

### 2. AgentManager 测试

#### 测试用例

**TC-2.1: 不注入 skillOutputDir**

- **输入**：`AgentManager` 创建工具上下文
- **预期**：上下文中不包含 `skillOutputDir`
- **验证方式**：单元测试

**TC-2.2: 只注入 workingDirectory**

- **输入**：`AgentManager` 创建工具上下文
- **预期**：上下文中只包含 `workingDirectory`
- **验证方式**：单元测试

---

### 3. file-tools 测试

#### 测试用例

**TC-3.1: read_file 路径解析**

- **输入**：`read_file({ filePath: 'data.json' })`，workingDirectory 为 `/project`
- **预期**：读取 `/project/data.json`
- **验证方式**：单元测试

**TC-3.2: write_file 路径解析**

- **输入**：`write_file({ filePath: 'output.txt', content: '...' })`，workingDirectory 为 `/project`
- **预期**：写入 `/project/output.txt`
- **验证方式**：单元测试

**TC-3.3: list_files 路径解析**

- **输入**：`list_files({ path: 'src' })`，workingDirectory 为 `/project`
- **预期**：列出 `/project/src` 目录
- **验证方式**：单元测试

**TC-3.4: 相对路径不漂移**

- **输入**：workingDirectory 为 `/project`，调用 `read_file('data.json')`
- **预期**：不解析到 `/project/solutions/data.json`
- **验证方式**：单元测试

---

### 4. document-tools 测试

#### 测试用例

**TC-4.1: read_document 路径解析**

- **输入**：`read_document({ filePath: 'doc.md' })`，workingDirectory 为 `/project`
- **预期**：读取 `/project/doc.md`
- **验证方式**：单元测试

**TC-4.2: read_spreadsheet 路径解析**

- **输入**：`read_spreadsheet({ filePath: 'data.xlsx' })`，workingDirectory 为 `/project`
- **预期**：读取 `/project/data.xlsx`
- **验证方式**：单元测试

---

### 5. url-tools 测试

#### 测试用例

**TC-5.1: 相对路径解析**

- **输入**：url-tools 处理相对路径，workingDirectory 为 `/project`
- **预期**：基于 `/project` 解析
- **验证方式**：单元测试

---

### 6. bash-tools 测试

#### 测试用例

**TC-6.1: 不注入 SKILL_OUTPUT_DIR 环境变量**

- **输入**：`execute_command({ command: 'env' })`
- **预期**：环境变量中不包含 `SKILL_OUTPUT_DIR`
- **验证方式**：单元测试

**TC-6.2: 注入 WORKING_DIRECTORY 环境变量**

- **输入**：`execute_command({ command: 'pwd' })`，workingDirectory 为 `/project`
- **预期**：在 `/project` 目录执行
- **验证方式**：单元测试

---

### 7. skill-tools 测试

#### 测试用例

**TC-7.1: 不修改全局 tool context**

- **输入**：执行 Skill 元工具
- **预期**：不修改全局 toolContext 的 `skillOutputDir`
- **验证方式**：单元测试

**TC-7.2: 输出目录通过 system prompt 传递**

- **输入**：技能执行时
- **预期**：输出目录信息在 system prompt 中说明
- **验证方式**：集成测试

---

### 8. 集成测试

#### 测试用例

**TC-8.1: AI 解决方案窗体场景**

- **输入**：
  - workingDirectory: `/project/root`
  - outputDir: `/project/root/solutions`
  - Agent 调用 `read_file('data.json')`
  - Agent 调用 `write_file('solution.md', '...')`
- **预期**：
  - 读取 `/project/root/data.json`
  - system prompt 指导写入 `solutions/solution.md`
  - 实际写入 `/project/root/solutions/solution.md`
- **验证方式**：集成测试

**TC-8.2: 技能执行场景**

- **输入**：
  - workingDirectory: `/data/web/skills/my-skill`
  - outputDir: `/data/web/skills/my-skill/output`
  - Agent 执行技能
- **预期**：
  - 工具基于 workingDirectory 解析路径
  - system prompt 说明输出目录
- **验证方式**：集成测试

**TC-8.3: 项目 Agent 场景**

- **输入**：
  - workingDirectory: `/project/my-project`
  - outputDir: `/project/my-project/artifacts`
  - Project Agent 执行
- **预期**：
  - 工具基于 workingDirectory 解析路径
  - 产物写入 artifacts 目录
- **验证方式**：集成测试

---

### 9. 回归测试

#### 测试用例

**TC-9.1: 旧测试断言更新**

- **输入**：运行原有测试套件
- **预期**：所有断言 `toolContext.skillOutputDir` 的测试已更新
- **验证方式**：运行测试套件

**TC-9.2: outputDir 能力保留**

- **输入**：检查 runtime 层测试
- **预期**：outputDir 相关测试保留在 runtime 层
- **验证方式**：代码审查

---

## 验收标准测试

### AC-1: ToolExecutionContext 类型

- **测试用例**：TC-1.1 ~ TC-1.2
- **预期结果**：类型中不存在 `skillOutputDir`
- **通过标准**：100% 测试用例通过

### AC-2: 工具层不读取 skillOutputDir

- **测试用例**：TC-3.1 ~ TC-3.4, TC-4.1 ~ TC-4.2, TC-5.1, TC-6.1 ~ TC-6.2
- **预期结果**：所有工具只基于 `workingDirectory` 解析路径
- **通过标准**：100% 测试用例通过

### AC-3: AgentManager 不注入 outputDir

- **测试用例**：TC-2.1 ~ TC-2.2
- **预期结果**：工具上下文中不包含 `skillOutputDir`
- **通过标准**：100% 测试用例通过

### AC-4: Skill 元工具不改写 context

- **测试用例**：TC-7.1 ~ TC-7.2
- **预期结果**：Skill 元工具不修改全局 tool context
- **通过标准**：100% 测试用例通过

### AC-5: 文件工具路径边界

- **测试用例**：TC-3.1 ~ TC-3.4
- **预期结果**：文件类工具只以 `workingDirectory` 为路径边界
- **通过标准**：100% 测试用例通过

### AC-6: AI 解决方案窗体

- **测试用例**：TC-8.1
- **预期结果**：通过 prompt 获得输出目录信息，工具默认路径不漂移
- **通过标准**：100% 测试用例通过

### AC-7: 定向测试通过

- **测试用例**：TC-1.1 ~ TC-9.2
- **预期结果**：所有工作目录语义测试通过
- **通过标准**：100% 测试用例通过

---

## 测试执行

### 单元测试

```bash
# 工具上下文测试
pnpm --filter @originos/core test -- tool-context

# 文件工具测试
pnpm --filter @originos/core test -- file-tools

# 工作目录测试
pnpm --filter @originos/core test -- working-directory
```

### 集成测试

```bash
# 完整集成测试
pnpm --filter @originos/core test -- integration
```

### 手动测试

1. 在 AI 解决方案窗体中上传文件
2. 验证 Agent 读取文件路径正确
3. 验证 Agent 写入产物到 solutions 目录
4. 检查工具默认路径不漂移

---

## 测试报告模板

```markdown
# Story OS.14 测试报告

**测试日期**：YYYY-MM-DD
**测试人员**：[姓名]
**测试环境**：[环境描述]

## 测试执行摘要

| 测试类别 | 测试用例数 | 通过数 | 失败数 | 通过率 |
|---------|----------|--------|--------|--------|
| ToolExecutionContext 类型 | 2 | | | |
| AgentManager | 2 | | | |
| file-tools | 4 | | | |
| document-tools | 2 | | | |
| url-tools | 1 | | | |
| bash-tools | 2 | | | |
| skill-tools | 2 | | | |
| 集成测试 | 3 | | | |
| 回归测试 | 2 | | | |
| **总计** | **20** | | | |

## 失败用例详情

### [用例编号]：[用例名称]

- **输入**：
- **预期结果**：
- **实际结果**：
- **失败原因**：
- **修复建议**：

## 路径漂移验证

| 场景 | workingDirectory | outputDir | 读取路径 | 写入路径 | 结果 |
|------|-----------------|-----------|---------|---------|------|
| AI 解决方案窗体 | | | | | |
| 技能执行 | | | | | |
| 项目 Agent | | | | | |

## 测试结论

- [ ] 所有验收标准测试通过
- [ ] ToolExecutionContext 类型收敛
- [ ] 工具层不读取 skillOutputDir
- [ ] AgentManager 不注入 outputDir
- [ ] 文件工具路径边界正确
- [ ] AI 解决方案窗体路径不漂移
- [ ] 可以合入主分支

## 备注

[其他需要说明的事项]
```

---

## 相关文档

- [需求规格](./requirements.md)
- [架构设计](./architecture.md)
- [Story OS.14 README](./README.md)
