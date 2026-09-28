# Bug Analysis Report: Epic T MVP 质量评估

## 1. Problem Description

**上下文**: PM 提议将 Epic T 的 T.7-T.10 延后，只实现 T.1-T.6 作为 MVP。

**核心评估需求**:
- T.1-T.6 的验收标准如何定义？特别是 T.1（隐性信号识别）
- 信号准确率 >85% 如何测量？
- 延后的功能是否会导致集成问题？
- MVP 的质量门槛是什么？

**影响范围**: Speech-Cognition 层的核心实现，后续功能的稳定性基础

---

## 2. Investigation Process

### 2.1 技术基础设施分析

**已确认的测试基础设施**:
- **测试框架**: Vitest with jsdom
- **覆盖率工具**: @vitest/coverage-v8
- **目标覆盖率**: >80%
- **超时设置**: 30 秒（API 调用）
- **现有测试模式**:
  - Session Store 测试（完整 CRUD + 边界条件）
  - Error Handler 测试
  - Message 测试
  - Intent Understanding 测试

**现有测试质量特征**:
- 清晰的测试数据结构（mockProjectContext, mockMessages）
- 完善的 beforeEach 清理隔离
- 静态方法测试覆盖
- 集成测试部分覆盖

### 2.2 Epic T 功能依赖分析

**T.1-T.6 MVP 功能链**:
```
T.1 (SignalReader)
  ↓
T.2 (Observation Queue)
  ↓
T.3 (Governance Validation)
  ↓
T.4 (Pattern Distillation)
  ↓
T.5 (TASTE Persistence)
  ↓
T.6 (SOUL Identity)
```

**延后的功能**:
- T.7: SOUL Auto-Calibration (Medium)
- T.8: Trust Expansion (Medium)
- T.9: ECO Controller (Medium)
- T.10: Meta Feedback (Low)

**依赖关系审计**:
- T.1-T.6 内部依赖链完整 ✅
- T.7 依赖 T.6 ✅
- T.8 依赖 T.7 ⚠️
- T.9 独立于 T.6-T.10 ✅
- T.10 依赖 T.5 ✅

---

## 3. Root Cause Analysis

### 3.1 主要风险识别

**风险 1: T.1 隐性信号识别的测试可测量性问题**

- **问题**: "隐性"信号的定义缺乏可测量的基准
- **现状**: Epic 文档中的验收标准是"词汇选择信号能区分同义词的细微差别"，但未定义如何量化"细微差别"
- **影响**: 85% 准确率无法测量
- **根本原因**: 品味是主观的，缺乏客观 ground truth

**风险 2: 交叉 Session 模式识别的数据依赖**

- **问题**: T.1 要求"跨 session 重复模式识别准确率 >85%"
- **现状**: 需要模拟跨 session 的历史数据，现有没有这样的测试数据集
- **影响**: 测试可能变成 mock-only，无法验证真实场景

**风险 3: T.10 延后影响元反馈数据收集**

- **问题**: Meta Feedback 是获取品味理解是否准确的直接反馈
- **现状**: 延后 T.10 意味着 MVP 阶段无法获取用户对品味理解的显式验证
- **影响**: 无法及时验证 T.1-T.6 的有效性，可能导致错误累积

**风险 4: ARIA 三阶段的边界测试不足**

- **问题**: T.2 (Infer) → T.3 (Governance) → T.4 (Persist) 的状态转换复杂
- **现状**: 现有测试框架缺少针对状态机的测试模式
- **影响**: 可能遗漏 Inference 未被 Governance 拦截的错误分类

---

### 3.2 集成风险评估

**延后功能的集成风险矩阵**:

| 延后功能 | 集成风险 | 严重性 | 缓解措施 |
|---------|---------|-------|---------|
| T.7 (SOUL Auto-Calibration) | 低 | Low | T.6 的 SOUL 是静态初始版本，后续更新向后兼容 |
| T.8 (Trust Expansion) | 中 | Medium | T.8 依赖 T.7 系统中的 Trust Model，需要定义 stub |
| T.9 (ECO Controller) | 低 | Low | ECO 独立于 SOUL 演化，只是消费 TASTE 模式 |
| T.10 (Meta Feedback) | 高 | High | 无法收集验证数据，建议降级为手动测试 |

**高风险项分析**:
- **T.10 延后**是最大的质量风险，因为元反馈是验证品味理解准确性的金标准
- **T.8 的 stub 定义**需要在 MVP 阶段完成，否则后续集成会有数据结构不一致问题

---

## 4. Solution Design

### 4.1 T.1-T.6 验收标准重新定义

#### Story T.1: SignalReader 验收标准（可测量版本）

**问题**: 原始验收标准不可测量

**解决方案**: 引入标准测试用例集

