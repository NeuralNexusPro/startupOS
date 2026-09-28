# Phase 1 选项B：渐进式实现方案

**状态:** 技术方案已确认，等待PM最终批准
**日期:** 2026-03-05
**开发方向:** Observer Mode (观察者模式)

---

## 渐进式设计理念

Phase 1 不直接实现 TASTE.md 的四维深度功能，而是建立数据收集与展示层，为未来深层实现奠定基础。

### 核心原则

1. **渐进式数据积累** - 通过简单交互收集基础数据
2. **向上兼容** - API 和数据库架构支持未来扩展
3. **观察者模式** - 系统主动记录，用户感知"透明度"
4. **避免偏离认知精髓** - 所有设计指向 TASTE.md 四维终局，只是当前简化呈现

---

## Phase 1 Observer Mode 架构

### 1. Observer Layer (观察层)

Phase 1 核心职责：**非侵入式数据收集 + 透明展示**

```
用户操作 → Observer 记录 → Context Memory DB → 简化展示 (Taste Profile页)
                ↓
        未来升级 → TASTE.md 深度分析引擎
```

### 2. 四个用户故事映射到 Progressive 路径

#### Story 1: 文化检测 → Experience Topology 启动

Phase 1 实现：
- 3-5轮自然对话检测通信风格
- 返回简化3维结果：communication_style, domain_focus, tone
- 存储到 `user_culture_profile` 表

**Progressive 路径:**
```
Phase 1 (当前): 简单3维风格检测
 ↓
未来升级: Experience Topology (感知域拓扑) 自动映射
```

#### Story 2: 行动确认 → Tension Position 数据积累

Phase 1 实现：
- 操作前确认弹窗
- 记录用户确认/拒绝到 `user_trust_settings`
- 统计 consecutive_confirms

**Progressive 路径:**
```
Phase 1 (当前): 确认记录 + 次数统计
 ↓
未来升级: Tension Position (control/trust/intervention 指标分析)
```

#### Story 3: Taste Profile → Taste Standards 展示层

Phase 1 实现：
- 两列展示："我喜欢这样的" / "我不喜欢这样的"
- 手动添加偏好 (文本格式)
- 显示统计 "系统已学习我的 X 个偏好"

**重要修正:** 这里不是"简单 like/dislike"，而是 Taste Standards 的简化展示入口
- 用户看到的是 Taste Standards 的**现象层表达**
- 背后存储结构支持未来自动化 pattern recognition

**Progressive 路径:**
```
Phase 1 (当前): 手动记录 + Observer 收集上下文
 ↓
未来升级: Taste Standards (felt "right"/"wrong" 模式识别)
```

#### Story 4: 信任学习询问 → Symbiosis Boundary 入口

Phase 1 实现：
- 连续3次确认后询问"是否跳过确认"
- 记录用户选择

**Progressive 路径:**
```
Phase 1 (当前): 简单信任设置
 ↓
未来升级: Symbiosis Boundary (delegation vs retention 边界智能管理)
```

---

## 技术实现方案

### API 端点 (Phase 1)

#### 1. 文化检测 API

```typescript
// POST /api/culture/detect
// 调用 LLM 返回用户文化检测结果
{
  communication_style: 'direct' | 'indirect' | 'mixed',
  domain_focus: 'technical' | 'business' | 'mixed',
  tone: 'formal' | 'casual' | 'mixed',
  confidence: number,  // 0-1
  summary: string,     // 一句话中文总结
}
```

#### 2. Taste Preferences API

```typescript
// GET /api/taste/preferences
// 获取用户品味偏好列表
{
  likes: Array<{
    id: string,
    context: string,
    description: string,
    created_at: string
  }>,
  dislikes: Array<...>,
  stats: {
    total_learned: number,
    auto_collected: number,
    manual_added: number
  }
}

// POST /api/taste/preferences
// 添加手动偏好记录
{
  taste_type: 'like' | 'dislike',
  context: string,
  description: string
}
```

#### 3. 信任设置 API

```typescript
// GET /api/user/trust-settings
// 获取用户信任设置和操作统计
{
  operations: Array<{
    operation_type: string,
    skip_confirmation: boolean,
    consecutive_confirms: number,
    total_confirms: number,
    last_updated_at: string
  }>
}

// POST /api/user/trust-settings
// 更新信任设置
{
  operation_type: string,
  skip_confirmation: boolean
}
```

### 数据库结构 (已存在)

`taste_memories` 表已定义完整的四维结构，Phase 1 使用简化字段：

```sql
-- Phase 1 使用字段
taste_type IN ('like', 'dislike'),  -- Taste Standards 现象层
context,                              -- Experience Topology 入口点
description,                          -- 用户表达
user_id, created_at, updated_at

-- Phase 2+ 扩展字段
judgment,                             -- Taste Rules 自动化
feedback,                             -- 效果追踪
decay_weight, reference_count         -- 记忆管理
```

---

## Phase 1 交付物

### Week 1-2 (Observer Mode Setup)

| 任务 | 交付物 | |
|------|--------|
| 文化检测 API 实现 | `src/lib/api/culture-detection.ts` |
| Taste Preferences API | `src/lib/api/taste-preferences.ts` |
| Observer 数据收集 hook | `src/lib/taste/observer.ts` |
| 数据库表初始化 | migration SQL |

### Week 3-4 (四功能集成)

| 任务 | 交付物 |
|------|--------|
| 行动确认集成 | 前端弹窗 + API 调用 |
| Taste Profile 页 | 前端两列展示 |
| 信任学习询问 | 连续检测逻辑 + 询问弹窗 |
| End-to-End 测试 | E2E 测试用例 |

---

## 成功指标 (简化版)

| 指标 | 目标 | 验收方法 |
|-----|------|---------|
| 文化检测完成率 | > 70% | 用户完成 3-5 轮对话 |
| Taste Profile 使用率 | > 50% | 用户记录至少 3 个偏好 |
| Observer 数据收集 | 100% | 所有记录操作被捕捉 |
| API 响应时间 | < 2s | 95th percentile |

---

## 升级路径 (Phase 2+)

### Phase 2: Taste Standards 自动化

- 从 Observer 数据中自动识别 felt "right"/"wrong" 模式
- 更新 `taste_memories.judgment` 字段

### Phase 3: Tension Position 可视化

- 从信任设置数据计算 control/trust/intervention 指标
- ECO 动态展示

### Phase 4: Experience Topology 拓扑图

- 从文化检测 + 偏好数据构建感知域拓扑

### Phase 5: Symbiosis Boundary 智能管理

- 自动识别可委托/必须保留的边界

---

## 风险管理

### 避免"偏离认知精髓"的措施

1. **所有决策回溯 TASTE.md** - 每个功能设计对应四维终局
2. **Observer 模式标签** - 明确告知用户当前是观察模式
3. **数据库字段完整** - 存储结构支持未来升级
4. **文档明确渐进路径** - 每个功能标注"Phase 1 实现 → 未来扩展"

---

## 下一步行动

1. **PM 批准** - 确认 Option B (渐进式) 为产品方向
2. **Developer 开始** - 实现 Week 1-2 Observer Mode API
3. **UX Designer 配合** - 设计简化的 Taste Profile 页交互
4. **QA 准备测试** - 验证 Observer 数据收集完整性

---

**创建时间:** 2026-03-05
**作者:** Developer (基于 PM 选项B提案)
