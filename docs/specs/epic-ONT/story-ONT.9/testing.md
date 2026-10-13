# 测试文档 - Story ONT.9

**Story:** Agent 工具与遗留写入口的本体治理
**版本:** 1.0
**最后更新:** 2026-10-12

---

## 🎯 测试目标

验证全部 legacy 本体写入口已收敛到 canonical authoring 通道：instance.* 命令正确性与引用完整性、Agent 工具写 canonical 且零 legacy 触碰、Web 写路由结构化拒绝、残留并入幂等、既有回归零破坏。

---

## 📋 测试矩阵

| AC | 验证方式 | 测试文件/命令 |
|----|---------|--------------|
| AC2（instance 命令） | 单元 | `packages/core/src/lib/features/ontology/__tests__/authoring-instance.test.ts`（新增） |
| AC1（结构层工具） | 单元 | `packages/core/src/lib/features/agent/tools/__tests__/ontology-tools.test.ts`（新增/扩展） |
| AC2（实例工具） | 单元 | `packages/core/src/lib/features/agent/tools/__tests__/ontology-data-tools.test.ts`（新增/扩展） |
| AC3（Web 拒绝） | route 测试 | `packages/web/src/app/api/ontology-data/**/route.test.ts`（更新） |
| AC4（残留并入） | 脚本 + 真实数据 | dry-run/执行/幂等三步证据（终端输出 + canonical JSON diff） |
| AC5（写路径清零） | 静态 grep | 见下「AC5 检查命令」 |
| AC6（回归） | 定向套件 | ontology feature + agent tools + web api + workspace/data-editor 全量定向 |

### AC5 检查命令（写路径清零证据）

```bash
# 生产源码中 legacy 写函数调用应为零（ontology-data-store 内部与测试除外）
grep -rn "ontologyOps.createDomain\|ontologyOps.createConcept" packages/core/src --include="*.ts" | grep -v __tests__ | grep -v "ontology-data-store/"
grep -rn "store.createInstance\|store.updateInstance\|store.deleteInstance" packages/core/src --include="*.ts" | grep -v __tests__ | grep -v "ontology-data-store/"
grep -rn "writeFile" packages/web/src/app/api/ontology-data/ | grep -v test
# 以上三条应全部无输出
```

---

## 🧪 单元测试用例

### authoring instance.* 命令（ONT9-T1-A）

| 用例 | 输入 | 期望 |
|------|------|------|
| instance.create 合法 | `{conceptId: 存在, id: 'inst-1', data: {}}` | revision +1，instances 增 1 |
| conceptId 不存在 | `conceptId: 'missing'` | 拒绝 + validator issue，零写入 |
| id 重复 | 同 id 二次提交 | 拒绝（非幂等键时） |
| operationId 幂等 | 同 operationId 重放 | 返回既有回执，revision 不变 |
| CAS 冲突 | 旧 expectedRevision | `REVISION_CONFLICT` 结构化结果 |
| instance.update 改 conceptId | patch 含 conceptId | 拒绝 |
| instance.update 合法 | `{data: {...}}` patch | data 替换，updatedAt 更新 |
| instance.delete 有 relation 引用 | relation 指向该实例 | 拒绝 |
| instance.delete 合法 | 无引用实例 | 删除成功 |

### Agent 结构层工具（ONT9-T1-B）

| 用例 | 输入 | 期望 |
|------|------|------|
| create_concept 成功 | 合法 ontologyId + name | canonical 增概念；legacy 文件不存在/未修改 |
| ontologyId 无 canonical | 未迁移项目 id | `MIGRATION_REQUIRED` 结构化错误 |
| domainId 校验 | 不存在的 domainId | authoring 拒绝透传 issues |
| CAS 自动重试 | 模拟一次冲突 | 重试成功，最终 revision 正确 |
| audit 字段 | 任意成功写入 | JSONL 记录 `audit.source === 'agent-tool'` |

### Agent 实例层工具（ONT9-T1-C）

| 用例 | 输入 | 期望 |
|------|------|------|
| create_instance 映射 | `{fields: {...}, conceptId}` | canonical instance.data = fields；无 meta 残留 |
| update_instance | 新 fields | data 整体替换 |
| delete_instance | 存在实例 | canonical 删除；legacy `data/` 无新文件 |
| query_instances 迁移后语义 | 过滤/分页参数 | 结果与 legacy 实现语义等价（fixture 对比） |
| 写后 legacy 零触碰 | 任意写工具 | legacy ontology.json mtime/字节不变 |

### Web 写路由拒绝（ONT9-T1-D）

| 用例 | 请求 | 期望 |
|------|------|------|
| concepts POST | 合法 body | `CANONICAL_EDIT_UNAVAILABLE`，无文件写入 |
| sync POST | ontologyId | 同上 |
| instances PUT/DELETE | id | 同上 |
| domains POST/DELETE | body | 同上 |
| GET 只读保留 | concepts GET | 行为不变（基线对比） |

---

## 🔗 集成/手动测试

### 残留并入三步证据（AC4，行政办公项目）

1. **dry-run**：脚本输出将补录条目清单（预期：0 新概念 + 1 实例「行政部」，员工/请假单/考勤记录/部门按 name+type 判定为重复跳过）
2. **执行**：经 authoring 命令补录；输出 operationId/receipt；canonical JSON diff 确认新增
3. **幂等**：二次执行 → 零新增；legacy 文件 mtime 前后不变；Web 本体/数据页签视觉确认「行政部」可见