```typescript
// 文件: /Users/archersado/workspace/originos/src/lib/taste/__tests__/signal-reader-fixtures.ts

export const WORD_CHOICE_TEST_CASES = {
  // 测试用例 1: 风格偏好识别
  "style_preference_cautious": {
    input: {
      message: "这个方案有点意思，我再想想",
      alternatives: ["这个方案可行", "这个方案不错", "这个方案很棒"]
    },
    expected: {
      chosen: "有点意思",
      nuance: {
        cautiousness: 0.8,    // > 0.7
        decisiveness: 0.2,    // < 0.3
        conservativeness: 0.7 // > 0.5
      },
      sentiment_direction: "hesitant"
    }
  },

  // 测试用例 2: 决断风格识别
  "style_preference_decisive": {
    input: {
      message: "这个方案可行，我们这么办",
      alternatives: ["这个方案有点意思", "这个方案还不错", "这个方案考虑一下"]
    },
    expected: {
      chosen: "可行",
      nuance: {
        cautiousness: 0.2,    // < 0.3
        decisiveness: 0.9,    // > 0.8
        conservativeness: 0.4 // < 0.5
      },
      sentiment_direction: "positive"
    }
  }
};

export const RESISTANCE_TEST_CASES = {
  // 测试用例 1: 消化中（非阻力）
  "digesting_silence_probing": {
    input: {
      resistance_type: "silence",
      followed_by: "continue_probing",
      context: "用户在沉默后追问具体细节"
    },
    expected: {
      classification: "digesting",
      confidence: 0.7 // >= 阈值
    }
  },

  // 测试用例 2: 品味边界（阻力）
  "boundary_silence_switch": {
    input: {
      resistance_type: "silence",
      followed_by: "new_topic",
      context: "用户在沉默后突然切换话题"
    },
    expected: {
      classification: "boundary_reached",
      confidence: 0.8 // >= 阈值
    }
  }
};

export const REPETITION_TEST_CASES = {
  // 测试用例 1: 跨 session 模式识别（正例）
  "cross_session_pattern_positive": {
    input: {
      currentPattern: {
        scenario: "选择设计方案时的沉默",
        pattern: "沉默 + 切换话题"
      },
      history: [
        // session 1-4: 同类沉默（噪声）
        { session_id: "s1", pattern_type: "silence_switch", count: 1 },
        { session_id: "s2", pattern_type: "silence_switch", count: 1 },
        { session_id: "s3", pattern_type: "silence_switch", count: 1 },
        { session_id: "s4", pattern_type: "silence_switch", count: 1 },
        // session 5: 达到门槛（品味）
        { session_id: "s5", pattern_type: "silence_switch", count: 1 }
      ]
    },
    expected: {
      is_taste: true,
      stability_score: 1.0,  // 1 = 达到门槛
      cross_session: true
    }
  },

  // 测试用例 2: 同 session 内的重复（噪声）
  "same_session_repetition_negative": {
    input: {
      currentPattern: {
        scenario: "同一会话内的沉默",
        pattern: "沉默 + 继续"
      },
      history: [
        // 同一 session 内的重复
        { session_id: "s1", pattern_type: "silence_continue", count: 5 }
      ]
    },
    expected: {
      is_taste: false,
      stability_score: 0.2,  // < 门槛
      cross_session: false
    }
  }
};
```

**可测量的验收标准**:
```typescript
// T.1 验收标准（可测量）

function verifySignalReader(reader: SignalReader): TestResult {
  const wordChoiceResults = WORD_CHOICE_TEST_CASES.map(([name, testCase]) => {
    const result = reader.readWordChoice(testCase.input);
    return {
      testName: `word_choice_${name}`,
      passed: isNuanceMatch(result.nuance, testCase.expected.nuance),
      actual: result
    };
  });

  const resistanceResults = RESISTANCE_TEST_CASES.map(([name, testCase]) => {
    const result = reader.classifyResistance(testCase.input);
    return {
      testName: `resistance_${name}`,
      passed: result.classification === testCase.expected.classification,
      actual: result
    };
  });

  const repetitionResults = REPETITION_TEST_CASES.map(([name, testCase]) => {
    const result = reader.recognizeCrossSessionPattern(
      testCase.input.currentPattern,
      testCase.input.history
    );
    return {
      testName: `repetition_${name}`,
      passed: result.is_taste === testCase.expected.is_taste,
      actual: result
    };
  });

  const allResults = [
    ...wordChoiceResults,
    ...resistanceResults,
    ...repetitionResults
  ];

  const passCount = allResults.filter(r => r.passed).length;
  const accuracy = passCount / allResults.length;

  return {
    passed: accuracy >= 0.85,
    accuracy,
    details: allResults
  };
}
```

#### Story T.2-T.6 验收标准

**T.2: Observation Queue**
```typescript
// 新增验收标准（可测量）
{
  "验收标准": [
    "添加观察 O(1) - 验证: 测试添加 1000 个观察的时间 < 10ms",
    "查询模式 O(n) - 验证: 测试查询模式的时间与观察数量成线性关系",
    "时间衰减 - 验证: 24 小时后观察的 decay_factor <= 0.5",
    "不触发持久化 - 验证: 即使 N 次同类观察，也不会自动蒸馏"
  ]
}
```

**T.3: Governance Validation**
```typescript
// 新增验收标准（可测量）
{
  "验收标准": [
    "单次观察不触发蒸馏 - 验证: 1 个观察, shouldDistill() = false",
    "门槛触发 - 验证: 5 个跨 session 观察, shouldDistill() = true",
    "人类纠正权重 - 验证: 1 个显式纠正 > 3 个隐性观察",
    "Ontology 约束 - 验证: 违反 Ontology 的候选模式被打回"
  ]
}
```

