# Pattern 机制重构：基于 Memory Core 的上层应用

**状态：** 📋 Design
**创建日期：** 2026-05-27
**作者：** OriginOS 团队
**关联：** Epic C（认知系统）/ Epic M（Memory Core）/ Story C.10

---

## 1. 背景与问题

### 1.1 现状盘点

当前 Pattern 相关代码分散在两个模块：

| 模块 | 文件 | 职责 |
|------|------|------|
| Cognitive 旧版 | `src/lib/integrations/pi-agent/cognitive/pattern-provider.ts` | 自维护 `patterns/registry.json` + `patterns/episodic-memory/` 文件，统计型 + Reflexion |
| Memory Core 新版 | `src/modules/memory-core/session/enhanced-pattern-provider.ts` | 通过 `ArchivalMemory` 语义索引 pattern / reflection |

`PersistentAgentManager` 与 `agent-worker.mts` 同时注册了**新旧两个 PatternProvider**，但：

- 旧 `PatternProvider` 仍主导 `Patterns.md` 输出（`updatePatternsMd()`）
- 旧 Provider 的 `on_session_end()` 依赖 `practice/turns/turn-{N}.json`
- 协作运行时（`agent-worker.mts:1531-1545`）**没有注册 `PracticeLogger`**，导致 turn 文件永远为空
- `EnhancedPatternProvider` 写入 archival，但**不会回写 `Patterns.md`**，Layer 2 注入仍然走旧文件

线上验证（`data/projects/proj-1778321075425-gmv0zt4h8/agents/*`）：
- `practice/turns/` 全部为空
- `Patterns.md` 全部为空
- `patterns/registry.json` 仅有空骨架

### 1.2 设计层面的根因

1. **职责错配**：`PatternProvider` 同时承担"模式提炼业务逻辑"和"记忆存储"，违反 Memory Core 提出的"上层应用 / 底层记忆"分层。
2. **存储双写不收敛**：`registry.json` / `episodic-memory/` 与 `archival/` 并存，迁移函数 `migratePatternsToArchival` 只跑一次，新数据继续双写。
3. **正负信号缺失**：
   - `TurnCognitiveData.outcome.userCorrections` 字段已定义但**从未被填充**（`agent-manager.ts:343`、`persistent-agent.ts:353` 都没传）。
   - 当前 positive / negative 划分纯粹基于 `successRate < 50% || avgLength > 5`，与用户语义反馈完全脱钩。
4. **实时通道阈值过窄**：`sync_turn` 只在 `currentChain.length <= 3` 时记录新 pattern，多步工具链永远进不去。

---

## 2. 设计原则

> **Pattern 是上层应用，由 Memory Core 提供底层记忆能力。**

| 层 | 职责 | 模块 |
|----|------|------|
| **上层应用：Pattern** | 业务逻辑：从 turn 数据提取 positive / negative 信号；渲染 Patterns.md；从用户消息识别纠正 | `cognitive/pattern-*` |
| **底层能力：Memory Core** | 存储：Archival 写入 + 向量检索；Recall 历史；Block 渲染 | `modules/memory-core` |

**关键设计取舍：**

1. **存储统一到 Archival**：删除 `registry.json` 与 `patterns/episodic-memory/` 的写入路径（仅保留向后读取以做一次性迁移）。Pattern 与 Reflection 都成为 Archival Entry，按 tag 区分。
2. **Patterns.md 由 query archival 渲染**：不再自维护 registry。`Patterns.md` 退化为"快照视图"，可重建可丢弃。
3. **PracticeLogger 必须随 CognitiveManager 一起注册**：协作运行时漏注册的链路修复。
4. **正负信号源自用户语义**：在 turn 收集阶段对用户消息做纠正检测，落入 `outcome.userCorrections` 与新增 `outcome.correctionSignals[]`，作为 positive/negative 的主依据。

---

## 3. 架构

### 3.1 模块划分

```
┌────────────────────────────────────────────────────────────┐
│  上层应用：cognitive/pattern-*                                │
│                                                              │
│  ┌─────────────────────────┐  ┌──────────────────────────┐ │
│  │ PatternExtractor        │  │ PatternRenderer          │ │
│  │ - 从 turn 提取信号       │  │ - 查 archival 生成        │ │
│  │ - positive / negative   │  │   Patterns.md            │ │
│  │ - 抽取 user correction  │  │ - Positive / Negative 分组│ │
│  └─────────────────────────┘  └──────────────────────────┘ │
│              │                            ▲                 │
│              │ ingest                      │ search          │
│              ▼                            │                 │
└─────────────────────┬──────────────────────────────────────┘
                      │
┌─────────────────────┴──────────────────────────────────────┐
│  底层能力：modules/memory-core                                │
│                                                              │
│  ArchivalMemory (HNSW + ONNX embedding)                     │
│   - insert(text, tags)                                      │
│   - search(query, { tags, limit })                          │
│                                                              │
│  Recall / Core 不在本设计范围                                 │
└────────────────────────────────────────────────────────────┘
```

