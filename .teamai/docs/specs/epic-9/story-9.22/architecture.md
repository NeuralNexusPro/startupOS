# 架构设计 - Story 9.22

**Story:** 三层模型路由
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-20

---

## 技术栈

- TypeScript
- WASM（Agent Booster 沙箱）
- LLM 模型路由（Haiku/Sonnet/Opus）

---

## 数据结构

### 三层路由表

| Tier | Handler | 延迟 | 成本 | 适用 |
|------|---------|------|------|------|
| 1 | Agent Booster | <1ms | $0 | 简单转换（var→const、加类型、格式化） |
| 2 | Haiku | ~500ms | $0.0002 | 低复杂度任务（<30%） |
| 3 | Sonnet/Opus | 2-5s | $0.003-0.015 | 高复杂度任务（>30%） |

### Agent 类型默认映射

| Agent 类型 | 默认模型 | 说明 |
|-----------|---------|------|
| architect | opus | 复杂推理、架构设计 |
| coder | sonnet | 代码生成、实现 |
| formatter | haiku | 格式化、简单转换 |
| verifier | haiku | 确定性验证 |
| queen | sonnet | 协调、决策 |

### 复杂度评估因子

| 因子 | 权重 | 说明 |
|------|------|------|
| Token 量 | 20% | prompt 越长越复杂 |
| 操作类型 | 30% | 架构 > 编码 > 格式化 |
| 依赖深度 | 25% | 依赖越多越复杂 |
| 安全敏感度 | 25% | 安全相关必须高 Tier |

---

## 模块设计

### ModelRouter 核心类

```typescript
type ModelTier = 'booster' | 'haiku' | 'sonnet' | 'opus';

interface Complexity_Result {
  score: number;         // 0-100 复杂度评分
  tier: ModelTier;       // 推荐模型
  reasons: string[];     // 评分理由
}

class ModelRouter {
  constructor(config: ModelRouterConfig);

  // 根据 Agent 类型 + 任务复杂度路由到模型
  route(agentType: string, task: string, context?: unknown): ModelTier;

  // 评估任务复杂度
  evaluateComplexity(task: string, context?: unknown): Complexity_Result;

  // 检查模型可用性（过载检测）
  checkAvailability(model: ModelTier): boolean;

  // 降级路由（模型不可用时）
  fallback(currentTier: ModelTier): ModelTier;
}

interface ModelRouterConfig {
  defaultModels: Record<string, ModelTier>;  // agentType → model
  thresholds: {
    boosterMax: number;    // ≤此值用 Booster（默认 10）
    haikuMax: number;      // ≤此值用 Haiku（默认 30）
  };
  fallbackChain: Record<ModelTier, ModelTier>;  // 降级链
}
```

---

## 代码变更

### 新增文件

```
src/modules/collaboration-runtime/bridge/model-router.ts       # 模型路由器
src/modules/collaboration-runtime/bridge/complexity-evaluator.ts # 复杂度评估
```

### 设计要点

1. **三层路由**：Booster（零成本）→ Haiku（低成本）→ Sonnet/Opus（高质量）
2. **动态评估**：基于 token 量、操作类型、依赖深度、安全敏感度综合评分
3. **回退机制**：模型过载时自动降级到下一 Tier
4. **Agent 类型映射**：不同 Agent 类型有默认模型偏好