**T.4: Pattern Distillation**
```typescript
// 新增验收标准（可测量)
{
  "验收标准": [
    "模式提取 - 验证: 从 10 个观察中提取的模式覆盖 90% 的共同特征",
    "例外保留 - 验证: 1 个反例被正确标记为 exception",
    "激活强度 - 验证: 被覆盖 1 次的模式 strength = 0.9 (1 - 0.1)",
    "价值过滤 - 验证: 低价值模式（低激活 + 低引用）被过滤"
  ]
}
```

**T.5: TASTE Persistence**
```typescript
// 新增验收标准（可测量）
{
  "验收标准": [
    "持久化完整性 - 验证: 保存/加载后数据 100% 一致",
    "引用链 - 验证: Pattern 引用的前例链可追溯",
    "索引效率 - 验证: 按类型索引查询 < 5ms",
    "相似模式推荐 - 验证: 实际测试准确率 >= 80%"
  ]
}
```

**T.6: SOUL Identity**
```typescript
// 新增验收标准（可测量）
{
  "验收标准": [
    "SOUL 初始化 - 验证: 基于 Interview 数据生成完整的 SOUL",
    "一致性 - 验证: 所有交互中读取的 SOUL.id 相同",
    "边界验证 - 验证: 违反 Boundaries 的行为被拦阻"
  ]
}
```

---

### 4.2 信号准确率 >85% 测量方案

**问题**: 如何测量一个"隐性"信号识别的准确率？

**解决方案**: 基准测试集 + 人工标注 + A/B 对照

#### 4.2.1 基准测试集设计

```typescript
// 文件: /Users/archersado/workspace/originos/src/lib/taste/__tests__/benchmark-dataset.ts

export const TASTE_SIGNAL_BENCHMARK = {
  version: "1.0",
  name: "TASTE Signal Recognition Benchmark",
  total_cases: 100,  // 目标: 100 个标准测试用例

  word_choice: {
    cases: [
      // 正例: 正确识别风格
      {
        id: "WC-001",
        category: "cautious_style",
        input: "这个方案有点意思，我再想想",
        alternatives: ["这个方案可行", "这个方案很不错"],
        ground_truth: {
          sentiment: "hesitant",
          nuance: {
            cautiousness: 0.8,
            decisiveness: 0.2,
            conservativeness: 0.7
          }
        }
      },
      // 反例: 误识别为其他风格
      {
        id: "WC-002",
        category: "decisive_style",
        input: "这个方案可行，我们开始吧",
        alternatives: ["这个方案有点意思", "这个还不错"],
        ground_truth: {
          sentiment: "positive",
          nuance: {
            cautiousness: 0.2,
            decisiveness: 0.9,
            conservativeness: 0.4
          }
        }
      },
      // ... 共 40 个用例
    ]
  },

  resistance: {
    cases: [
      {
        id: "RS-001",
        category: "digesting",
        input: {
          resistance_type: "silence",
          followed_by: "continue_probing",
          context: "用户沉默 5 秒后追问: '具体的技术选型呢？'"
        },
        ground_truth: {
          classification: "digesting",
          confidence_threshold: 0.7
        }
      },
      {
        id: "RS-002",
        category: "boundary",
        input: {
          resistance_type: "silence",
          followed_by: "new_topic",
          context: "用户沉默 10 秒后说: '对了，数据库呢？'"
        },
        ground_truth: {
          classification: "boundary_reached",
          confidence_threshold: 0.8
        }
      },
      // ... 共 30 个用例
    ]
  },

  repetition: {
    cases: [
      {
        id: "RP-001",
        category: "cross_session_taste",
        input: {
          current: { pattern: "silence_switch" },
          history: generateHistory(5, true)  // 5 次跨 session 同类模式
        },
        ground_truth: {
          is_taste: true,
          stability_score: 1.0
        }
      },
      {
        id: "RP-002",
        category: "same_session_noise",
        input: {
          current: { pattern: "silence_probing" },
          history: generateHistory(5, false)  // 5 次同 session 模式
        },
        ground_truth: {
          is_taste: false,
          stability_score: 0.2
        }
      },
      // ... 共 30 个用例
    ]
  }
};
```

#### 4.2.2 准确率计算方法

