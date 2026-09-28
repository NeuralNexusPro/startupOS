# 测试策略 - Story OS.11

**Story:** 窗体类型元数据统一注册系统（Window Type Registry）
**Epic:** OS — Phase 0 OS 交互基础
**最后更新:** 2026-07-20

---

## 测试目标

验证窗体类型注册系统的正确性和完整性，确保：

1. 注册表包含所有现有窗体类型
2. `resolveWindowType` 能正确解析 entryType
3. `AppWindowManager` 使用注册表而非 if-else 链
4. `/window/page.tsx` 类型定义从注册表派生
5. 新增窗体类型只需修改注册表

---

## 测试范围

### 1. 注册表完整性测试

#### 测试用例

**TC-1.1: 注册表包含所有窗体类型**

- **输入**：检查 `WINDOW_TYPE_REGISTRY`
- **预期**：包含 7 种窗体类型：skill, solution, interview, workspace, agent, role-agent, collaboration
- **验证方式**：代码审查 + 自动化检查

**TC-1.2: 每个窗体类型的 entryTypes 正确**

- **输入**：检查每个 `WindowTypeDescriptor` 的 `entryTypes`
- **预期**：
  - skill: ['skill']
  - solution: ['solution']
  - interview: ['interview']
  - workspace: ['project', 'workspace']
  - agent: ['agent']
  - role-agent: ['role-agent']
  - collaboration: ['collaboration']
- **验证方式**：代码审查

**TC-1.3: 每个窗体类型的 queryParams 正确**

- **输入**：检查每个 `WindowTypeDescriptor` 的 `queryParams`
- **预期**：queryParams 包含该窗体类型需要的所有 query 参数
- **验证方式**：代码审查

**TC-1.4: 窗体类型的 defaultSize 和 minSize 正确**

- **输入**：检查每个 `WindowTypeDescriptor` 的尺寸配置
- **预期**：
  - solution: defaultSize 900x700, minSize 700x500
  - interview: defaultSize 860x680, minSize 700x500
  - workspace: defaultSize 1000x760, minSize 800x600
  - collaboration: defaultSize 1100x800, minSize 900x600
- **验证方式**：代码审查

---

### 2. resolveWindowType 函数测试

#### 测试用例

**TC-2.1: 解析 skill 类型**

- **输入**：`resolveWindowType('skill')`
- **预期**：返回 `{ type: 'skill', entryTypes: ['skill'], queryParams: ['skillName', 'initialMessage'] }`
- **验证方式**：单元测试

**TC-2.2: 解析 solution 类型**

- **输入**：`resolveWindowType('solution')`
- **预期**：返回 solution 描述符
- **验证方式**：单元测试

**TC-2.3: 解析 interview 类型**

- **输入**：`resolveWindowType('interview')`
- **预期**：返回 interview 描述符
- **验证方式**：单元测试

**TC-2.4: 解析 project 类型（映射到 workspace）**

- **输入**：`resolveWindowType('project')`
- **预期**：返回 workspace 描述符（因为 workspace 的 entryTypes 包含 'project'）
- **验证方式**：单元测试

**TC-2.5: 解析 workspace 类型**

- **输入**：`resolveWindowType('workspace')`
- **预期**：返回 workspace 描述符
- **验证方式**：单元测试

**TC-2.6: 解析 agent 类型**

- **输入**：`resolveWindowType('agent')`
- **预期**：返回 agent 描述符
- **验证方式**：单元测试

**TC-2.7: 解析 role-agent 类型**

- **输入**：`resolveWindowType('role-agent')`
- **预期**：返回 role-agent 描述符
- **验证方式**：单元测试

**TC-2.8: 解析 collaboration 类型**

- **输入**：`resolveWindowType('collaboration')`
- **预期**：返回 collaboration 描述符
- **验证方式**：单元测试

**TC-2.9: 解析未知类型**

