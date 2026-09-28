# Phase 1 简化需求文档

## 目标

在 4 周内完成最小可行的 OriginOS TASTE 系统，让用户能够：
1. 系统理解用户的基本沟通风格
2. Agent 能够格式化代码
3. 用户记录基本的品味偏好

---

## 功能 1: 文化检测 (Week 1-2)

### 用户故事
> 作为用户，我希望系统能理解我的基本沟通风格，这样 Agent 的回复更符合我的预期。

### 交互流程
1. 用户与 Agent 进行 3-5 轮自然对话
2. Agent 分析对话内容（调用 LLM API）
3. 返回基本风格判断：
   - 沟通风格：直接/间接
   - 专注：技术/业务
   - 语气：正式/随意

### 技术要求
- 输入：对话历史（最多 10 条消息）
- 输出：JSON 简单结构（3 个字段）
- 调用：现有 LLM API

---

## 功能 2: 代码格式化 (Week 3-4)

### 用户故事
> 作为开发者，我希望 Agent 能够格式化代码，这样我可以节省时间。

### 交互流程
1. 用户输入："格式化 `src/app.ts`"
2. Agent 调用 Prettier 格式化文件
3. 展示 diff
4. 用户确认/拒绝
5. 记录用户判断（如果接受，标记这个偏好）

### 技术要求
- MCP 工具：`format_code`
- 集成：现有 Prettier/ESLint
- 回滚：Git 原生支持
- 安全：仅代码文件

---

## 功能 3: Taste Profile (Week 1-4)

### 用户故事
> 作为用户，我希望记录我的基本品味偏好，这样 Agent 能更好地理解我。

### 交互流程
1. 用户访问 "我的品味" 页面
2. 用户添加/编辑品味偏好（3-5 个）
3. 支持格式："在 XX 情况下，我喜欢 XX"
4. 支持 "对/不对" 标记（在 Agent 操作后）

### 简化版界面
```
我的品味
━━━━━━━━━━━━━━━━━━━━━━

1. 代码格式化
   在写新代码时，我喜欢先写核心逻辑，再做格式化。

2. 对齐方式
   我喜欢左对齐，不要太长的缩进。

[ + 添加品味偏好 ]
```

### 技术数据结构
```
interface TastePreference {
  id: string;
  context: string;      // 情境描述
  preference: string;   // 偏好描述
  createdAt: string;
  lastUsed: string;
}
```

---

## 数据库设计（简化）

### PostgreSQL 表

```sql
CREATE TABLE taste_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  context JSONB NOT NULL,     -- 情境描述
  judgment JSONB NOT NULL,    -- 判断/行动
  feedback JSONB NOT NULL,    -- 反馈
  created_at TIMESTAMP DEFAULT NOW(),
  user_id UUID NOT NULL
);

CREATE INDEX idx_taste_context ON taste_memories USING GIN(context);
```

---

## API 设计（简化）

### 文化检测 API

```
POST /api/culture/detect
请求: { messages: [{role: "user", content: "..."}] }
响应: {
  style: "direct" | "indirect",
  focus: "technical" | "business",
  tone: "formal" | "casual"
}
```

### TASTE 读写 API

```
GET  /api/taste/preferences    -- 获取用户品味偏好
POST /api/taste/preferences     -- 添加品味偏好
POST /api/taste/record          -- 记录一次判断（接受/拒绝操作后调用）
```

---

## 交付时间表

| 周 | 交付物 |
|----|--------|
| Week 1 | 文化检测需求 + 数据库表结构 |
| Week 2 | 文化检测 API + Taste Profile 基础 UI |
| Week 3 | 代码格式化 MCP 工具 |
| Week 4 | 完整集成 + 内测 |

---

## 成功标准

1. 文化检测能在 5 秒内返回
2. 代码格式化成功执行 90% 以上
3. Taste Profile 能正常记录和读取
4. 用户能标记 "对/不对"（用于未来学习）

---

砍掉的复杂度：
- ❌ 完整的三层归属权
- ❌ 降级机制
- ❌ 自动提升算法
- ❌ 完整的 ECO 可视化

保留的核心功能：
- ✅ 文化检测
- ✅ 代码格式化
- ✅ 基础 Taste Profile