```typescript
// 文件: /Users/archersado/workspace/originos/src/lib/taste/__tests__/accuracy.ts

export interface AccuracyMeasurement {
  total_cases: number;
  correct: number;
  accuracy: number;  // 0-1
  by_category: {
    word_choice: { correct: number; total: number; accuracy: number };
    resistance: { correct: number; total: number; accuracy: number };
    repetition: { correct: number; total: number; accuracy: number };
  };
  confidence_interval: {
    lower: number;  // 95% 置信区间下限
    upper: number;  // 95% 置信区间上限
  };
}

export function measureAccuracy(
  reader: SignalReader,
  benchmark: typeof TASTE_SIGNAL_BENCHMARK
): AccuracyMeasurement {
  const results = {
    word_choice: { correct: 0, total: benchmark.word_choice.cases.length },
    resistance: { correct: 0, total: benchmark.resistance.cases.length },
    repetition: { correct: 0, total: benchmark.repetition.cases.length }
  };

  // 测试词汇选择
  for (const testCase of benchmark.word_choice.cases) {
    const result = reader.readWordChoice(testCase.input, testCase.alternatives);
    const groundTruth = testCase.ground_truth;

    if (isNuanceMatch(result.nuance, groundTruth.nuance) &&
        result.sentiment_direction === groundTruth.sentiment) {
      results.word_choice.correct++;
    }
  }

  // 测试阻力信号
  for (const testCase of benchmark.resistance.cases) {
    const result = reader.classifyResistance(testCase.input);
    const groundTruth = testCase.ground_truth;

    if (result.classification === groundTruth.classification &&
        result.confidence >= groundTruth.confidence_threshold) {
      results.resistance.correct++;
    }
  }

  // 测试重复模式
  for (const testCase of benchmark.repetition.cases) {
    const result = reader.recognizeCrossSessionPattern(
      testCase.input.current,
      testCase.input.history
    );
    const groundTruth = testCase.ground_truth;

    if (result.is_taste === groundTruth.is_taste &&
        Math.abs(result.stability_score - groundTruth.stability_score) < 0.1) {
      results.repetition.correct++;
    }
  }

  // 计算总体准确率
  const totalCorrect = results.word_choice.correct + results.resistance.correct + results.repetition.correct;
  const totalCases = results.word_choice.total + results.resistance.total + results.repetition.total;
  const accuracy = totalCorrect / totalCases;

  // 计算 95% 置信区间
  const z = 1.96;  // 95% 置信水平
  const margin = z * Math.sqrt((accuracy * (1 - accuracy)) / totalCases);

  return {
    total_cases: totalCases,
    correct: totalCorrect,
    accuracy,
    by_category: {
      word_choice: {
        correct: results.word_choice.correct,
        total: results.word_choice.total,
        accuracy: results.word_choice.correct / results.word_choice.total
      },
      resistance: {
        correct: results.resistance.correct,
        total: results.resistance.total,
        accuracy: results.resistance.correct / results.resistance.total
      },
      repetition: {
        correct: results.repetition.correct,
        total: results.repetition.total,
        accuracy: results.repetition.correct / results.repetition.total
      }
    },
    confidence_interval: {
      lower: Math.max(0, accuracy - margin),
      upper: Math.min(1, accuracy + margin)
    }
  };
}

// 检查 nuance 是否匹配（允许一定误差）
function isNuanceMatch(actual: number[], expected: number[]): boolean {
  const tolerance = 0.15;  // 15% 误差容忍
  return actual.every((v, i) => Math.abs(v - expected[i]) <= tolerance);
}
```

#### 4.2.3 测试集成到 Vitest

```typescript
// 文件: /Users/archersado/workspace/originos/src/lib/taste/__tests__/signal-reader.test.ts

describe("SignalReader - Accuracy Benchmark", () => {
  let reader: SignalReader;

  beforeEach(() => {
    reader = new SignalReader();
  });

  it("should achieve at least 85% accuracy on benchmark dataset", () => {
    const measurement = measureAccuracy(reader, TASTE_SIGNAL_BENCHMARK);

    // 输出详细结果
    console.log("=== SignalReader Accuracy Report ===");
    console.log(`Total accuracy: ${(measurement.accuracy * 100).toFixed(2)}%`);
    console.log(`  95% CI: [${(measurement.confidence_interval.lower * 100).toFixed(2)}%, ` +
                `${(measurement.confidence_interval.upper * 100).toFixed(2)}%]`);
    console.log(`\nBy category:`);
    console.log(`  Word Choice: ${(measurement.by_category.word_choice.accuracy * 100).toFixed(2)}%`);
    console.log(`  Resistance: ${(measurement.by_category.resistance.accuracy * 100).toFixed(2)}%`);
    console.log(`  Repetition: ${(measurement.by_category.repetition.accuracy * 100).toFixed(2)}%`);

    // 主验证点
    expect(measurement.accuracy).toBeGreaterThanOrEqual(0.85);

    // 次要验证点：各分类别也应有合理准确率
    expect(measurement.by_category.word_choice.accuracy).toBeGreaterThanOrEqual(0.80);
    expect(measurement.by_category.resistance.accuracy).toBeGreaterThanOrEqual(0.80);
    expect(measurement.by_category.repetition.accuracy).toBeGreaterThanOrEqual(0.80);
  });

  it("should handle edge cases gracefully", () => {
    // 边界测试：空输入
    expect(reader.readWordChoice("", [])).toHaveProperty("confidence", 0);

    // 边界测试：无历史记录
    const result = reader.recognizeCrossSessionPattern(
      { pattern: "test" },
      []
    );
    expect(result.is_taste).toBe(false);
  });
});
```

---

### 4.3 延后功能的集成风险缓解

#### 4.3.1 T.8 Trust Expansion 的 Stub 定义

