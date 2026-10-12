# Design: govern-ontology-write-entrypoints

## 背景约束

- canonical ontology 快照与 authoring JSONL 是唯一事实源（AGENTS.md「本体构建系统架构」）。
- `CanonicalOntologyAuthoringService.execute` 是既有唯一受控编辑入口：permissions（`ontology:author`）→ expectedRevision CAS → operationId 幂等/冲突检测 → mutateOntology → canonical validator 全量校验 → 原子写。
- Agent 工具运行在 core 进程内（assistant/role-agent/project/solution/persistent/originos/supervisor scope），可直接消费 core feature 公共 API，无需经 HTTP/IPC。

## 关键决策

### D1: instance 命令放进 canonical-ontology-authoring，而非独立 OSDK 面

`CanonicalOntology` 已含 `instances: CanonicalInstance[]`；authoring 联合类型补 `instance.*` 是最小增量，自动继承 CAS/幂等/审计/校验，不引入第二条实例写入边界。OSDK（ontology-facts-actions-api）后续消费同一 store，无需改动。

### D2: instance.update 语义 = data 整体替换 + conceptId 不可变

legacy `update_instance` 是整体替换 `fields`；canonical `PlainPatch<CanonicalInstance>` 若允许部分合并会引入语义歧义。固定为：patch 只允许 `data`（整体替换）与 `stateId`/`sourceRefs`；`conceptId`/`id`/`createdAt` 不可变。validator 在写入前全量校验兜底。

### D3: Agent 工具的 authoring 上下文解析

工具只有 `ontologyId` 入参。新增内部 helper `resolveAuthoringContext(ontologyId)`：
- 读 `CanonicalOntologyStore`（按 projectId = ontologyId 剥前缀，与 legacy 约定一致）
- 输出 `{ projectId, ontologyId, ontologyVersion, expectedRevision }`
- canonical 不存在 → 抛结构化 `MIGRATION_REQUIRED`（工具层映射为 `{ success:false, error:{ code:'MIGRATION_REQUIRED' } }`，提示走 Desktop 显式迁移）
- revision 在提交前即时读取（读-算-提交窗口内冲突由 CAS 兜底；工具层自动重试一次）

### D4: 只读工具读源的最小扰动策略

`query_ontology`/`search_ontology`/`get_concept_schema`/`list_concepts`/`get_instance`/`query_instances`：若项目有 canonical 则读 canonical（instances/concepts 直接映射既有响应形状），否则维持 legacy 只读（未迁移项目）。写路径一律 canonical，无「写 canonical 读 legacy」的混合状态。

### D5: Web 写路由统一拒绝 handler

每个写 route 的 handler 收敛为同构响应：`CANONICAL_EDIT_UNAVAILABLE` + 中文指引，HTTP 405（Method Not Allowed 语义贴合「该资源不再接受写方法」）。删除全部 `fs.writeFile` 与目录创建副作用；GET 不动。

### D6: 残留并入走 authoring 命令而非直写 store

并入复用 `CanonicalOntologyAuthoringService`（每条目一个 operationId、audit.source 指向 legacy 文件路径），保证并入动作本身可审计、可幂等重放、与其它写入方并发安全。脚本只做 diff 计算（name+type 去重）与批次编排，不直接写文件。

## 数据流（治理后写入拓扑）

```
唯一写入通道：CanonicalOntologyAuthoringService.execute
  ↑                    ↑                      ↑
Agent 工具           Web canonical route     并入脚本（一次性）
(instance.*/concept.*/domain.*)   (既有)      (显式触发)

拒绝面：Web /api/ontology-data/* 写方法 → CANONICAL_EDIT_UNAVAILABLE
只读面：legacy ontology-data-store（未迁移项目兼容读；生产写消费面清零）
```

## 测试策略

- 单测（core ontology）：instance 三命令正反例 + CAS/幂等/引用完整性
- 单测（agent tools）：工具 → authoring 集成（临时 dataRoot），断言 legacy 文件字节不变
- route 测试（web）：写方法拒绝、GET 保留
- 并入：三步证据（dry-run/执行/幂等）+ canonical diff
- 静态：AC5 grep 零命中；`lint:boundaries`；exports 门禁

## 兼容与回滚

- authoring JSONL 追加新 commandType，向后兼容
- 工具层单 commit 可 revert；revert 即恢复 legacy 写（记录在 Story 回滚风险）
- 并入幂等可重跑
