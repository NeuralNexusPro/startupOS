# 架构设计 - Story C.8

**Story:** Reflexion 失败反思
**Epic:** C（认知系统）
**最后更新:** 2026-07-17

---

## 核心设计

### 1. 失败触发点

在 `sync_turn()` 中检测失败：

```
if (!data.outcome.resolved || toolChainHasErrors(data.toolCalls)) {
  await on_failure(data);
}
```

失败标准：
- `outcome.resolved === false`
- 任何工具调用返回 `result === "error"`
- 用户纠正次数 `userCorrections > 0`

### 2. 反思生成（Self-Reflector）

失败时调用 LLM 生成反思，使用以下模板：

```markdown
你在尝试 {场景} 时遇到了问题。
工具链：{toolChain}
失败信息：{errorMessages}

请反思：
1. 哪里出错了？（分析失败原因）
2. 下次应该尝试什么？（替代方案）
3. 有什么教训？（通用原则）
```

生成内容存入 `patterns/episodic-memory/reflection-{turnId}.json`。

### 3. 情景记忆存储

```
patterns/
├── registry.json           # 现有模式注册表
├── episodic-memory/        # 新增：情景记忆目录
│   ├── reflection-{turnId}.json
│   ├── reflection-index.jsonl  # 索引（快速检索用）
│   └── compaction-log.json     # 压缩日志
```

每条反思结构：

```json
{
  "id": "reflection-{turnId}",
  "turnId": "turn-42",
  "timestamp": "2026-05-12T10:30:00Z",
  "scene": "用户需要分析 CSV 数据",
  "toolChain": ["read_file", "python_execute", "write_file"],
  "failureReason": "python_execute 超时，数据量过大",
  "reflection": {
    "whatWentWrong": "直接在内存中加载全量 CSV 导致 OOM",
    "tryNextTime": "使用流式读取或分批处理",
    "lesson": "大文件处理应优先考虑流式 API，而非全量加载"
  },
  "tags": ["large-file", "data-processing", "memory"],
  "ttl": "2026-06-12T10:30:00Z",
  "usedCount": 0
}
```

### 4. 检索与注入

修改 `prefetch()` 方法，在返回模式的同时检索相关反思：

```typescript
async prefetch(query: string): Promise<string | null> {
  const patternBlock = /* 现有逻辑 */;
  const reflectionBlock = await this.searchReflections(query);
  return [patternBlock, reflectionBlock].filter(Boolean).join('\n\n');
}
```

检索策略：
- 按标签匹配（`tags` 与查询关键词的交集）
- 按场景关键词匹配（从 `scene` 中提取关键词）
- 按失败原因关键词匹配
- 优先返回近期且 `usedCount` 低的反思（避免重复使用同一反思）

### 5. 记忆衰退（Memory Rot）

参考 Reflexion 文档中的 TTL 方案：

- 每条反思默认 TTL = 30 天
- 每次被检索并注入 prompt 时 `usedCount++`，TTL 延长 7 天
- TTL 过期后不立即删除，移入 `archived/` 子目录
- 定期压缩：当 `episodic-memory/` 下文件数 > 100 时，触发压缩：
  - 合并同类反思（相同 `tags` 交集 > 50%）
  - 删除从未被使用的过期反思
  - 生成 `compaction-report.md` 记录压缩摘要

### 6. 去重

新反思生成时检查是否已有类似反思：
- 计算与已有反思的标签重叠度（Jaccard 相似度）
- 如果相似度 > 80%，追加到已有反思的 `alternativeAttempts` 数组而非创建新文件
- 防止同一失败原因产生大量重复反思

---

## 代码变更

### 修改：`src/lib/integrations/pi-agent/cognitive/pattern-provider.ts`

1. **新增字段：**
   - `episodicMemoryDir: string` — `patterns/episodic-memory/`
   - `reflectionIndex: Map<string, ReflectionEntry>` — 内存索引

2. **新增方法：**
   - `on_failure(data: TurnCognitiveData): Promise<void>` — 失败触发
   - `generateReflection(data: TurnCognitiveData): Promise<ReflectionEntry>` — 调用 LLM 生成反思
   - `saveReflection(reflection: ReflectionEntry): Promise<void>` — 持久化
   - `searchReflections(query: string): Promise<string | null>` — 检索相关反思
   - `deduplicateAndSave(reflection: ReflectionEntry): Promise<void>` — 去重后保存
   - `compactEpisodicMemory(): Promise<void>` — 定期压缩
   - `pruneExpiredReflections(): void` — 清理过期反思

3. **修改 `sync_turn()`:**
   - 失败时调用 `on_failure()`
   - 成功后检查是否有匹配的反思，如有则更新 `usedCount`

4. **修改 `prefetch()`:**
   - 追加反思检索结果到返回值

5. **修改 `system_prompt_block()`:**
   - 追加 episodic memory 中最近/相关的反思片段

### 新增接口（types.ts）

```typescript
interface ReflectionEntry {
  id: string;
  turnId: string;
  timestamp: string;
  scene: string;
  toolChain: string[];
  failureReason: string;
  reflection: {
    whatWentWrong: string;
    tryNextTime: string;
    lesson: string;
  };
  tags: string[];
  ttl: string; // ISO date
  usedCount: number;
  alternativeAttempts?: Array<{
    timestamp: string;
    whatWentWrong: string;
    tryNextTime: string;
  }>;
}

interface ReflectionIndexEntry {
  id: string;
  tags: string[];
  scene: string;
  failureReason: string;
  timestamp: string;
  ttl: string;
  usedCount: number;
}
```