```typescript
// 文件: /Users/archersado/workspace/originos/src/lib/taste/trust-stub.ts

/**
 * MVP 阶段的 Trust Expansion Stub
 *
 * 注意: 这是 T.8 的临时实现，用于 MVP 阶段。
 * 完整实现将在后续 Epic 中完成。
 */

export class TrustManagerStub implements TrustManager {
  // MVP 阶段：固定为 "guided" 级别
  // 这意味着 agent 可在有多个可行方案时自主选择，
  // 但在高风险决策时仍需用户确认
  private static readonly DEFAULT_AUTONOMY: AutonomyLevel = 'guided';

  private trustLevel: number = 0.5;  // MVP: 固定信任度

  /**
   * MVP 实现:信任管理器的桩方法
   */
  async processTrustEvent(event: TrustEvent): Promise<void> {
    console.warn("[TrustManagerStub] Using stub implementation. Trust events are logged but not processed.");
    // MVP: 只记录，不实际影响信任度
  }

  /**
   * MVP 实现:返回固定的自主级别
   */
  getAutonomyLevel(domain?: string): AutonomyLevel {
    return TrustManagerStub.DEFAULT_AUTONOMY;
  }

  /**
   * MVP 实现:不实际应用惩罚
   */
  async applyTrustPenalty(severity: 'minor' | 'major' | 'critical'): Promise<void> {
    console.warn(`[TrustManagerStub] Penalty of severity ${severity} would be applied in full implementation`);
  }

  /**
   * MVP 实现:不实际恢复信任度
   */
  async recoverTrust(event: TrustEvent): Promise<void> {
    console.warn("[TrustManagerStub] Trust recovery would be applied in full implementation");
  }

  /**
   * 获取当前信任度（用于调试）
   */
  getCurrentTrust(): number {
    return this.trustLevel;
  }

  /**
   * 检查是否是 Stub 实现
   */
  isStub(): boolean {
    return true;
  }
}

// Autonomy 级别定义（与完整实现相同）
export type AutonomyLevel =
  | 'limited'
  | 'guided'
  | 'collaborative'
  | 'autonomous';
```

**注意事项**:
- Stub 在所有方法中添加 `isStub()` 检查，避免后续误用
- 所有桩方法添加警告日志，方便调试
- 数据结构与完整实现保持一致

#### 4.3.2 T.9 ECO Controller 的独立集成

```typescript
// 文件: /Users/archersado/workspace/originos/src/lib/taste/eco-controller-integration.test.ts

/**
 * ECO Controller 集成测试
 *
 * 即使 T.9 被延后，也需要验证它能正确消费 TASTE 模式
 */

describe("ECO Controller Integration (Independent)", () => {
  let ecoController: ECOController;
  let mockTastePatterns: TastePattern[];

  beforeEach(() => {
    ecoController = new ECOController();
    mockTastePatterns = generateMockTastePatterns(10);
  });

  it("should consume TASTE patterns without SOUL", () => {
    // Conserve: 基于模式稳定性
    const conserverResult = ecoController.conserve(
      mockTastePatterns,
      mockOntology
    );

    expect(conserverResult.stable_patterns).toBeDefined();
    expect(conserverResult.stable_patterns.length).toBeGreaterThan(0);
  });

  it("should work with static ECO state (no Trust Model)", () => {
    // MVP: 使用固定的 ECO 状态
    const staticState: ECOState = {
      explore_level: 0.5,
      conserve_level: 0.5,
      optimize_ratio: 0.0
    };

    const exploreResult = ecoController.explore(mockOntology, mockContext);
    const conserverResult = ecoController.conserve(mockTastePatterns, mockOntology);
    const optimizeResult = ecoController.optimize(exploreResult, conserverResult, staticState);

    expect(optimizeResult.to_integrate).toBeDefined();
    expect(optimizeResult.to_stabilize).toBeDefined();
    expect(optimizeResult.to_forget).toBeDefined();
  });
});
```

#### 4.3.3 T.10 Meta Feedback 的数据收集计划

```typescript
// 文件: /Users/archersado/workspace/originos/src/lib/taste/meta-feedback-collector.ts

/**
 * 元反馈数据收集器（MVP 阶段）
 *
 * 虽然完整的 Meta Feedback 处理被延后，
 * 但我们需要收集数据以验证 T.1-T.6 的有效性。
 */

export class MetaFeedbackCollector {
  private feedbackLog: MetaFeedbackEntry[] = [];

  /**
   * 尝试识别交互中的元反馈
   */
  detectMetaFeedback(interaction: UserInteraction): MetaFeedback | null {
    const patterns = [
      // 纠正模式
      /你觉得我喜欢|你以为我|你理解错了/,
      // 肯定模式
      /你理解得对|你最近.*理解有提升|不错.*理解/
    ];

    for (const pattern of patterns) {
      if (pattern.test(interaction.content)) {
        return this.parseMetaFeedback(interaction.content);
      }
    }

    return null;
  }

  /**
   * 记录元反馈（暂不处理）
   */
  logFeedback(feedback: MetaFeedback): void {
    this.feedbackLog.push({
      ...feedback,
      timestamp: Date.now(),
      stage: "MVP"  // 标记为 MVP 阶段的日志
    });

    console.log("[MetaFeedbackCollector] Feedback logged for future analysis:", feedback);
  }

  /**
   * 导出反馈日志（用于分析）
   */
  exportFeedbackLog(): MetaFeedbackEntry[] {
    return [...this.feedbackLog];
  }

  /**
   * 清空日志
   */
  clearLog(): void {
    this.feedbackLog = [];
  }

  private parseMetaFeedback(content: string): MetaFeedback {
    // 简单的启发式解析
    if (content.includes("理解错了")) {
      return {
        type: "understanding_correction",
        understanding_correction: {
          agent_claim: content.match(/你觉得(.*)/)?.[1] || "",
          correction: content.match(/理解错了，其实(.*)/)?.[1] || "",
          evidence_examples: []
        }
      };
    } else if (content.includes("理解有提升")) {
      return {
        type: "understanding_affirmation",
        understanding_affirmation: {
          improvement_area: "overall",
          comparison: "better_than_before"
        }
      };
    }

    return {
      type: "understanding_correction",
      understanding_correction: {
        agent_claim: "",
        correction: "",
        evidence_examples: []
      }
    };
  }
}
```

