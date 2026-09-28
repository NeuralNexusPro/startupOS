# 实施文档 - Story P2.8

**Story:** Workflow 设计与解决方案执行契约发布  
**版本:** 1.0  
**最后更新:** 2026-07-28

## 实施目标

在 solution feature 内完成设计校验、确定性契约编译、不可变发布和公共读取边界，不将 Workflow 逻辑下沉到 collaboration runtime。

## 前置条件

- [ ] P2.5 的方案版本和确认状态可用。
- [ ] P2.6 的 I/O 契约定义稳定。
- [ ] P2.7 的 Workflow/Team、Agent/Skill 拓扑可序列化。
- [ ] 本 Story testing.md 已评审。

## 实施步骤

### 1. 公共类型

- [x] 在 solution 公共类型中定义 execution contract、DesignGap 和版本引用。
- [x] 明确 design model 与 runtime contract 的字段映射。
- [x] 将 `modelingDimension` 限定为设计来源元数据；公共 runtime contract 不包含 `executionMode`。

### 2. 设计校验器

- [x] 实现 schema 和版本状态校验。
- [x] 实现拓扑连通、依赖和环检查。
- [x] 实现 Agent/Skill 引用检查并复用 ontology 公共语义校验器。
- [x] 实现 I/O 兼容、verifier/evidence、权限、预算和 HITL 检查。
- [x] 输出稳定、可定位的 `DesignGap[]`。

### 3. 契约编译器

- [x] 规范化对象键并编译冻结 topology、node contracts 和 policies。
- [x] 保证相同规范化输入产生相同 JSON 和 hash。
- [x] 禁止通过 LLM 或默认值补齐阻断字段。

### 4. 发布与存储

- [x] 仅允许 confirmed solution version 发布。
- [x] 使用原子写入保存契约。
- [x] 已发布版本拒绝覆盖。
- [x] 支持撤销状态但保持契约正文不可变。
- [x] 读取时校验 hash。

### 5. 公共读取端口

- [x] 按 solutionId/version 精确读取。
- [x] 不提供隐式 latest 替换。
- [x] 导出供 collaboration runtime 注入的公共接口。
- [x] 禁止 runtime 访问编译器或 solution UI。

### 6. 解决方案 UI

- [ ] 增加检查、发布和创建新版本操作。
- [ ] 分类展示 DesignGap 并支持定位节点。
- [ ] 发布成功后显示 contractId/version/hash。
- [ ] 明确发布后不可编辑。

### 7. 兼容迁移

- [ ] 提供 legacy manifest 显式迁移入口。
- [ ] 迁移走完整校验和发布管线。
- [ ] 缺失 verifier/I/O/policy 时返回 DesignGap。

### 8. 回归与验证 Goal

- [ ] 执行 compiler、validator、storage 和 UI 测试。
- [ ] 执行 P2.5/P2.6/P2.7 回归。
- [ ] 创建自动化测试验证 Goal，目标为“通过 Story P2.8 testing.md 中定义的测试 case”。
- [ ] 记录自动化 evidence、人工步骤和剩余风险。

## 文件级改动范围

- `packages/core/src/types/solution.ts`
- `packages/core/src/types/solution-manifest.ts`
- `packages/core/src/lib/features/solution/` 或现有 solution feature 公共边界
- `packages/core/src/lib/storage/` 的 solution contract 存储适配
- `packages/web/src/components/solution/`
- 对应 Vitest、组件测试和 Playwright 用例

不得修改 `.next`、`dist-electron`、`node_modules`，也不得在 `packages/web/src/app/` 放置契约编译业务逻辑。

## 迁移与兼容

- 旧清单继续可读，但不能直接启动新 runtime。
- 旧清单必须迁移并通过 P2.8 门控后才获得 approved contract。
- 已存在运行记录只读保留，不回填伪造契约。

## 审查要点

- 是否把 Workflow 当作 runtime mode 或脚本。
- 是否允许 draft 或无 verifier 方案发布。
- 是否存在默认 verifier passed。
- 是否允许覆盖已发布版本。
- hash 是否确定且读取时校验。
- collaboration runtime 是否反向依赖 solution UI/编译器。
- 是否在主线程执行大规模同步校验或文件写入。

## 非目标

- 不实现 Story 9.41 的单 Agent Task Runtime。
- 不实现 Story 9.42 的 CollaborationRun/WorkItem。
- 不写入 `pi-tasks` evidence。

## 变更历史

| 日期       | 变更         |
| ---------- | ------------ |
| 2026-07-28 | 初始实施方案 |
| 2026-09-22 | 合并公共契约实现并补齐原子持久化、撤销与精确读取 |

## 2026-09-14：项目语义执行规划补充

- [ ] P28-T1：前置ONT.1/3/6/7最小能力及P2.5/6/7必要接线。
- [ ] 实施访谈语义绑定、上下文编译、发布门控与UI。
- [ ] 独立Proposal、隔离Task源码工作区、类型/架构与Story验证goal。

以上尚未执行；不修改既有完成项。

完整依赖、状态所有权及验收场景见[主线规划](../../epic-ONT/project-semantic-execution-plan.md)。
