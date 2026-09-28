# 测试文档 - Story 0.3

**Story:** 0.3 - 工具能力注册系统
**版本:** 1.1
**最后更新:** 2026-03-03

---

## 📝 变更历史

| 日期 | 版本 | 变更内容 | 变更人 |
|------|------|---------|--------|
| 2026-03-03 | 1.0 | 初始版本，完整测试计划 | qa-engineer |
| 2026-03-03 | 1.1 | 添加 AC0.3.4-0.3.6 验收标准测试用例（进度更新、取消、路径安全） | qa-engineer |
| 2026-03-04 | 1.2 | 添加 tool-execution.test.ts 实现 AC0.3.4-0.3.6 | team-lead |

---

## 🧪 测试策略

### 测试层次

| 层次 | 目的 | 工具 |
|------|------|------|
| 单元测试 | 测试工具注册表逻辑 | Vitest |
| 工具执行测试 | 测试内置工具执行 | Vitest + Mocks |
| 集成测试 | 测试工具与 Agent 集成 | Vitest |
| 异常测试 | 测试错误处理 | Vitest |

---

## 📊 测试覆盖范围

### 功能需求对应测试

| FR | 功能描述 | 测试套件 |
|----|---------|---------|
| FR0.3.1 | 工具注册接口 | 注册表单元测试 |
| FR0.3.2 | 内置工具 | 工具执行测试 |
| FR0.3.3 | 工具执行生命周期 | 进度更新测试 |

### 验收标准对应测试

| AC | 验收标准 | 测试用例 |
|----|---------|---------|
| AC0.3.1 | 工具注册 | register/unregister 测试 |
| AC0.3.2 | 工具执行 | 5个内置工具执行测试 |
| AC0.3.3 | 工具进度更新 | onUpdate 回调测试 |
| AC0.3.4 | 进度更新保证 | 耗时工具必须调用 onUpdate |
| AC0.3.5 | 工具取消 | AbortSignal cancel 测试 |
| AC0.3.6 | 路径安全 | 拒绝 `../` 路径遍历测试 |

---

## 📦 测试工具

| 工具 | 用途 | 版本 |
|------|------|------|
| Vitest | 测试框架 | 1.x |
| @sinclair/typebox | Schema 验证 | 最新 |
| vi.mock | Mock fs/promises | Vitest 内置 |

---

## 🔄 单元测试

### 测试套件 1: 工具注册表 (registry.test.ts)

#### 1.1 工具注册

**描述:** 验证工具注册功能

**测试用例:**

1. **单个工具注册**
   - Given: 空的注册表
   - When: 调用 `register(mockTool)`
   - Then: `has("test-tool")` 返回 `true`
   - And: `get("test-tool")` 返回工具对象

2. **批量工具注册**
   - Given: 空的注册表
   - When: 调用 `registerBatch([tool1, tool2, tool3])`
   - Then: 3个工具全部成功注册

3. **重复名称警告**
   - Given: 工具已注册
   - When: 再次注册同名工具
   - Then: 控制台输出警告 "工具 \"xxx\" 已存在，将被覆盖"
   - And: 工具被新版本覆盖

4. **重复名称覆盖**
   - Given: 工具已注册
   - When: 再次注册同名工具但 label 不同
   - Then: 返回的工具使用新 label

5. **不存在的工具返回 undefined**
   - Given: 注册表为空
   - When: 调用 `get("non-existent")`
   - Then: 返回 `undefined`

---

#### 1.2 工具检索

**测试用例:**

1. **获取所有工具**
   - Given: 注册了 5 个工具
   - When: 调用 `getAll()`
   - Then: 返回数组长度为 5

2. **获取启用的工具**
   - Given: 注册了 3 个启用、2 个禁用的工具
   - When: 调用 `getEnabled()`
   - Then: 只返回 3 个启用的工具

3. **按分类获取工具**
   - Given: 注册了不同分类的工具
   - When: 调用 `getByCategory("file")`
   - Then: 只返回 category 为 "file" 的工具

4. **空分类返回空数组**
   - Given: 注册表为空
   - When: 调用 `getByCategory("unknown")`
   - Then: 返回 `[]`

---

#### 1.3 工具启用/禁用

**测试用例:**

1. **禁用工具**
   - Given: 工具已注册且启用
   - When: 调用 `disable("tool-name")`
   - Then: 返回 `true`
   - And: 工具的 `enabled` 为 `false`