**手动测试计划**:
1. 在 MVP 测试阶段，让 5 个测试用户使用系统
2. 收集用户的口头元反馈
3. 统计"理解正确" vs "理解错误"的比例
4. 验证 T.1-T.6 的实际效果

---

### 4.4 MVP 质量门槛定义

```typescript
// 文件: /Users/archersado/workspace/originos/src/lib/taste/mvp-quality-gate.ts

export interface MVPQualityGate {
  // Epic T.1-T.6 是否通过
  allStoriesCompleted: boolean;

  // 核心质量指标
  metrics: {
    // SignalReader 准确率
    signal_accuracy: number;  // >= 0.85

    // Pattern 蒸馏成功率
    distillation_success_rate: number;  // >= 0.90

    // TASTE/SOUL 持久化一致性
    persistence_consistency: number;  // >= 0.95

    // 跨 session 品味持续积累验证
    cross_session_validation: boolean;  // true

    // 测试覆盖率
    test_coverage: number;  // >= 0.80
  };

  // 安全性指标
  safety: {
    // Governance 约束是否正确拦截
    governance_blocked_rate: number;  // >= 0.95 (单次观察被拦截)

    // Ontology 违反是否被检测
    ontology_violation_detected: boolean;  // true
  };

  // 集成测试
  integration: {
    // T.1-T.6 端到端流程
    end_to_end_success: boolean;  // true

    // Stub 模块是否正常工作
    stubs_functional: boolean;  // true

    // 数据收集是否正常
    data_collection: boolean;  // true
  };

  // 性能指标
  performance: {
    // 信号读取延迟 < 100ms
    signal_read_latency: number;  // <= 100

    // 模式查询延迟 < 50ms
    pattern_query_latency: number;  // <= 50

    // SOUL 加载延迟 < 200ms
    soul_load_latency: number;  // <= 200
  };
}

export async function evaluateMVPQualityGate(
  signalReader: SignalReader,
  distillationEngine: DistillationEngine,
  tastePersistence: TASTEPersistence,
  soulManager: SOULManager,
  trustManagerStub: TrustManagerStub
): Promise<MVPQualityGate> {
  // 1. SignalReader 准确率
  const signalAccuracy = measureAccuracy(signalReader, TASTE_SIGNAL_BENCHMARK).accuracy;

  // 2. Pattern 蒸馏成功率
  const distillationRate = await measureDistillationSuccess(distillationEngine);

  // 3. 持久化一致性
  const persistenceConsistency = await measurePersistenceConsistency(tastePersistence);

  // 4. 跨 session 验证
  const crossSessionValid = await verifyCrossSessionAccumulation(soulManager);

  // 5. 测试覆盖率
  const testCoverage = await measureTestCoverage();

  // 6. 汇总结果
  const gate: MVPQualityGate = {
    allStoriesCompleted: true,  // 手动检查

    metrics: {
      signal_accuracy: signalAccuracy,
      distillation_success_rate: distillationRate,
      persistence_consistency: persistenceConsistency,
      cross_session_validation: crossSessionValid,
      test_coverage: testCoverage
    },

    safety: {
      governance_blocked_rate: await measureGovernanceBlocking(),
      ontology_violation_detected: await verifyOntologyViolationDetection()
    },

    integration: {
      end_to_end_success: await verifyEndToEndFlow(),
      stubs_functional: trustManagerStub.isStub() === true,
      data_collection: await verifyDataCollection()
    },

    performance: {
      signal_read_latency: await measureSignalReadLatency(signalReader),
      pattern_query_latency: await measurePatternQueryLatency(tastePersistence),
      soul_load_latency: await measureSoulLoadLatency(soulManager)
    }
  };

  return gate;
}

export function isMVPReady(gate: MVPQualityGate): boolean {
  return (
    // Epic 完成
    gate.allStoriesComplete &&
    // 核心质量
    gate.metrics.signal_accuracy >= 0.85 &&
    gate.metrics.distillation_success_rate >= 0.90 &&
    gate.metrics.persistence_consistency >= 0.95 &&
    gate.metrics.cross_session_validation &&
    gate.metrics.test_coverage >= 0.80 &&
    // 安全性
    gate.safety.governance_blocked_rate >= 0.95 &&
    gate.safety.ontology_violation_detected &&
    // 集成
    gate.integration.end_to_end_success &&
    gate.integration.stubs_functional &&
    gate.integration.data_collection &&
    // 性能
    gate.performance.signal_read_latency <= 100 &&
    gate.performance.pattern_query_latency <= 50 &&
    gate.performance.soul_load_latency <= 200
  );
}
```