新模块（替换旧 `pattern-provider.ts` + `enhanced-pattern-provider.ts`）：

```
src/lib/integrations/pi-agent/cognitive/pattern/
├── index.ts                # PatternProvider 对外导出
├── extractor.ts            # 信号提取：从 TurnCognitiveData 抽出 positive / negative
├── correction-detector.ts  # 用户纠正检测（关键词 + 启发式）
├── renderer.ts             # 渲染 Patterns.md（查 archival 重建）
└── types.ts                # PatternEntry / NegativeEntry / CorrectionSignal
```

旧 `pattern-provider.ts` 迁移完成后删除；`enhanced-pattern-provider.ts` 合并进 `extractor.ts`。

### 3.2 数据流

#### 每轮（on_turn_end，轻量）

```
turn_end 事件
  ↓
PracticeLogger.sync_turn()        ← 必须始终注册
  └─ 落盘 practice/turns/turn-{N}.json

PatternProvider.sync_turn(data)
  ├─ correction-detector 分析 data.userMessage / 上轮 assistant 输出
  │   └─ 写回 outcome.userCorrections / correctionSignals
  ├─ extractor.extract(data)
  │   ├─ 若 outcome.resolved && userCorrections === 0 → POSITIVE
  │   ├─ 若 userCorrections > 0 || !resolved          → NEGATIVE
  │   └─ 否则 SKIP
  └─ archival.insert(text, tags)
      tags: ['pattern', 'positive' | 'negative', ...toolChain, ...sceneTags]
```

#### 周期性（on_session_end / 每 N 轮，重量）

```
on_session_end
  ↓
PatternProvider.on_session_end()
  ├─ 读取 practice/turns/turn-{N}.json（最近未分析）
  ├─ 聚合统计 → 更新 archival 已存条目的 metadata（avg/successRate）
  └─ renderer.regenerate() → 写 Patterns.md
       ├─ Positive 区：archival.search('', { tags: ['pattern','positive'] })
       └─ Negative 区：archival.search('', { tags: ['pattern','negative'] })
                       + Reflection（Reflexion 反思）
```

#### 注入（system_prompt_block）

```
PatternProvider.system_prompt_block()
  └─ 读取 Patterns.md 全文（Frozen Snapshot）
     注入 Layer 2: StateMemory
```

#### 检索（prefetch）

```
PatternProvider.prefetch(query)
  └─ archival.search(query, { tags: ['pattern'], limit: 5 })
     按 score 排序，positive 优先
```

---

## 4. 信号定义

### 4.1 用户纠正检测（CorrectionDetector）

输入：当前 turn 的 `userMessage` + 上一轮 `assistantMessage`。

**Heuristic v1（中文 + 英文）：**

| 类别 | 关键词 / 模式 | 强度 |
|------|---------------|------|
| 直接否定 | 不对 / 不是 / 错了 / 搞错 / wrong / no, that's | 强 |
| 命令重做 | 重新 / 重做 / 再来 / 换一种 / redo / try again | 强 |
| 偏好纠正 | 不要 X / 别 X / don't / stop | 中 |
| 指出问题 | 应该 / 应该是 / 这里 X 有问题 / 漏了 / should be | 中 |
| 反问 | 为什么 X / 这是什么 / why did you | 弱 |

输出：

```typescript
interface CorrectionSignal {
  strength: 'strong' | 'medium' | 'weak';
  matched: string;        // 命中的关键词
  excerpt: string;        // 用户消息片段（前 120 字符）
}
```

`outcome.userCorrections = correctionSignals.length`。

> v1 用规则，预留 LLM 评估钩子（v2）：用 Haiku 对 user-assistant 对做二分类。

### 4.2 Positive / Negative 判定

```typescript
function classify(data: TurnCognitiveData): 'positive' | 'negative' | 'skip' {
  const corrections = data.outcome.userCorrections ?? 0;
  if (!data.outcome.resolved || corrections > 0) return 'negative';
  if (data.toolCalls.length === 0) return 'skip';   // 纯对话不入 pattern
  if (data.toolCalls.some(t => !t.success)) return 'negative';
  return 'positive';
}
```