- **输入**：`resolveWindowType('unknown')`
- **预期**：返回 `undefined`
- **验证方式**：单元测试

---

### 3. AppWindowManager 重构测试

#### 测试用例

**TC-3.1: AppWindowManager 使用注册表**

- **输入**：检查 `AppWindowManager.ts` 代码
- **预期**：不再包含 if-else 链，使用 `resolveWindowType` 函数
- **验证方式**：代码审查

**TC-3.2: 点击 skill 入口打开 skill 窗口**

- **输入**：在首页点击技能卡片
- **预期**：打开 `windowType=skill` 的新窗口
- **验证方式**：手动测试 + E2E 测试

**TC-3.3: 点击 solution 入口打开 solution 窗口**

- **输入**：在项目卡片点击"AI 解决方案"
- **预期**：打开 `windowType=solution` 的新窗口（而非 workspace）
- **验证方式**：手动测试 + E2E 测试

**TC-3.4: 点击 interview 入口打开 interview 窗口**

- **输入**：点击项目访谈入口
- **预期**：打开 `windowType=interview` 的新窗口
- **验证方式**：手动测试 + E2E 测试

**TC-3.5: 点击 project 入口打开 workspace 窗口**

- **输入**：点击项目卡片
- **预期**：打开 `windowType=workspace` 的新窗口
- **验证方式**：手动测试 + E2E 测试

**TC-3.6: 点击 agent 入口打开 agent 窗口**

- **输入**：点击 Agent 入口
- **预期**：打开 `windowType=agent` 的新窗口
- **验证方式**：手动测试 + E2E 测试

**TC-3.7: 点击 role-agent 入口打开 role-agent 窗口**

- **输入**：点击 RoleAgent 入口
- **预期**：打开 `windowType=role-agent` 的新窗口
- **验证方式**：手动测试 + E2E 测试

**TC-3.8: 点击 collaboration 入口打开 collaboration 窗口**

- **输入**：点击协作入口
- **预期**：打开 `windowType=collaboration` 的新窗口
- **验证方式**：手动测试 + E2E 测试

**TC-3.9: query 参数正确传递**

- **输入**：打开 solution 窗口，检查 URL
- **预期**：URL 包含 `windowType=solution&projectId=xxx&projectName=xxx&...`
- **验证方式**：手动测试

**TC-3.10: 未知 entryType 回退到 in-app overlay**

- **输入**：传入未知的 entryType
- **预期**：调用 `store.openWindow(config)` 打开 in-app overlay
- **验证方式**：单元测试

---

### 4. /window/page.tsx 类型测试

#### 测试用例

**TC-4.1: WindowType 类型从注册表派生**

- **输入**：检查 `/window/page.tsx` 的 WindowType 定义
- **预期**：`type WindowType = typeof WINDOW_TYPE_REGISTRY[number]['type']`
- **验证方式**：代码审查

**TC-4.2: 类型安全检查**

- **输入**：在 `/window/page.tsx` 中使用无效的 windowType
- **预期**：TypeScript 编译报错
- **验证方式**：TypeScript 编译检查

**TC-4.3: 新增窗体类型时类型自动更新**

- **输入**：在注册表中添加新的窗体类型
- **预期**：WindowType 类型自动包含新类型
- **验证方式**：手动测试

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

### 6. 可扩展性测试

#### 测试用例

**TC-6.1: 新增窗体类型只需修改注册表**

- **输入**：在 `WINDOW_TYPE_REGISTRY` 中添加新的窗体类型
- **预期**：
  - `AppWindowManager` 自动支持新类型
  - `/window/page.tsx` 类型自动更新
  - 无需修改其他代码
- **验证方式**：手动测试

**TC-6.2: 修改窗体参数只需修改注册表**

- **输入**：修改某个窗体类型的 `queryParams`
- **预期**：`AppWindowManager` 自动使用新的参数列表
- **验证方式**：手动测试