**MVP 发布前检查清单**:
```markdown
##  Epic T MVP 发布前检查清单

### Epic T.1-T.6 完成
- [ ] T.1: SignalReader 完成
- [ ] T.2: Observation Queue 完成
- [ ] T.3: Governance 验证完成
- [ ] T.4: Pattern Distillation 完成
- [ ] T.5: TASTE Persistence 完成
- [ ] T.6: SOUL Identity 完成

### 核心质量指标
- [ ] SignalReader 准确率 >= 85%
- [ ] Pattern 蒸馏成功率 >= 90%
- [ ] TASTE/SOUL 持久化一致性 >= 95%
- [ ] 跨 session 品味持续积累验证成功
- [ ] 测试覆盖率 >= 80%

### 安全性
- [ ] Governance 正确拦截单次观察（>= 95%）
- [ ] Ontology 违反被正确检测

### 集成
- [ ] T.1-T.6 端到端流程成功
- [ ] Stub 模块正常工作
- [ ] 数据收集正常

### 性能
- [ ] 信号读取延迟 <= 100ms
- [ ] 模式查询延迟 <= 50ms
- [ ] SOUL 加载延迟 <= 200ms

### 文档
- [ ] QA 测试报告完成
- [ ] 已知问题列表清晰
- [ ] 风险评估完成
```

---

## 5. Implementation Details

### 5.1 文件清单

需要创建的核心测试文件：

```
src/lib/taste/
├── __tests__/
│   ├── signal-reader.test.ts            # T.1 完整测试
│   ├── signal-reader-fixtures.ts        # 测试用例数据
│   ├── benchmark-dataset.ts             # 基准测试集
│   ├── accuracy.ts                      # 准确率计算
│   ├── observation-queue.test.ts        # T.2 测试
│   ├── governance.test.ts               # T.3 测试
│   ├── distillation.test.ts             # T.4 测试
│   ├── taste-persistence.test.ts        # T.5 测试
│   ├── soul.test.ts                     # T.6 测试
│   ├── eco-controller-integration.test.ts  # T.9 独立集成测试
│   └── mvp-quality-gate.test.ts         # MVP 质量门槛测试
├── trust-stub.ts                        # T.8 Stub 实现
├── meta-feedback-collector.ts           # T.10 数据收集
└── mvp-quality-gate.ts                  # 质量门槛定义
```

### 5.2 测试执行策略

**阶段 1: 单元测试**
```bash
# 运行所有 Epic T 测试
npm test -- src/lib/taste/__tests__/

# 每个独立测试
npm test -- src/lib/taste/__tests__/signal-reader.test.ts
npm test -- src/lib/taste/__tests__/observation-queue.test.ts
# ...
```

**阶段 2: 集成测试**
```bash
# 运行端到端测试
npm test -- src/lib/taste/__tests__/mvp-quality-gate.test.ts
```

**阶段 3: 准确率测试**
```bash
# 运行基准测试并输出详细报告
npm test -- src/lib/taste/__tests__/signal-reader.test.ts --reporter=verbose
```

**阶段 4: 覆盖率**
```bash
# 生成覆盖率报告
npm run test:coverage -- src/lib/taste/
```

### 5.3 验证方法

**手动验证计划**:
1. 招募 5 个测试用户
2. 每个用户使用系统 10 次
3. 收集元反馈（口头反馈）
4. 验证 SignalReader 准确率是否与基准测试一致

**自动化验证流程**:
1. 每次提交运行所有测试
2. PR 必须通过所有测试才能合并
3. 发布前运行完整的质量门槛检查

---

## 6. Preventive Measures

### 6.1 过程改进

1. **基准测试集管理**
   - 建立标准测试用例库
   - 定期 review 和更新测试用例
   - 新功能必须包含至少 5 个测试用例

2. **Mock 数据标准化**
   - 统一 mock 数据格式
   - 使用 `fixuture` 文件存储测试数据
   - 避免测试之间的硬编码依赖

3. **Performance Regression 检测**
   - 使用基准测试检测性能退化
   - 设置性能阈值警戒线
   - CI 中集成性能测试

### 6.2 监控指标

1. **生产监控指标**
   ```typescript
   interface ProductionMetrics {
     // SignalReader 性能
     signal_read_p99: number;  // <= 100ms

     // Pattern 查询性能
     pattern_query_p99: number;  // <= 50ms

     // SOUL 加载性能
     soul_load_p99: number;  // <= 200ms

     // 用户反馈
     positive_feedback_rate: number;  // >= 0.80
     negative_feedback_rate: number;  // <= 0.10
   }
   ```

2. **错误监控**
   - 分类统计错误类型
   - 记录 Governance 拦截的候选项
   - 跟踪 Ontology 违反实例

### 6.3 代码审查重点

**关键审查点**:
1. SignalReader 的准确性算法
2. Governance 约束的正确性
3. TASTE/SOUL 数据一致性
4. Stub 模块的完整性
5. 测试覆盖率 > 80%

