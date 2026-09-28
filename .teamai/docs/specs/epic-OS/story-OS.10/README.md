# Story OS.10: 系统工具语义说明加固（Tool Schema Description Hardening）

**Epic:** OS — Phase 0 OS 交互基础
**状态:** 📋 Planning
**优先级:** High（影响所有 Agent 与协作运行时的工具使用质量）
**估计工时:** 2-3 天
**依赖:** OS.7（Agent 托管服务）已交付

---

## 用户故事

> 作为一个使用 OriginOS 系统工具的 Agent（无论是单 Agent / Project Agent / 协作运行时下的 Worker），我希望每个工具的输入参数、返回结构、使用约束都在 schema 上以 `description` 暴露，让我能在不读代码的情况下正确填参数。最直接的痛点是：当前 10 个本体工具的 `ontologyId` / `domainId` / `conceptId` 参数全部是裸 `Type.String({ minLength: 1 })`，没有任何说明——LLM 无从得知 ontologyId 是 `ontology-{projectId}`、domainId 必须先 `query_ontology` 才能拿到，因此频繁瞎猜 ID（如协作会话 `cs-1779347431978-ma5zbz` 中 Agent 自造 `design-data-ontology`）。

---

## 背景与现状盘点

OriginOS 注册的系统工具共 **25 个**，分布在 `src/lib/integrations/pi-agent/tools/` 下。盘点工具描述完整度（2026-05-21）：

### 输入参数 description 覆盖度

| 类别 | 工具 | 工具级 description | 输入字段 description |
|------|------|-------------------|---------------------|
| **本体（10 个）** | `query_ontology` / `create_domain` / `create_concept` / `search_ontology` / `create_instance` / `get_instance` / `update_instance` / `delete_instance` / `query_instances` / `get_concept_schema` / `list_concepts` | ✅ 简略 | ❌ **0 字段有说明** |
| **文件（5 个）** | `read_file` / `write_file` / `edit_file` / `delete_file` | ✅ 详尽 | ⚠️ filePath/content/oldString/newString/replaceAll 无说明（只有 offset/limit 有） |
|  | `list_files` | ✅ | ✅ |
| **Bash/代码（3 个）** | `execute_command` / `search_code` / `glob_files` | ✅ | ✅ |
| **文档（1 个）** | `read_document` | ✅ | ✅ |
| **技能（2 个）** | `list_skills` / `Skill` | ✅ | ✅（含无参） |
| **系统（4 个）** | `get_current_time` / `get_system_info` / `calculate` / `get_help` | ✅ | ✅（含无参） |
| **URL/HITL（2 个）** | `generate_file_url` / `ask_user_question` | ✅ | ✅ |

**结论：14/25 工具存在输入字段说明缺失，集中在本体 + 文件两类，恰好是 Agent 使用最频繁的两类。**

### 输出结构 schema — 全部缺失

所有 25 个工具都使用 `successResult({...})` 直接拼 JSON 字符串返回，**没有任何工具在 ToolRegistration 上声明 `returns` schema**。LLM 只能依赖 description 一句话推断返回格式，遇到长流程（"先 create_domain 拿 domainId → 再 create_concept"）容易解析出错。

### ontologyId / domainId 的特殊语义问题

实证（`data/projects/proj-1778321075425-gmv0zt4h8/collaboration-sessions/cs-1779347431978-ma5zbz`）：

- ontologyId 实际形态固定为 `ontology-{projectId}`（见 `src/lib/features/ontology-data-store/ontology-ops.ts:51-53`），但 schema 没说
- domainId 必须先调用 `query_ontology` 或 `list_concepts` 才能拿到，但 schema 没说，工具描述也没说
- 大多数工具 domainId 必填、`list_concepts` 例外，但工具描述都没体现这个差异
- 协作会话下 Agent 自造 `design-data-ontology` 这种 ID 即此问题

---

## 范围

### A. 输入参数 description 全量补全（必须）

#### A.1 OS10-01：本体工具语义说明（最高优先）

为 `src/lib/integrations/pi-agent/tools/ontology-tools.ts` 与 `ontology-data-tools.ts` 的所有参数补 `description`。规约：

- [ ] `ontologyId` 统一说明：
  > 项目的本体 ID，形如 `ontology-{projectId}`。从 system prompt 的 projectContext 或【协作上下文】获取，**不要自己生成**。一个项目对应唯一一个 ontologyId。
- [ ] `domainId` 统一说明：
  > 领域层 ID。如不确定可用值，**先调用 `query_ontology` 或 `list_concepts` 查看可用 domains**，不要凭名字猜测。
- [ ] `conceptId` / `instanceId` 同理：
  > 概念/实例 ID。从 `list_concepts` / `query_instances` 的返回中获取，不要自己生成。
- [ ] `fields` / `filters` 增加示例：
  > 实例字段对象。结构由 concept 定义决定，可先调用 `get_concept_schema` 查询字段约束。
- [ ] `conceptType` 枚举说明：
  > 概念类型：`entity`（实体）/ `process`（流程）/ `attribute`（属性）/ `relation`（关系）。

#### A.2 OS10-02：文件工具语义说明

为 `file-tools.ts` 中 `read_file` / `write_file` / `edit_file` / `delete_file` 的核心参数补 description：

- [ ] `filePath` 统一说明：
  > 文件路径。**默认相对于工作目录**（system prompt 中告知），也支持绝对路径。**不要拼接 `data/projects/...`**——工作目录已经是项目内目录。
- [ ] `content`、`oldString`、`newString`、`replaceAll` 各自补简短说明

### B. 输出结构最小说明（必须，低成本）

#### B.1 OS10-03：在工具级 description 末尾追加返回结构说明