2. **启用工具**
   - Given: 工具已禁用
   - When: 调用 `enable("tool-name")`
   - Then: 返回 `true`
   - And: 工具的 `enabled` 为 `true`

3. **禁用不存在的工具**
   - Given: 注册表为空
   - When: 调用 `disable("non-existent")`
   - Then: 返回 `false`

4. **禁用工具不出现在启用列表**
   - Given: 工具已禁用
   - When: 调用 `getEnabled()`
   - Then: 禁用的工具不在返回列表中

---

#### 1.4 工具注销

**测试用例:**

1. **注销工具**
   - Given: 工具已注册
   - When: 调用 `unregister("tool-name")`
   - Then: `has("tool-name")` 返回 `false`

2. **注销不存在工具不报错**
   - Given: 注册表为空
   - When: 调用 `unregister("any")`
   - Then: 不抛出异常

3. **注销后从所有列表移除**
   - Given: 工具已注册
   - When: 调用 `unregister`
   - Then: 从 `getAll()`、`getEnabled()` 中移除

---

#### 1.5 工具清空

**测试用例:**

1. **清空注册表**
   - Given: 注册表有多个工具
   - When: 调用 `clear()`
   - Then: `getAll()` 返回 `[]`

2. **清空前各分类的清理**
   - Given: 各分类有工具
   - When: 调用 `clear()`
   - Then: 所有分类的 `getByCategory()` 都返回 `[]`

---

#### 1.6 AgentTool 格式转换

**测试用例:**

1. **转换启用工具**
   - Given: 有启用的工具
   - When: 调用 `toAgentTools()`
   - Then: 返回包含 `name`、`label`、`description`、`parameters`、`execute` 字段

2. **排除禁用工具**
   - Given: 有禁用的工具
   - When: 调用 `toAgentTools()`
   - Then: 禁用的工具不在返回列表中

3. **保持工具属性**
   - Given: 工具有完整定义
   - When: 转换为 AgentTool
   - Then: 所有属性正确保留

---

#### 1.7 边界情况

**测试用例:**

1. **空注册表操作**
   - Given: 空注册表
   - When: 调用任何查询方法
   - Then: 返回空数组或 undefined，不报错

2. **execute 函数为空**
   - Given: 工具的 execute 返回 null
   - When: 注册该工具
   - Then: 工具注册成功

3. **parameters 为空**
   - Given: 工具的 parameters 为空对象
   - When: 注册该工具
   - Then: 工具注册成功

---

#### 1.8 全局注册表

**测试用例:**

1. **单例模式**
   - Given: 多次调用 `getToolRegistry()`
   - When: 比较返回对象
   - Then: 所有调用返回同一实例

2. **全局注册工具**
   - Given: 调用全局 `registerTool()`
   - When: 从注册表获取
   - Then: 工具存在

3. **全局获取 AgentTool**
   - Given: 注册了多个工具
   - When: 调用 `getAgentTools()`
   - Then: 返回所有已启用工具的 AgentTool 数组

---

#### 1.9 工具分类

**测试用例:**

1. **支持 5 个分类**
   - Given: 创建 file/ontology/graph/skill/system 分类工具
   - When: 分别调用 `getByCategory()`
   - Then: 每个分类都能正确检索

---

## 🔧 工具执行测试

### 测试套件 2: 文件工具 (file-tools.test.ts)

#### 2.1 read_file 工具

**描述:** 验证读取文件工具

**测试用例:**

1. **成功读取文件**
   - Given: 文件存在于 data 目录
   - When: 调用 `read_file` 工具
   - Then: 返回 `{ success: true, content: "..." }`

2. **文件不存在**
   - Given: 文件不存在
   - When: 调用 `read_file` 工具
   - Then: 返回 `{ success: false, error: "..." }`

3. **空路径参数**
   - Given: 传入空字符串路径
   - When: 调用工具
   - Then: Schema 验证失败或返回错误

4. **读取目录路径**
   - Given: 路径指向目录
   - When: 调用工具
   - Then: 返回错误

