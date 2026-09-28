# Story 0.3: 工具能力注册系统 - 需求文档

**Story 编号:** 0.3
**Epic:** Epic 0 - 技术架构实施层
**状态:** ✅ Complete
**负责人:** team-lead (PM)
**最后更新:** 2026-03-04

---

## 👤 用户故事

作为开发者，
我可以注册各种工具（Tool）到核心调度层，
以便调度器可以调用这些能力来完成用户指令。

---

## 🎯 功能需求

### FR0.3.1: 工具注册接口

- 提供统一的工具注册接口
- 支持动态注册和注销工具
- 工具参数使用 Type.Schema 定义

### FR0.3.2: 内置工具

注册以下内置工具：
- `read_file` - 读取文件
- `write_file` - 写入文件
- `list_files` - 列出目录
- `create_ontology_node` - 创建本体节点
- `query_ontology` - 查询本体

### FR0.3.3: 工具执行生命周期

- 工具开始执行前通知 UI
- 工具执行中支持进度更新
- 工具完成后返回结果

---

## ✅ 验收标准

### AC0.3.1: 工具注册

**Given** 开发者有新的工具要注册
**When** 调用 registerTool()
**Then** 工具成功注册到核心调度层
**And** LLM 可以看到该工具

**测试结果:** ✅ 已定义并通过测试

### AC0.3.2: 工具执行

**Given** 工具已注册
**When** LLM 调用该工具
**Then** 工具正确执行
**And** UI 显示执行状态
**And** 结果返回给 LLM

**测试结果:** ✅ 已定义并通过测试

### AC0.3.3: 工具进度更新

**Given** 工具执行中
**When** 工具更新进度
**Then** UI 实时显示进度

**测试结果:** ✅ 已定义并通过测试

### AC0.3.4: 进度更新保证

**Given** 工具执行耗时 > 1s
**When** 传递 onUpdate 回调
**Then** onUpdate 至少被调用一次
**And** 进度信息包含合理的进度值

**测试结果:** ✅ 测试通过 (4 tests)

### AC0.3.5: 工具取消

**Given** 工具正在执行
**When** 调用 signal.abort()
**Then** 工具抛出 AbortError
**And** 执行被立即停止

**测试结果:** ✅ 测试通过 (5 tests)

### AC0.3.6: 路径安全

**Given** 文件工具被调用 (read_file / write_file / list_files / delete_file)
**When** 路径包含 `../`、多层遍历或绝对路径
**Then** 工具拒绝访问
**And** 返回 "路径访问被拒绝" 错误
**And** 不允许跳出 data 目录

**测试结果:** ✅ 测试通过 (6 tests)

---

## 📚 前置依赖

| 依赖 | 状态 |
|------|------|
| [Story 0.1 - Pi Agent 核心集成](../story-0.1/README.md) | ✅ Complete |
| [Story 0.2 - 技能加载系统](../story-0.2/README.md) | ✅ Complete |

---

## 📌 相关文档

- [架构设计](./architecture.md) - 技术实现要点与代码模式
- [测试计划](./testing.md) - 完整测试用例与验收检查清单
- [pi-agent-core Tools Documentation](../../../pi-mono/packages/agent/README.md#tools)