**TC-6.3: 修改窗体尺寸只需修改注册表**

- **输入**：修改某个窗体类型的 `defaultSize` 或 `minSize`
- **预期**：窗口尺寸自动更新
- **验证方式**：手动测试

---

## 测试执行

### 单元测试

```bash
# 运行 window-type-registry 单元测试
npm test -- window-type-registry

# 运行 AppWindowManager 单元测试
npm test -- AppWindowManager
```

### 集成测试

```bash
# TypeScript 编译检查
npx tsc --noEmit --skipLibCheck

# ESLint 检查
npm run lint
```

### 手动测试

1. 启动应用
2. 点击各种入口（skill, solution, interview, project, agent, role-agent, collaboration）
3. 验证打开的窗口类型是否正确
4. 检查 URL 中的 query 参数是否正确

### E2E 测试

```bash
# 运行 E2E 测试
npm run test:e2e
```

---

## 验收标准测试

### AC-1: 注册表完整性

- **测试用例**：TC-1.1 ~ TC-1.4
- **预期结果**：注册表包含所有窗体类型，配置正确
- **通过标准**：100% 测试用例通过

### AC-2: resolveWindowType 正确性

- **测试用例**：TC-2.1 ~ TC-2.9
- **预期结果**：所有 entryType 都能正确解析
- **通过标准**：100% 测试用例通过

### AC-3: AppWindowManager 重构成功

- **测试用例**：TC-3.1 ~ TC-3.10
- **预期结果**：AppWindowManager 使用注册表，所有窗口类型正确打开
- **通过标准**：100% 测试用例通过

### AC-4: /window/page.tsx 类型正确

- **测试用例**：TC-4.1 ~ TC-4.3
- **预期结果**：类型从注册表派生，类型安全检查通过
- **通过标准**：100% 测试用例通过

### AC-5: 类型检查通过

- **测试用例**：TC-5.1 ~ TC-5.2
- **预期结果**：TypeScript 和 ESLint 检查 0 error
- **通过标准**：0 error

### AC-6: 可扩展性验证

- **测试用例**：TC-6.1 ~ TC-6.3
- **预期结果**：新增窗体类型只需修改注册表
- **通过标准**：100% 测试用例通过

---

## 测试报告模板

```markdown
# Story OS.11 测试报告

**测试日期**：YYYY-MM-DD
**测试人员**：[姓名]
**测试环境**：[环境描述]

## 测试执行摘要

| 测试类别 | 测试用例数 | 通过数 | 失败数 | 通过率 |
|---------|----------|--------|--------|--------|
| 注册表完整性 | 4 | | | |
| resolveWindowType 函数 | 9 | | | |
| AppWindowManager 重构 | 10 | | | |
| /window/page.tsx 类型 | 3 | | | |
| 类型检查 | 2 | | | |
| 可扩展性 | 3 | | | |
| **总计** | **31** | | | |

## 失败用例详情

### [用例编号]：[用例名称]

- **输入**：
- **预期结果**：
- **实际结果**：
- **失败原因**：
- **修复建议**：

## 窗体类型验证

| 窗体类型 | entryType | 预期 windowType | 实际 windowType | 结果 |
|---------|-----------|----------------|----------------|------|
| skill | skill | skill | | |
| solution | solution | solution | | |
| interview | interview | interview | | |
| workspace | project | workspace | | |
| workspace | workspace | workspace | | |
| agent | agent | agent | | |
| role-agent | role-agent | role-agent | | |
| collaboration | collaboration | collaboration | | |

## 测试结论

- [ ] 所有验收标准测试通过
- [ ] 注册表包含所有窗体类型
- [ ] AppWindowManager 成功重构
- [ ] 可以合入主分支

## 备注

[其他需要说明的事项]
```

---

## 相关文档

- [需求规格](./requirements.md)
- [架构设计](./architecture.md)
- [Story OS.11 README](./README.md)