**审查 Checklist**:
```markdown
## Epic T 代码审查清单

### T.1 SignalReader
- [ ] Word Choice 信号识别逻辑正确
- [ ] Resistance 二元组消歧正确
- [ ] Repetition 跨 session 识别正确
- [ ] 所有信号有可解释的 evidence

### T.2 Observation Queue
- [ ] 时间衰减正确实施
- [ ] 不触发持久化
- [ ] 性能满足要求（O(1) 添加）

### T.3 Governance
- [ ] 统计门槛正确验证
- [ ] 人类纠正权重正确应用
- [ ] Ontology 约束正确应用

### T.4 Distillation
- [ ] 模式提取准确
- [ ] 例外保留正确
- [ ] 激活强度计算正确

### T.5 Persistence
- [ ] 完整性保证
- [ ] 引用链正确
- [ ] 索引效率满足要求

### T.6 SOUL
- [ ] 初始化正确
- [ ] 一致性保证
- [ ] 边界验证正确

### 通用
- [ ] 测试覆盖率 >= 80%
- [ ] 性能测试通过
- [ ] 集成测试通过
```

---

## 7. Lessons Learned

### 7.1 哪些做得好

1. **Epic 文档的完整性**
   - Epic T 的技术规范非常详细
   - 为 QA 工作提供了良好的基础

2. **依赖关系的清晰定义**
   - T.1-T.6 的依赖链清晰
   - 延后功能的集成风险可评估

3. **现有测试基础设施**
   - Vitest 配置完善
   - 现有测试模式可复用

### 7.2 哪些可以改进

1. **验收标准的可测量性**
   - 原始验收标准中"区分同义词的细微差别"不精确
   - 需要引入更具体的测试用例和量化指标

2. **基准测试集的设计**
   - 100 个测试用例的构建需要大量工作
   - 需要与 PM 协调确定测试用例优先级

3. **元反馈数据收集**
   - T.10 延后影响直接的质量验证
   - 需要制定手动测试计划

### 7.3 知识分享

**关键洞察**:
1. **品味的可测量性**: 通过标准测试用例集，可以将主观的品味问题转化为可测量的技术指标
2. **集成测试的重要性**: 即使功能被延后，也需要提前定义接口和 stub
3. **质量门槛的定义**: 需要涵盖功能、性能、安全性多个维度

**未来建议**:
1. 在 Epic 规划阶段包含 QA 设计
2. 为复杂系统预先设计基准测试集
3. 建立持续的质量监控机制

---

## 8. Recommendations

### 8.1 立即行动项（MVP 发布前）

1. **创建标准测试用例集** (PM + QA)
   - 优先级: High
   - 工作量: 3-5 天
   - 交付物: `signal-reader-fixtures.ts` 和 `benchmark-dataset.ts`

2. **实现 Stub 模块** (Dev)
   - 优先级: High
   - 工作量: 1-2 天
   - 交付物: `trust-stub.ts`

3. **定义质量门槛检查清单** (QA)
   - 优先级: High
   - 工作量: 1 天
   - 交付物: `mvp-quality-gate.ts` 和检查清单文档

4. **建立数据收集机制** (Dev + QA)
   - 优先级: Medium
   - 工作量: 2 天
   - 交付物: `meta-feedback-collector.ts`

### 8.2 后续行动项（MVP 发布后）

1. **扩展基准测试集**
   - 目标: 100 个测试用例
   - 周期: 2-3 周

2. **实现完整的手动测试计划**
   - 招募测试用户
   - 收集元反馈
   - 分析结果

3. **集成监控系统**
   - 生产监控指标
   - 错误追踪
   - 性能监控

---

## 9. Summary

### 9.1 关键结论

1. **T.1-T.6 可作为 MVP 发布**
   - 核心功能链完整
   - 通过适当的验收标准重新定义
   - 需要建立标准测试用例集

2. **信号准确率 *85% 可测量**
   - 通过基准测试集 + 准确率计算方法
   - 需要与 PM 协调确定测试用例优先级

3. **延后功能的集成风险可控**
   - T.8 需要定义 stub
   - T.9 可独立集成测试
   - T.10 需要手动数据收集

4. **MVP 质量门槛已定义**
   - 涵盖功能、性能、安全性
   - 可自动化的检查清单

### 9.2 风险评估总结

| 风险 | 严重性 | 缓解措施 | 状态 |
|-----|-------|---------|------|
| T.1 隐性信号可测量性 | High | 标准测试用例集 | 已方案化 |
| T.10 延后影响验证 | High | 手动测试计划 | 已方案化 |
| T.8 Stub 定义 | Medium | Stub 接口定义 | 可控 |
| T.9 独立集成 | Low | 独立测试 | 低风险 |

### 9.3 建议

1. **PM**: 批准测试用例集的优先级和资源分配
2. **Dev**: 实施 Stub 模块和数据收集机制
3. **QA**: 执行质量门槛检查和手动测试计划
4. **Test Expert**: 验证端到端集成和用户验收测试

---

**文档版本**: 1.0
**创建日期**: 2026-03-05
**创建人**: QA Engineer
**状态**: For Review