不引入 returns schema 的前提下，为 14 个缺说明 + 11 个有说明但不含返回结构的工具，统一在 `description` 末尾追加：

```
返回 JSON：{ success: boolean, ...业务字段 }；失败时 { success: false, error: string }。
```

具体业务字段（示例）：
- `query_ontology` → `{ success, ontologyId, ontology: { domains[], concepts[], relations[] } }`
- `create_domain` → `{ success, domain: { id, name, ... }, ontologyId, message }`
- `read_file` → `{ success, content: string, lineCount }`
- 其余按现有 successResult payload 一一列出

### C. 关键不变量在 description 中显式声明（建议）

#### C.1 OS10-04：易错点防御性提示

- [ ] `edit_file` description 明确：oldString 必须是文件内**唯一存在**的子串，否则要 replaceAll=true
- [ ] `write_file` description 明确：会**完整覆盖**原文件，需要追加请用 read_file + write_file 模式
- [ ] `delete_file` description 明确：目录会**递归删除**，慎用
- [ ] `execute_command` description 明确：默认超时 30000ms，长任务请显式传 timeout
- [ ] `Skill` description 明确：调用后会收到技能完整指令，**不要嵌套调用其他工具**直到收到指令

### D. 不在范围（保留给后续 Story）

- ❌ ontologyId / projectId 自动注入 sandbox tool wrapper（属于"治本"，需改 tool 注册机制 + 沙箱协议，单独立 Story）
- ❌ Tool returns schema 形式化（需要扩展 `ToolRegistration` 类型，跨 pi-agent 影响面大）
- ❌ 工具调用示例库（few-shot examples，归属 Knowledge.md / Patterns.md）
- ❌ I18n 描述（暂用中文）

---

## 验收标准

### 必须

1. - [ ] 25 个工具 schema 中所有非空对象参数（不含 `Type.Object({})`）均有 `description` 字段
2. - [ ] 所有本体 10 个工具的 `ontologyId` description 内容一致并明确"不要自己生成"
3. - [ ] 所有本体工具的 `domainId` description 内容一致并明确"先调 query_ontology"
4. - [ ] 25 个工具的工具级 description 末尾包含返回结构示意
5. - [ ] `npx tsc --noEmit --skipLibCheck` 0 error
6. - [ ] `npm run lint` 0 Error

### 验证

7. - [ ] 在协作会话上跑一次本体相关任务，Agent 不再出现自造 `design-data-ontology` 这类 ID
8. - [ ] 抽查 3 个工具的 description 在 LLM 调用时正确进入 prompt（通过 pi-ai 的 tool 注入路径验证）

---

## 关键文件

| 操作 | 文件路径 | 说明 |
|------|---------|------|
| MODIFY | `src/lib/integrations/pi-agent/tools/ontology-tools.ts` | 4 个工具 / ~12 个参数补 description + 工具级返回结构 |
| MODIFY | `src/lib/integrations/pi-agent/tools/ontology-data-tools.ts` | 7 个工具 / ~28 个参数补 description + 工具级返回结构 |
| MODIFY | `src/lib/integrations/pi-agent/tools/file-tools.ts` | 5 个工具 / 4 个核心参数补 description + 易错防御性提示 |
| MODIFY | `src/lib/integrations/pi-agent/tools/bash-tools.ts` | 工具级 description 末尾加返回结构 |
| MODIFY | `src/lib/integrations/pi-agent/tools/coding-tools.ts` | 同上 |
| MODIFY | `src/lib/integrations/pi-agent/tools/document-tools.ts` | 同上 |
| MODIFY | `src/lib/integrations/pi-agent/tools/skill-tools.ts` | 同上 + Skill 防御性提示 |
| MODIFY | `src/lib/integrations/pi-agent/tools/system-tools.ts` | 同上 |
| MODIFY | `src/lib/integrations/pi-agent/tools/url-tools.ts` | 同上 |
| MODIFY | `src/lib/integrations/pi-agent/tools/ask-user-question-tools.ts` | 同上 |

---

## 阶段化交付

| PR | 范围 | 价值 |
|----|------|------|
| **PR-A**（必须）| OS10-01（本体）+ OS10-02（文件） | 直接消除"自造 ontologyId / domainId"问题，立即受益于 Story 9.29 / 9.30 实证 |
| **PR-B**（建议）| OS10-03（返回结构）+ OS10-04（易错防御） | 全量收敛，长链工具调用不再误解返回结构 |

---

## 与其他 Story 的关系

- **Story 9.29 / 9.30**（Epic 9 Supervisor 协调能力修复 / Supervisor Agent 化）：本 Story 为它们提供"工具描述清晰"的前置基础。Worker Agent 在 9.30 后会越来越多通过本体工具协作，描述越早补齐越好
- **Epic C（认知系统）**：未来 Knowledge.md / Patterns.md 中沉淀的"工具使用模式"将引用本 Story 写入的 description 作为最小事实基线

---

## 非目标

- ❌ Tool returns schema 形式化（独立改造 ToolRegistration 类型）
- ❌ ontologyId 自动注入（改造沙箱工具调用协议）
- ❌ I18n / 多语言 description（暂统一用中文）
- ❌ 工具调用示例库（few-shot examples）

---

## 相关文档

- [AGENTS.md 架构规约](../../../AGENTS.md)
- [Story 9.29 — Supervisor 模式协调能力修复](../../epic-9/story-9.29/README.md)
- [Story 9.30 — Supervisor Agent 化](../../epic-9/story-9.30/README.md)
- [Supervisor 模式架构审查（2026-05-21）](../../../design/supervisor-mode-architecture-review-2026-05-21.md) — 提供"自造 ontologyId"实证