5. **AC0.3.6: 拒绝路径遍历 ../**
   - Given: filePath 为 "../package.json"
   - When: 调用 read_file
   - Then: 返回 "路径访问被拒绝" 错误
   - And: 不允许读取 data 目录外的文件

6. AC0.3.6: 拒绝多层遍历**
   - Given: filePath 为 "../../etc/passwd"
   - When: 调用 read_file
   - Then: 返回拒绝访问错误

7. **AC0.3.6: 拒绝绝对路径**
   - Given: filePath 为 "/etc/hosts"
   - When: 调用 read_file
   - Then: 返回拒绝访问错误

---

#### 2.2 write_file 工具

**测试用例:**

1. **成功写入文件**
   - Given: 内容有效
   - When: 调用 `write_file` 工具
   - Then: 文件被创建/覆盖
   - And: 返回 `{ success: true, message: "..." }`

2. **自动创建目录**
   - Given: 目录层级不存在
   - When: 写入文件
   - Then: 所有必需目录被创建

3. **写入空内容**
   - Given: content 为空字符串
   - When: 调用工具
   - Then: 文件被创建但内容为空

4. **AC0.3.6: 拒绝路径遍历 ../**
   - Given: filePath 为 "../evil.txt"
   - When: 调用 write_file
   - Then: 返回 "路径访问被拒绝" 错误
   - And: 不允许写入 data 目录外的文件

5. **AC0.3.6: 拒绝多层遍历**
   - Given: filePath 为 "../../tmp/test.txt"
   - When: 调用 write_file
   - Then: 返回拒绝访问错误

6. **AC0.3.6: 拒绝绝对路径**
   - Given: filePath 为 "/var/test.txt"
   - When: 调用 write_file
   - Then: 返回拒绝访问错误

---

#### 2.3 list_files 工具

**测试用例:**

1. **列出目录内容**
   - Given: 目录存在并包含文件
   - When: 调用 `list_files` 工具
   - Then: 返回 `{ success: true, files: [{name, type}, ...] }`

2. **列出空目录**
   - Given: 目录为空
   - When: 调用工具
   - Then: 返回空数组

3. **目录不存在**
   - Given: 目录不存在
   - When: 调用工具
   - Then: 返回错误

4. **默认当前目录**
   - Given: 未指定 directory 参数
   - When: 调用工具
   - Then: 使用 "." 作为默认值

5. **AC0.3.6: 拒绝路径遍历 ../**
   - Given: directory 为 "../"
   - When: 调用 list_files
   - Then: 返回 "路径访问被拒绝" 错误
   - And: 不允许列出 data 目录外的内容

6. **AC0.3.6: 拒绝绝对路径**
   - Given: directory 为 "/etc"
   - When: 调用 list_files
   - Then: 返回拒绝访问错误

---

#### 2.4 delete_file 工具

**测试用例:**

1. **成功删除文件**
   - Given: 文件存在
   - When: 调用 `delete_file` 工具
   - Then: 文件被删除
   - And: 返回 `{ success: true, message: "..." }`

2. **删除不存在的文件**
   - Given: 文件不存在
   - When: 调用工具
   - Then: 返回错误

3. **删除目录**
   - Given: 路径是目录
   - When: 调用工具
   - Then: 返回错误 (需要 delete_directory 工具)

4. **AC0.3.6: 拒绝删除系统文件**
   - Given: filePath 为 "../.git/config"
   - When: 调用 delete_file
   - Then: 返回 "路径访问被拒绝" 错误
   - And: 不允许删除 data 目录外的文件

5. **AC0.3.6: 拒绝多层遍历删除**
   - Given: filePath 为 "../../tmp/important.txt"
   - When: 调用 delete_file
   - Then: 返回拒绝访问错误

6. **AC0.3.6: 拒绝绝对路径删除**
   - Given: filePath 为 "/etc/hosts"
   - When: 调用 delete_file
   - Then: 返回拒绝访问错误

---

### 测试套件 3: 本体工具 (ontology-tools.test.ts)

#### 3.1 query_ontology 工具

**测试用例:**

1. **成功查询本体**
   - Given: 本体文件存在 (`data/ontologies/{id}/ontology.json`)
   - When: 调用 `query_ontology` 工具
   - Then: 返回 `{ success: true, ontology: {...} }`

2. **本体不存在**
   - Given: 本体目录不存在
   - When: 调用工具
   - Then: 返回错误消息 "本体不存在或无法读取"

3. **ID 为空**
   - Given: 传入空 ontologyId
   - When: 调用工具
   - Then: Schema 验证失败

---

#### 3.2 create_domain 工具

**测试用例:**

1. **创建新领域**
   - Given: 有效的 domainName
   - When: 调用 `create_domain` 工具
   - Then: 领域被创建到本体文件中
   - And: 返回 `{ success: true, domainId: "..." }`

2. **可选参数 description**
   - Given: 提供 description
   - When: 调用工具
   - Then: description 被正确保存

3. **参数验证**
   - Given: domainName 为空
   - When: 调用工具
   - Then: Schema 验证失败

---

#### 3.3 create_ontology_node 工具

**测试用例:**

1. **创建实体节点**
   - Given: type 为 "entity"
   - When: 调用工具
   - Then: 节点被创建
   - And: 返回 nodeId

2. **创建类节点**
   - Given: type 为 "class"
   - When: 调用工具
   - Then: 类节点被创建

3. **创建关系节点**
   - Given: type 为 "relation"
   - When: 调用工具
   - Then: 关系节点被创建

4. **无效类型**
   - Given: type 不是 entity/class/relation
   - When: 调用工具
   - Then: Schema 验证失败

---

### 测试套件 4: 系统工具 (system-tools.test.ts)

#### 4.1 get_system_info 工具

**测试用例:**

1. **获取系统信息**
   - Given: 系统运行正常
   - When: 调用 `get_system_info` 工具
   - Then: 返回包含 platform/architecture/nodeVersion 等信息

2. **所有字段存在**
   - Given: 调用工具
   - When: 检查返回结果
   - Then: 包含必填的系统信息字段

---

## 📡 进度更新测试

### 测试套件 5: 工具生命周期

#### 5.1 onStart 回调

**测试用例:**

1. **工具开始执行触发 onStart**
   - Given: 工具支持 onStart
   - When: 工具开始执行
   - Then: onStart 回调被调用
   - And: 传递正确的 toolCallId

---

#### 5.2 onUpdate 回调

**测试用例:**

1. **进度更新触发 onUpdate**
   - Given: 工具执行中
   - When: 调用 `onUpdate({ progress: 50 })`
   - Then: onUpdate 回调被调用
   - And: 进度信息被正确传递

2. **多次进度更新**
   - Given: 工具执行中
   - When: 调用多次 onUpdate
   - Then: 每次调用都被正确传递

3. **onUpdate 可选**
   - Given: 工具执行
   - When: 不传入 onUpdate
   - Then: 工具正常执行，不报错

---

#### 5.2.1 AC0.3.4: 进度更新保证

**验收标准:** 工具执行耗时 > 1s 时，传递 onUpdate 回调应至少调用一次

**测试用例:**

4. **耗时工具必须调用 onUpdate**
   - Given: 模拟耗时 1.5s 的工具执行
   - When: 传递 onUpdate 回调
   - Then: onUpdate 至少被调用一次
   - And: 进度信息包含合理的进度值

5. **快速工具可不调用 onUpdate**
   - Given: 工具执行耗时 < 100ms
   - When: 传递 onUpdate 回调
   - Then: onUpdate 可能零次调用
   - And: 工具正常返回结果

6. **onUpdate 包含执行状态信息**
   - Given: 工具执行中
   - When: 调用 onUpdate
   - Then: 返回 `AgentToolResult` 格式
   - And: 包含 `content` 和 `details` 字段

---

#### 5.3 onComplete 回调

**测试用例:**

1. **工具完成触发 onComplete**
   - Given: 工具执行成功
   - When: 执行完成
   - Then: onComplete 回调被调用
   - And: 返回结果被传递

2. **工具失败触发 onComplete**
   - Given: 工具执行失败
   - When: 捕获异常
   - Then: onComplete 被调用
   - And: 错误信息被传递

---

#### 5.4 AbortSignal 支持 (AC0.3.5: 工具取消)

**验收标准:** 工具执行中调用 signal.abort() 时，工具应抛出 AbortError

**测试用例:**

1. **中止信号正常传递**
   - Given: 提供 AbortSignal
   - When: 调用工具 execute
   - Then: signal 被传递到 execute 函数

2. **signal.abort() 取消执行**
   - Given: 工具执行耗时操作
   - When: 调用 signal.abort()
   - Then: 工具抛出 AbortError
   - And: 执行被立即停止

3. **AbortError 正确传播**
   - Given: 工具执行中使用 signal
   - When: signal.abort() 被调用
   - When: 捕获异常
   - Then: 异常类型为 DOMException 或包含 name: 'AbortError'

4. **未中止的工具正常完成**
   - Given: 提供 AbortSignal
   - When: 不调用 abort()
   - Then: 工具正常执行并返回结果

5. **循环操作中的取消**
   - Given: 工具在循环中执行批量操作
   - When: signal abort 被触发
   - Then: 循环立即中断
   - And: 抛出 AbortError

6. **异步操作中的取消**
   - Given: 工具执行 await 异步操作
   - When: signal abort 被触发
   - Then: 异步操作被取消
   - And: 抛出 AbortError

---

## 🔒 安全测试

### 测试套件 6: 输入安全

#### 6.1 参数验证

**测试用例:**

1. **AC0.3.6: 拒绝路径遍历攻击**
   - Given: filePath 包含 "../"
   - When: 调用文件工具 (read_file / write_file / list_files / delete_file)
   - Then: 工具拒绝访问
   - And: 返回错误 "路径访问被拒绝"
   - And: 不允许跳出 data 目录

2. **多层遍历拒绝**
   - Given: filePath 包含 "../../etc/passwd"
   - When: 调用文件工具
   - Then: 拒绝访问
   - And: 返回安全错误

3. **绝对路径拒绝**
   - Given: filePath 为 "/etc/hosts"
   - When: 调用文件工具
   - Then: 拒绝访问
   - And: 返回错误

4. **正则路径清理**
   - Given: filePath 包含 "././test.txt"
   - When: 调用文件工具
   - Then: 路径被正常化
   - And: 只访问 data 目录内的文件

5. **空参数拒绝**
   - Given: 必填参数为空字符串
   - When: 调用工具
   - Then: Schema 验证失败，工具不执行

6. **恶意文件名**
   - Given: 文件名包含特殊字符或保留字
   - When: 调用工具
   - Then: 文件名被处理或返回错误

---

#### 6.2 权限控制

**测试用例:**

1. **工具启用状态检查**
   - Given: 工具被禁用
   - When: 尝试执行
   - Then: 工具不出现在 AgentTool 列表中
   - And: LLM 无法选择该工具

2. **分类过滤**
   - Given: 只允许某些分类
   - When: 获取工具列表
   - Then: 只返回允许分类的工具

---

## 🚨 异常场景测试

### 测试套件 7: 错误处理

#### 7.1 文件系统错误

**测试用例:**

1. **无权限访问**
   - Given: 文件无读取权限
   - When: 调用 read_file
   - Then: 返回错误信息

2. **磁盘空间不足**
   - Given: 写入时磁盘已满
   - When: 调用 write_file
   - Then: 返回错误

3. **无效 UTF-8 内容**
   - Given: 文件内容不是有效的 UTF-8
   - When: 调用 read_file
   - Then: 返回错误或尝试解码

---

#### 7.2 网络错误

**测试用例:**

1. **工具执行超时**
   - Given: 工具执行时间过长
   - When: 超时触发
   - Then: 返回超时错误

---

#### 7.3 并发问题

**测试用例:**

1. **同时注册相同工具**
   - Given: 两个并发 register 调用
   - When: 同时执行
   - Then: 不会导致数据不一致

2. **同时执行多个工具**
   - Given: 多个工具同时被调用
   - When: 并发执行
   - Then: 各工具独立执行，互不影响

---

## 🤖 与 Agent 集成测试

### 测试套件 8: end-to-end

#### 8.1 工具调用流程

**测试用例:**

1. **LLM 发起工具调用**
   - Given: Agent 已初始化
   - When: LLM 选择工具
   - Then: 工具被正确执行
   - And: 结果返回给 LLM

2. **工具回调状态传播**
   - Given: 工具执行中
   - When: 发送工具事件
   - Then: Hook 接收到 tool_execution_start/update/end
   - And: UI 正确显示状态

3. **工具错误传递**
   - Given: 工具执行失败
   - When: 返回错误
   - Then: LLM 收到错误信息
   - And: UI 显示错误提示

---

## 📊 覆盖率目标

| 层次 | 目标覆盖率 |
|------|-----------|
| 工具注册表逻辑 | > 90% |
| 工具执行逻辑 | > 85% |
| 错误处理逻辑 | > 80% |
| 进度更新逻辑 | > 90% |
| 安全验证 | > 80% |

**覆盖率工具:** Vitest coverage (v8)

---

## 📋 测试用例统计

| 测试套件 | 测试用例数 | 优先级 | 状态 | 对应 AC |
|---------|-----------|--------|------|---------|
| 工具注册表 | 30+ | P0 | 已实现 | AC0.3.1 |
| read_file | 7 | P0 | 待实现 | AC0.3.2, AC0.3.6 |
| write_file | 6 | P0 | 待实现 | AC0.3.2, AC0.3.6 |
| list_files | 6 | P0 | 待实现 | AC0.3.2, AC0.3.6 |
| delete_file | 6 | P0 | 待实现 | AC0.3.2, AC0.3.6 |
| query_ontology | 3 | P1 | 待实现 | AC0.3.2 |
| create_domain | 3 | P1 | 待实现 | AC0.3.2 |
| create_ontology_node | 4 | P1 | 待实现 | AC0.3.2 |
| get_system_info | 2 | P1 | 待实现 | AC0.3.2 |
| 进度更新 | 9 | P0 | 待实现 | AC0.3.3, AC0.3.4 |
| AbortSignal 取消 | 8 | P0 | 待实现 | AC0.3.5 |
| 安全测试 | 8 | P0 | 待实现 | AC0.3.6 |
| 异常场景 | 6 | P0 | 待实现 | - |
| Agent 集成 | 3 | P1 | 待实现 | - |
| **总计** | **101+** | - | - | **AC0.3.1-0.3.6** |

---

## 📝 测试执行

### 运行命令

```bash
# 运行所有 Story 0.3 测试
npm test src/lib/integrations/pi-agent/tools/

# 运行注册表测试
npm test src/lib/integrations/pi-agent/tools/__tests__/registry.test.ts

# 运行覆盖率
npm run test:coverage src/lib/integrations/pi-agent/tools/

# 监听模式
npm test src/lib/integrations/pi-agent/tools/ -- --watch
```

### 测试文件结构

```
src/lib/integrations/pi-agent/tools/__tests__/
├── registry.test.ts          ✅ 已实现 (791 行, 全部通过)
├── tool-execution.test.ts    ✅ 已实现 (AC0.3.4-0.3.6 测试)
├── file-tools.test.ts        ⏳ 待实现
├── ontology-tools.test.ts    ⏳ 待实现
└── system-tools.test.ts      ⏳ 待实现
```

---

## 📌 相关文档

- **需求文档:** [README.md](./README.md)
- **前序依赖:** [Story 0.2 Testing](../story-0.2/testing.md)
- **代码规约:** [AGENTS.md](../../../AGENTS.md)
- **pi-agent-core 工具文档:** [Tools Documentation](../../../pi-mono/packages/agent/README.md#tools)

---

## 🔔 验收检查清单

### AC0.3.1 - 工具注册
- [ ] register/unregister 测试通过
- [ ] 批量注册测试通过
- [ ] 工具转换 AgentTool 格式测试通过

### AC0.3.2 - 工具执行
- [ ] read_file 工具测试通过 (7 tests)
- [ ] write_file 工具测试通过 (6 tests)
- [ ] list_files 工具测试通过 (6 tests)
- [ ] delete_file 工具测试通过 (6 tests)
- [ ] query_ontology 工具测试通过 (3 tests)
- [ ] create_domain 工具测试通过 (3 tests)
- [ ] create_ontology_node 工具测试通过 (4 tests)
- [ ] get_system_info 工具测试通过 (2 tests)

### AC0.3.3 - 工具进度更新
- [ ] onUpdate 回调测试通过
- [ ] 进度信息正确传递

### AC0.3.4 - 进度更新保证
- [ ] 耗时工具必须调用 onUpdate (3 tests)
- [ ] 快速工具可不调用 onUpdate
- [ ] onUpdate 包含执行状态信息

### AC0.3.5 - 工具取消
- [ ] AbortSignal 正确传递 (6 tests)
- [ ] signal.abort() 抛出 AbortError
- [ ] AbortError 正确传播
- [ ] 循环操作中的取消
- [ ] 异步操作中的取消

### AC0.3.6 - 路径安全
- [ ] 拒绝路径遍历 `../` (4 tests)
- [ ] 拒绝多层遍历
- [ ] 拒绝绝对路径
- [ ] 路径正常化测试

### 覆盖率与质量
- [ ] 所有 P0 测试用例实现通过
- [ ] 覆盖率达到目标 (>80%)
- [ ] 安全测试通过
- [ ] 异常场景测试通过
- [ ] 与 Agent 集成测试通过