不再使用 `length <= 3` 这种硬阈值。

### 4.3 Pattern Entry 形态

写入 archival 的文本（同时作为 BM25 / 向量 embedding 来源）：

**Positive：**

```
[POSITIVE] 场景: {userMessage 前 120 字}
路径: tool_a → tool_b → tool_c
关键发现: {首个 toolCall.result 摘要 80 字}
```

**Negative：**

```
[NEGATIVE] 场景: {userMessage 前 120 字}
路径: tool_a → tool_b
失败原因: {error 摘要 / unresolved}
用户反馈: "{correctionSignal.excerpt}"
教训: 避免在类似场景使用该路径
```

Tags：

- `pattern` (常驻)
- `positive` / `negative` (二分)
- `correction-strong` / `correction-medium`（仅 negative）
- 工具名 × n
- 场景关键词 × ≤ 5（`extractSceneTags` 已存在）

---

## 5. Patterns.md 渲染规约

```markdown
# Experience Patterns

## Positive — 最佳实践

### 场景: {scene}
**推荐路径:** `tool_a → tool_b`
**样本数:** 3
**关键发现:** {result summary}

## Negative — 用户指出问题的地方

### 场景: {scene}
**避免路径:** `tool_a → tool_b`
**用户反馈:** "{correction excerpt}"
**教训:** {lesson}

## Reflection — Reflexion 失败反思

### 场景: ...
**失败原因:** ...
**下次尝试:** ...
```

每次 `on_session_end` 重建。Top-K（默认 10 / 区）按 score（archival 返回）+ recency 排序。

---

## 6. 兼容性 / 迁移

| 现存 | 处理 |
|------|------|
| `patterns/registry.json` | **只读**，启动时一次性 ingest 到 archival（已有 `migratePatternsToArchival`），随后不再写入；保留文件以便回滚 |
| `patterns/episodic-memory/*.json` | 同上，已有 `ingestReflectionToArchival` |
| 旧 `Patterns.md` | 启动后被新 renderer 覆盖 |
| `outcome.userCorrections` | 现有调用者（`persistent-agent.ts:353`、`agent-manager.ts:343`）补传字段 |

迁移开关：`COGNITIVE_PATTERN_MODE=legacy|unified`（默认 unified，旧逻辑保留 1 个版本周期后删除）。

---

## 7. 落地切片

| 切片 | 内容 | 验收 |
|------|------|------|
| 1. PracticeLogger 接线 | 在 `agent-worker.mts` 注册 `PracticeLogger` | turn-{N}.json 在协作场景下落盘 |
| 2. CorrectionDetector | 新建模块 + 单测；turn 收集时填 `userCorrections` | turn 数据中 `userCorrections > 0` 出现在已知纠正样本 |
| 3. 新 PatternProvider | 创建 `cognitive/pattern/`；ingest 走 archival；老 provider 标记 deprecated | `archival.search({tags:['pattern','positive']})` 有数据 |
| 4. Renderer | `Patterns.md` 由 archival 重建；旧 updatePatternsMd 删除 | `Patterns.md` Positive / Negative 区与 archival 一致 |
| 5. 清理 | 删除 `pattern-provider.ts`（旧）+ `enhanced-pattern-provider.ts` 合并 | 单一 `PatternProvider` 出口 |

---

## 8. 验证

- 手工：在协作 session 里制造一次明显纠正（"不对，不是这样"），观察：
  - turn JSON 中 `userCorrections >= 1`
  - archival 出现 `[NEGATIVE]` 条目
  - 下一次 session_end 后 `Patterns.md` 的 Negative 区出现该条目
- 单测覆盖：
  - CorrectionDetector 中英文关键词
  - extractor 三种 outcome 分类
  - Renderer 在空数据 / 仅 positive / 仅 negative 三种状态

---

## 9. 不在本范围

- LLM 驱动的纠正分类（v2 再做）
- 跨 session pattern 评分衰减（与 Story M.x 重叠，单独立项）
- Pattern 推荐工具调用阻断（属于 Action layer）

---

**关联文档：**
- `docs/specs/epic-C/README.md` — Epic C 总览
- `docs/specs/epic-C/story-C.10/README.md` — 落地 Story
- `docs/specs/epic-M/story-M.7/README.md` — Pattern 质量提升（前置）
- `docs/design/memory-core.md` — Memory Core 总体设计