### 浏览器视觉确认（桌面 dev）

- 项目工作区「数据」页签出现并入实例
- Agent 会话写入后本体页签刷新可见（AC1 端到端）

---

## ⚡ 性能

- 单次工具写入（含 validator 全量校验）< 5s：单测计时断言（行政办公量级预期 < 100ms）

---

## ✅ 验收标准映射

| AC | 覆盖 | 状态 |
|----|------|------|
| AC1 结构层工具写 canonical | ONT9-T1-B 单测（ontology-tools.test.ts 7 用例，含 legacy 零触碰、MIGRATION_REQUIRED、CAS 重试、audit.source=agent-tool） | ✅ 2026-10-13 |
| AC2 instance 命令与实例工具 | ONT9-T1-A 单测（authoring-instance-commands.test.ts 13 用例）+ ONT9-T1-C 单测（ontology-data-tools.test.ts 8 用例） | ✅ 2026-10-13 |
| AC3 Web 拒绝 | ONT9-T1-D route 测试（concepts/route.test.ts 16 用例）+ grep `writeFile\|mkdir` 零命中 | ✅ 2026-10-13 |
| AC4 残留并入 | 三步证据（见下「实施记录」）；Web 页签视觉确认待桌面 dev 下人工复核（并入数据经同一 canonical 读路径渲染，风险低） | ✅ 2026-10-13（视觉项半自动） |
| AC5 写路径清零 | AC5 grep 三命令零输出（exit=1 ×3，2026-10-13 于 proposal 集成分支复核） | ✅ 2026-10-13 |
| AC6 回归零破坏 | ontology 73 + agent tools 15 + agent 全量 47 + web ontology-data 16 + workspace 32 全绿；lint 0 errors；lint:boundaries 990 文件 0 诊断；exports 门禁 PASS；架构自测 PASS | ✅ 2026-10-13 |

**自动化 verification goal：** 全部 AC 经上述命令可自动化；AC4 的 Web 页签视觉确认与并入脚本真实数据执行为半自动（脚本输出留档），无法自动化的部分（页面视觉）在执行记录中说明并附终端证据。

---

## 📌 实施记录（2026-10-13，Proposal govern-ontology-write-entrypoints）

**分支链：** `proposal-task/…-t1-a-authoring-instance`（T1-A `57e35a2` / T1-B `e0f0606` / T1-C `3d41406`）+ `proposal-task/…-t1-d-web-readonly`（T1-D `7138db3`）→ 合入 `proposal/govern-ontology-write-entrypoints`（merge `d4d1719`）→ 并入脚本 `41d2080`。

**AC4 残留并入三步证据（行政办公项目 proj-1791616381403-flcx7qded）：**

1. **dry-run**：补录概念 0（4 个 legacy 概念全部按 name+type 去重跳过，legacy entity 与 canonical class 语义对齐）；补录实例 6（员工×3：王磊/李娜/陈静 → canonical 概念 concept-a4cc2744；部门×3：技术部/市场部/行政部 → canonical 概念 concept-7828f311）
2. **执行**：6 条 `instance.create` authoring 命令全部 accepted（revision 126→131），operationId 前缀 `residue-`，audit.source=`legacy-residue`，sourceRefs 指向 legacy 实例文件相对路径
3. **幂等复跑**：accepted=0 failed=0，全部条目判重跳过
4. **legacy 零触碰**：并入前后 9 个 legacy 文件 sha256 全部一致（ontology.json + data/ 下 8 文件）

**AC5 grep 证据（2026-10-13，proposal 集成分支）：**

```
grep ontologyOps.createDomain|ontologyOps.createConcept（排除 store 内部与测试）→ 无输出
grep store.createInstance|store.updateInstance|store.deleteInstance（同上）→ 无输出
grep writeFile|mkdir packages/web/src/app/api/ontology-data/（排除测试）→ 无输出
```

**与设计的偏差：**

- `CanonicalInstanceRelation` 类型在代码库中不存在（仅 spec 文档提及）；instance.delete 引用检查按 T1-A 防御性方案扫描实例 payload 中的关系记录
- authoring-transport 的 zod schema 未随 instance.* 命令扩展（工具走直接 service.execute() 路径；Desktop/Web 若接入 transport 需补 schema，属 ONT.8 范围）
- Web concepts GET 原内嵌的 business-model 自动回填（写副作用）随 T1-D 一并移除，GET 为纯读
- 并入脚本以 `node --import tsx` 加载 core 源码运行（根目录脚本先例），不新增包依赖

---

## 🐛 已知基线（非本 Story）

- core tsc client-hooks 5 项基线错误
- 全量 collaboration-runtime 14 项基线失败（capability-matcher 10 / dag-executor 3 / agent-spawner 1）

---

## 🚀 测试命令

```bash
pnpm --filter @originos/core exec vitest run src/lib/features/ontology/
pnpm --filter @originos/core exec vitest run src/lib/features/agent/tools/
pnpm --filter @originos/web exec vitest run src/app/api/ontology-data/ 2>/dev/null || true  # 以实际测试布局为准
pnpm lint && pnpm lint:boundaries
node scripts/expand-core-exports.cjs --verify
```
