# Epic T: TASTE/SOUL 品味积累系统

**Epic 编号:** T (Taste 认知系统)
**Epic 名称:** TASTE/SOUL 品味积累系统 - Speech-Cognition 层实现
**优先级:** 🔴 High (实现认知共生的关键层)
**理论依据:** EEOIP 框架 - I (Interaction) 中的 Speech-Cognition 层
**状态:** Planning
**负责人:** -
**开始日期:** 2026-03-05

---

## 📋 Epic 描述

实现 **Speech-Cognition 层**，让 OriginOS 能够通过持续交互自主识别和积累用户的品味（Taste），建立稳定的身份锚点（SOUL），实现真正的认知共生（Speech-Symbiosis）。

Speech-Cognition 是 Speech 演化的第三层，也是最难定义的一层：
- **Speech-Social**（已实现 Epic 0）："我看到，我说出来" - 感知与在场
- **Speech-Act**（已实现 Epic 0）："我要你做什么" - 工具与行动
- **Speech-Cognition**（本 Epic）："我们一起想这件事" - 认知共生

### 为什么这是 Speech-Cognition？

Speech-Cognition 的标志不是 agent 能完成更复杂的任务（那还是 Speech-Act 的延伸），而是：
- 在持续的交互中，两个认知主体（人类和 Language Agent）各自的认知结构都被对方修改
- 人类因为 agent 看到了自己之前没有看到的模式
- Agent 因为人类的具身经验判断而更新了自己的品味模式

这不是工具与使用者的关系。这是 **认知共生体**。

---

## 🎯 Epic 目标

### 核心目标

1. **隐性信号识别** - 实现 SignalReader，从交互中提取隐性品味信号
2. **TASTE 品味积累** - 通过 ARIA 三阶段（Infer → Govern → Persist）沉淀品味模式
3. **SOUL 身份锚定** - 建立稳定的身份和目的，作为 Harnessing 的基础
4. **信任扩展机制** - 随信任积累扩展 agent 的自主判断空间（Governance as Trust）

### 成功标准

- ✅ Agent 能自主识别用户的词汇选择倾向（"可行" vs "有创意"）
- ✅ Agent 能通过阻力信号判断品味边界（沉默+转向 vs 沉默+深入探问）
- ✅ Agent 能跨 session 识别重复模式（第 5 次同类沉默被认为是品味）
- ✅ 品味模式有可解释的来源（具体的 observation 案例记录）
- ✅ SOUL 作为身份锚点，在所有交互中保持一致
- ✅ 用户能元反馈品味理解（"你最近对我的风格理解有提升"）

---

## 🏗️ 架构设计

### 整体架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Speech-Cognition 层                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │              SignalReader (信号读取层)                       │  │
│  │  ┌──────────────┬──────────────┬──────────────┐            │  │
│  │  │ 词汇选择信号 │ 阻力信号     │ 重复模式     │            │  │
│  │  │ (WordChoice) │ (Resistance) │ (Repetition) │            │  │
│  │  └──────────────┴──────────────┴──────────────┘            │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                              ↓                                      │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │              ARIA 三阶段 (Governance)                        │  │
│  │  ┌──────────────────────────────────────────────────────┐  │  │
│  │  │ Infer (推断阶段) - Observation Queue                 │  │
│  │  │ • 轻量观察记录，不立即固化                          │  │
│  │  │ • "如果学习发生，模式应该是什么"                     │  │
│  │  └──────────────────────────────────────────────────────┘  │  │
│  │                              ↓                                │  │
│  │  ┌──────────────────────────────────────────────────────┐  │  │
│  │  │ Govern (治理阶段) - Validation                       │  │
│  │  │ • 统计稳定性门槛 (需要 N 次同类观察)                 │  │
│  │  │ • 人类纠正权重 (显性反馈最高优先级)                 │  │
│  │  └──────────────────────────────────────────────────────┘  │  │
│  │                              ↓                                │  │
│  │  ┌──────────────────────────────────────────────────────┐  │  │
│  │  │ Persist (持久化阶段) - Distillation                  │  │
│  │  │ • 从情节到语义模式的压缩                            │  │
│  │  │ • 保留例外，不只提取规律                            │  │
│  │  │ • 遗忘是价值过滤，而非删除                          │  │
│  │  └──────────────────────────────────────────────────────┘  │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                              ↓                                      │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │              TASTE Pattern Database                         │  │
│  │  ┌──────────────┬──────────────┬──────────────┐            │  │
│  │  │ Active       │ Domain       │ Exceptions   │            │  │
│  │  │ (高激活模式) │ (领域模式)   │ (例外经验)   │            │  │
│  │  └──────────────┴──────────────┴──────────────┘            │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                              ↓                                      │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │              SOUL Identity Anchor                            │  │
│  │  ┌──────────────┬──────────────┬──────────────┐            │  │
│  │  │ Identity     │ Engagement   │ Boundaries   │            │  │
│  │  │ (身份目的)   │ (交互方式)   │ (边界约束)   │            │  │
│  │  └──────────────┴──────────────┴──────────────┘            │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                              ↓                                      │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │              ECO Controller (三元张力控制)                    │  │
│  │  ┌──────────────┬──────────────┬──────────────┐            │  │
│  │  │ Explore      │ Conserve     │ Optimize     │            │  │
│  │  │ (边界探测)   │ (模式保持)   │ (蒸馏分类)   │            │  │
│  │  └──────────────┴──────────────┴──────────────┘            │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                              ↑                              ↓
                        CUI 交互层                           应用调用层
```

---

## 📝 Stories 列表

| Story | 标题 | 描述 | 优先级 | 依赖 |
|-------|------|------|--------|------|
| T.1 | SignalReader 实现 | 实现词汇选择、阻力、重复模式的信号提取 | Critical | Epic 0 |
| T.2 | Observation Queue | 建立 TASTE.md 的观察缓冲机制 | High | T.1 |
| T.3 | Govenance 验证 | 实现统计门槛和人类纠正权重 | High | T.2 |
| T.4 | Pattern Distillation | 实现从情节到语义模式的蒸馏引擎 | High | T.3 |
| T.5 | TASTE Persistence | 实现 TASTE.md 的持久化与引用机制 | High | T.4 |
| T.6 | SOUL Identity | 实现 SOUL.md 作为身份锚点 | High | T.5 |
| T.7 | SOUL Auto-Calibration | SOUL 基于品味信号的自动校准 | Medium | T.6 |
| T.8 | Trust Expansion | 实现随信任积累扩展自主判断空间 | Medium | T.7 |
| T.9 | ECO Controller | 实现 Explore/Conserve/Optimize 控制层 | Medium | T.5 |
| T.10 | Meta Feedback | 实现用户对品味理解本身的元反馈 | Low | T.5 |

---

## 📖 故事详情

### Story T.1: SignalReader 实现

**状态:** Planning
**优先级:** Critical
**依赖:** Epic 0 (CUI 交互层)

**描述:**
实现 SignalReader，从 CUI 交互中提取隐性品味信号：

1. **词汇选择信号** - 检测用户选择了哪个词而不是同义词
   - 示例："这个方案有点意思" vs "这个方案可行" - 前者保持观望，后者是认可

2. **阻力信号与二元组消歧** - 解决电阻信号的歧义
   - 沉默 + 继续深入 = 消化中（非阻力）
   - 沉默 + 跳转新话题 = 品味边界信号

3. **重复模式识别** - 跨 session 的模式识别
   - 第 1-4 次同类沉默：噪声
   - 第 5 次同类沉默：品味（达到统计门槛）

**技术规范:**

```typescript
// 信号类型定义
interface TasteSignal {
  type: 'word_choice' | 'resistance' | 'repetition';
  confidence: number;
  timestamp: timestamp;
  context: ConversationContext;
  evidence: SignalEvidence[];
}

// 词汇选择信号
interface WordChoiceSignal extends TasteSignal {
  type: 'word_choice';
  chosen: string;
  alternatives: string[];
  sentiment_direction: 'positive' | 'negative' | 'neutral' | 'hesitant';
  nuance: {
    cautiousness: number;    // 谨慎度
    decisiveness: number;    // 决断度
    conservativeness: number;  // 保守度
    adventurousness: number;  // 冒险度
  };
}

// 阻力信号与消歧
interface ResistanceSignal extends TasteSignal {
  type: 'resistance';
  resistance_type: 'silence' | 'topic_switch' | 'tone_change';
  followed_by: 'continue_probing' | 'new_topic';
  classification: 'digesting' | 'boundary_reached';
}

// 重复模式
interface RepetitionSignal extends TasteSignal {
  type: 'repetition';
  scenario: string;
  pattern: string;
  occurrences: number;
  cross_session: boolean;
  stability_score: number;  // 统计稳定性
}

// SignalReader 接口
interface SignalReader {
  readFromInteraction(
    interaction: UserInteraction
  ): TasteSignal[];

  classifySignal(signal: RawSignal): TasteSignal | null;

  // 跨 session 模式识别
  recognizeCrossSessionPattern(
    currentPattern: Pattern,
    history: Pattern[]
  ): RepetitionSignal | null;
}
```

**验收标准:**
- [ ] 词汇选择信号能区分同义词的细微差别
- [ ] 阻力信号能正确二元组消歧（消化 vs 边界）
- [ ] 跨 session 重复模式识别准确率 > 85%
- [ ] 所有信号都有可解释的 evidence

---

### Story T.2: Observation Queue

**状态:** Planning
**优先级:** High
**依赖:** T.1 (SignalReader)

**描述:**
建立 TASTE.md 的 Observation Queue，实现 ARIA 的 Infer 阶段：

- 轻量观察记录，不立即固化
- "如果学习发生，模式应该是什么"的推断
- 支持 observation 的时间窗口衰减

**技术规范:**

```typescript
// 观察 - 轻量记录
interface TasteObservation {
  id: string;
  pattern_hint: string;  // 隐含的模式提示
  signal: TasteSignal;   // 触发信号
  timestamp: timestamp;
  decay_factor: number;  // 时间衰减因子

  // 来源证据
  evidence: {
    interaction_id: string;
    context_snippet: string;
    user_reaction: UserReaction;
  };
}

// Observation Queue
interface ObservationQueue {
  // 添加观察
  addObservation(observation: TasteObservation): void;

  // 获取候选模式
  getCandidatePatterns(): CandidatePattern[];

  // 查询特定模式的观察
  getObservationsForPattern(
    pattern_hint: string
  ): TasteObservation[];

  // 清理过期观察（基于衰减）
  cleanupExpired(): void;

  // 统计信息
  getStats(): {
    totalObservations: number;
    uniquePatterns: number;
    avgObservationsPerPattern: number;
  };
}

// 候选模式（Infer 阶段产物）
interface CandidatePattern {
  pattern_hint: string;
  observations: TasteObservation[];
  confidence: number;
  timestamp_inferred: timestamp;

  // 不是结论，只是"如果学习发生"
  is_inference_only: true;
}
```

**验收标准:**
- [ ] Observation Queue 能高效添加和查询（O(1) 添加，O(n) 模式查询）
- [ ] 时间衰减正确实施（老观察权重下降）
- [ ] Infer 阶段不触发持久化（是 inference，不是 conclusion）

---

### Story T.3: Governance 验证

**状态:** Planning
**优先级:** High
**依赖:** T.2 (Observation Queue)

**描述:**
实现 ARIA 的 Govern 阶段：
- 统计稳定性门槛（需要 N 次同类观察才触发蒸馏）
- 人类纠正权重（显性反馈最高优先级）
- 约束规则检验（Ontology 对 TASTE 的约束）

**技术规范:**

```typescript
// 治理约束
interface GovernanceConstraints {
  // 统计稳定性门槛
  statistical_threshold: {
    min_observations: number;      // 最少观察次数（默认 5）
    stability_score_threshold: number;  // 稳定性分数门槛（默认 0.7）
    cross_session_required: boolean;  // 是否必须跨 session（默认 true）
  };

  // 人类纠正权重
  human_override_weight: {
    explicit_correction_multiplier: number;  // 显式纠错权重（默认 3.0）
    implicit_feedback_weight: number;  // 隐性反馈权重（默认 1.0）
    override_threshold: number;  // 覆盖门槛（默认 0.9）
  };

  // Ontology 约束
  ontology_constraints: {
    must_respect_object_types: boolean;  // 必须尊重对象类型定义
    must_respect_relation_types: boolean;  // 必须尊重关系类型定义
  };
}

// Governance 验证器
interface GovernanceValidator {
  // 验证候选模式是否满足治理约束
  validateCandidate(
    candidate: CandidatePattern,
    constraints: GovernanceConstraints
  ): ValidationResult;

  // 计算统计稳定性
  computeStabilityScore(
    observations: TasteObservation[]
  ): number;

  // 检查是否达到门槛
  shouldDistill(
    candidate: CandidatePattern,
    constraints: GovernanceConstraints
  ): boolean;
}

// 验证结果
interface ValidationResult {
  passed: boolean;
  reasons: string[];
  warnings: string[];
  score: number;  // 通过分数（0-1）
}
```

**验收标准:**
- [ ] 单次观察不触发蒸馏（必须达到门槛）
- [ ] 人类显性纠正权重 > 隐性反馈权重（默认 3.0x）
- [ ] Ontology 约束被正确应用

---

### Story T.4: Pattern Distillation

**状态:** Planning
**优先级:** High
**依赖:** T.3

**描述:**
实现从情节到语义模式的蒸馏引擎：
- 从观察中提取语义模式
- 保留例外，不只提取规律
- 遗忘是价值过滤，而非简单删除

**技术规范:**

```typescript
// 蒸馏后的品味模式
interface TastePattern {
  id: string;
  pattern_type: 'preference' | 'avoidance' | 'boundary' | 'style';

  // 模式本体
  pattern: {
    description: string;
    trigger_condition: Condition;  // 触发条件
    behavior_manifestation: BehaviorManifestation;  // 行为表现
  };

  // 元数据
  metadata: {
    distilled_from: string[];  // 来源于哪些观察
    confidence: number;        // 置信度
    override_count: number;    // 被人类纠正的次数
    activation_strength: number;  // 激活强度（带覆盖折损）
    last_updated: timestamp;
  };

  // 例外保留
  exceptions: {
    scenario: string;
    behavior_override: string;
    reason: string;
  }[];
}

// 蒸馏引擎
interface DistillationEngine {
  // 蒸馏候选模式为品味模式
  distill(
    candidate: CandidatePattern,
    observations: TasteObservation[]
  ): TastePattern;

  // 提取触发条件
  extractTriggerCondition(
    observations: TasteObservation[]
  ): Condition;

  // 提取行为表现
  extractBehaviorManifestation(
    observations: TasteObservation[]
  ): BehaviorManifestation;

  // 识别例外
  identifyExceptions(
    main_pattern: TastePattern,
    observations: TasteObservation[]
  ): Exception[];

  // 更新激活强度（考虑覆盖折损）
  updateActivationStrength(
    pattern: TastePattern,
    new_event: TasteSignal
  ): number;
}

// 价值过滤的遗忘机制
interface ValueDecayFilter {
  // 基于价值过滤，而非时间删除
  filterLowValuePatterns(
    patterns: TastePattern[]
  ): TastePattern[];

  // 计算模式价值
  computePatternValue(pattern: TastePattern): number;
}
```

**验收标准:**
- [ ] 模式蒸馏能准确提取规律和例外
- [ ] 激活强度正确计算覆盖折损
- [ ] 遗忘是价值过滤，非简单时间删除

---

### Story T.5: TASTE Persistence

**状态:** Planning
**优先级:** High
**依赖:** T.4

**描述:**
实现 TASTE.md 的持久化与引用机制：
- 将品味模式存储为 TASTE.md 文件
- 支持品味模式的引用和追溯
- 实现 "英美法系式" 的先例引用系统

**技术规范:**

```typescript
// TASTE.md 文件结构
interface TASTEMD {
  version: string;
  project_id: string;
  user_id: string;

  // Active Patterns（高激活模式）
  active_patterns: PatternSection;

  // Domain Patterns（领域专用模式）
  domain_patterns: Map<string, PatternSection>;

  // Observation Queue（未蒸馏的观察）
  observations: ObservationSection;
}

// 模式区域（类比普通法的前例章节）
interface PatternSection {
  patterns: TastePattern[];

  // 索引：用于快速查找
  index: {
    by_type: Map<string, string[]>;  // 模式类型 → 模式 ID
    by_trigger: Map<string, string[]>;  // 触发条件 → 模式 ID
  };

  // 引用链：类似普通法的"遵循先例"链
  precedents: {
    for_this_pattern: string[];  // 本模式基于哪些模式
    based_on_this_pattern: string[];  // 哪些模式基于本模式
  };
}

// TASTE Persistence
interface TASTEPersistence {
  // 保存 TASTE.md
  save(taste: TASTEMD): Promise<void>;

  // 加载 TASTE.md
  load(project_id: string): Promise<TASTEMD | null>;

  // 添加模式（带索引更新）
  addPattern(pattern: TastePattern): Promise<void>;

  // 引用模式（类似普通法引用前例）
  citePattern(
    pattern_id: string,
    new_pattern_id: string
  ): Promise<void>;

  // 推荐相似模式
 推荐SimilarPatterns(
    condition: Condition
  ): TastePattern[];
}
```

**验收标准:**
- [ ] TASTE.md 正确持久化和加载
- [ ] 模式引用链可追溯（类似普通法)
- [ ] 相似模式推荐准确率 > 80%

---

### Story T.6: SOUL Identity

**状态:** Planning
**优先级:** High
**依赖:** T.5

**描述:**
实现 SOUL.md 作为身份和目的的稳定锚点：
- Why they exist - 定义身份和目的
- How they engage - 定义交互方式
- What they avoid - 定义边界
- 在所有交互中提供一致的自我认知

**技术规范:**

```typescript
// SOUL.md 文件结构
interface SOUL {
  version: string;
  project_id: string;
  user_id: string;

  // Identity - 为什么存在
  identity: {
    purpose: string;           // 目的陈述
    values: string[];          // 核心价值观
    worldview: string;         // 世界观
  };

  // Engagement Style - 如何交互
  engagement_style: {
    tone: Tone;                // 语调
    decision_making: DecisionMaking;  // 决策风格
    communication: Communication;  // 沟通方式
    preferred_response_length: 'concise' | 'balanced' | 'detailed';
  };

  // Boundaries - 边界与避免
  boundaries: {
    avoid_patterns: string[];  // 应该避免的模式
    red_flags: string[];       // 红旗信号
    explicit_constraints: Constraint[];  // 显式约束
  };

  // 演化历史
  evolution_history: SOULEvolution[];
}

// 语调枚举
type Tone = 'professional' | 'casual' | 'exploratory' | 'decisive' | 'collaborative';

// 决策风格
type DecisionMaking = 'conservative' | 'adventurous' | 'adaptive' | 'evidence-based';

// 沟通方式
type Communication = 'concise' | 'detailed' | 'structured' | 'fluid' | 'question-driven';

// SOUL 演化记录
interface SOULEvolution {
  version: string;
  timestamp: timestamp;
  change_type: 'initial_set' | 'auto_calibrated' | 'explicit_feedback';
  changes: {
    field: string;
    old_value: any;
    new_value: any;
    reason?: string;  // 如果是显式反馈
  }[];
  confidence: number;  // 演化置信度
}

// SOUL 管理
interface SOULManager {
  // 获取 SOUL
  loadSOUL(project_id: string): Promise<SOUL | null>;

  // 保存 SOUL
  saveSOUL(soul: SOUL): Promise<void>;

  // 初始化 SOUL（首次设立）
  initializeSOUL(
    user_id: string,
    project_id: string,
    initial_interview: InterviewData
  ): Promise<SOUL>;

  // 检查行为是否符合 SOUL
  validateAgainstBoundaries(
    behavior: ProposedBehavior
  ): ValidationResult;
}
```

**验收标准:**
- [ ] SOUL.md 正确初始化和持久化
- [ ] SOUL 在所有交互中保持一致
- [ ] 边界验证正确实施

---

### Story T.7: SOUL Auto-Calibration

**状态:** Planning
**优先级:** Medium
**依赖:** T.6

**描述:**
SOUL 基于品味信号的自动校准：
- 从 TASTE 信号推断候选身份变化
- 达到治理门槛才触发 SOUL 更新

**技术规范:**

```typescript
// 候选身份更新（Inference 阶段）
interface CandidateIdentityUpdate {
  field: string;  // 更新字段
  current_value: any;
  candidate_value: any;
  confidence: number;
  evidence: TasteSignal[];  // 基于哪些品味信号
}

// SOUL 校准器
interface SOULCalibrator {
  // 从品味信号推断候选身份更新
  inferCandidateIdentityUpdate(
    soul: SOUL,
    tasteSignals: TasteSignal[]
  ): CandidateIdentityUpdate[];

  // 治理约束：只有高置信度变化才进入持久化
  validateCandidate(
    candidate: CandidateIdentityUpdate,
    constraints: GovernanceConstraints
  ): boolean;

  // ARIA: Inference before Plasticity
  updateSOUL(
    soul: SOUL,
    candidate: CandidateIdentityUpdate
  ): Promise<SOUL>;
}

// 身份校准示例
//
// 品味信号反复显示：
// - 用户偏好 "可行" 而非 "有创意" 的方案
// - 阻力信号：对高风险方案沉默后跳转新话题
// - 重复模式：第 5 次在同类情况选择保守方案
//
// 推断：
// CandidateIdentityUpdate {
//   field: 'engagement_style.decision_making',
//   current_value: 'adaptive',
//   candidate_value: 'conservative',
//   confidence: 0.8,
//   evidence: [signal1, signal2, signal3, signal4, signal5]
// }
//
// Governance 验证通过 → 更新 SOUL
```

**验收标准:**
- [ ] SOUL 自动校准能从品味信号正确推断
- [ ] 高置信度门槛正确实施
- [ ] 演化历史正确记录

---

### Story T.8: Trust Expansion

**状态:** Planning
**优先级:** Medium
**依赖:** T.7

**描述:**
实现随信任积累扩展 agent 的自主判断空间（Governance as Trust）：
- 信任度随成功交互积累
- 自主判断空间随信任度扩展
- 显式纠正触发信任度折损，但提供恢复机制

**技术规范:**

```typescript
// 信任度模型
interface TrustModel {
  overall_trust: number;  // 总体信任度 (0-1)
  domain_trust: Map<string, number>;  // 领域信任度

  // 信任历史
  history: {
    timestamp: timestamp;
    event: TrustEvent;
    delta: number;  // 信任度变化
  }[];
}

// 信任事件类型
type TrustEvent =
  | { type: 'successful_suggestion' }
  | { type: 'correction_applied'; severity: 'minor' | 'major' | 'critical' }
  | { type: 'pattern_verified' }
  | { type: 'pattern_rejected' };

// 信任扩展策略
interface TrustExpansionStrategy {
  // 计算自主判断空间
  computeAutonomyLevel(
    trust: TrustModel,
    domain?: string
  ): AutonomyLevel;

  // 自主判断空间级别
  type AutonomyLevel = 'limited' | 'guided' | 'collaborative' | 'autonomous';
}

// Autonomy 级别定义
interface AutonomyLevels {
  limited: {
    description: 'agent 只提供建议，所有决策由用户确认';
    confirmation_required: 'always';
  };

  guided: {
    description: 'agent 可在有多个可行方案时自主选择';
    confirmation_required: 'on_high_stakes';
  };

  collaborative: {
    description: 'agent 可自主处理常规任务，只在模糊地带确认';
    confirmation_required: 'on_ambiguity';
  };

  autonomous: {
    description: 'agent 完全自主决策，只在边界情况警示';
    confirmation_required: 'never';
  };
}

// Trust Manager
interface TrustManager {
  // 处理信任事件
  processTrustEvent(event: TrustEvent): Promise<void>;

  // 获取当前自主级别
  getAutonomyLevel(domain?: string): AutonomyLevel;

  // 信任度折损与恢复
  applyTrustPenalty(severity: 'minor' | 'major' | 'critical'): Promise<void>;
  recoverTrust(event: TrustEvent): Promise<void>;
}
```

**验收标准:**
- [ ] 信任度随成功交互正确积累
- [ ] 自主判断空间随信任度正确扩展
- [ ] 显性纠正触发折损，但可恢复

---

### Story T.9: ECO Controller

**状态:** Planning
**优先级:** Medium
**依赖:** T.5

**描述:**
实现 Explore/Conserve/Optimize 三元张力控制层：
- Explore: 边界探测 + 关系发现
- Conserve: 模式保持 + 稳定性维护
- Optimize: 探索与保持之间的智能切换

**技术规范:**

```typescript
// ECO 状态
interface ECOState {
  explore_level: number;    // 探索水平 (0-1)
  conserve_level: number;   // 保持水平 (0-1)
  optimize_ratio: number;   // 优化比例 (0-1)
}

// ECO 探索结果
interface ExplorerOutput {
  novel_connections: NovelConnection[];
  boundary_probes: BoundaryProbe[];
  confidence_scores: Map<string, number>;
}

// ECO 保持结果
interface ConserverOutput {
  stable_patterns: TastePattern[];
  stability_metrics: StabilityMetrics;
}

// ECO 优化结果
interface OptimizerOutput {
  to_integrate: NovelConnection[];    // 应该整合的新发现
  to_stabilize: TastePattern[];       // 应该稳定的模式
  to_forget: TastePattern[];          // 应该遗忘的模式（价值过滤）
}

// ECO Controller
interface ECOController {
  // Explore: 边界探测
  explore(
    ontology: Ontology,
    current_context: Context
  ): ExploreOutput;

  // Conserve: 模式保持
  conserve(
    taste_patterns: TastePattern[],
    ontology: Ontology
  ): ConserverOutput;

  // Optimize: 切换决策
  optimize(
    explore_result: ExploreOutput,
    conserve_result: ConserverOutput,
    eco_state: ECOState
  ): OptimizerOutput;

  // 更新 ECO 状态
  updateECOState(
    event: ECOEvent
  ): void;
}

// ECO 事件类型
type ECOEvent =
  | { type: 'success_explore'; confidence: number }
  | { type: 'failed_conservation'; severity: number }
  | { type: 'successful_integration' }
  | { type: 'stability_maintained' };
```

**验收标准:**
- [ ] Explore 能发现语义场边界的新颖连接
- [ ] Conserve 能正确维护模式稳定性
- [ ] Optimize 能智能切换 Explore/Conserve

---

### Story T.10: Meta Feedback

**状态:** Planning
**优先级:** Low
**依赖:** T.5

**描述:**
实现用户对品味理解本身的元反馈：
- "你觉得我喜欢冒险的方案，这个理解不对"
- "你最近对我的风格理解有提升"
- Agent 能响应元反馈并自我校准

**技术规范:**

```typescript
// 元反馈类型
interface MetaFeedback {
  type: 'understanding_correction' | 'understanding_affirmation' | 'style_update';

  // 纠正：agent 的品味理解错误
  understanding_correction?: {
    agent_claim: string;      // agent 声称的品味
    correction: string;       // 纠正内容
    evidence_examples: string[];  // 证据示例
  };

  // 肯定：agent 的品味理解提升
  understanding_affirmation?: {
    improvement_area: string;  // 改进领域
    comparison: 'better_than_before' | 'much_better' | 'excellent';
  };

  // 风格更新：显式风格的改变
  style_update?: {
    previous_style: string;
    new_style: string;
    reason: string;
  };
}

// 元反馈处理器
interface MetaFeedbackHandler {
  // 处理元反馈
  processMetaFeedback(
    feedback: MetaFeedback
  ): Promise<void>;

  // 识别元反馈（从普通交互中）
  detectMetaFeedback(
    interaction: UserInteraction
  ): MetaFeedback | null;

  // 自我校准
  selfCalibrate(
    feedback: MetaFeedback
  ): Promise<void>;
}

// 元反馈示例识别
//
// 用户消息："你最近对我的风格理解有提升"
// → MetaFeedback {
//     type: 'understanding_affirmation',
//     understanding_affirmation: {
//       improvement_area: 'communication_style',
//       comparison: 'better_than_before'
//     }
//   }
//
// 信任度 +0.05，记录到理解提升里程碑
```

**验收标准:**
- [ ] 元反馈能正确识别
- [ ] 纠正性元反馈触发自我校准
- [ ] 肯定性元反馈触发信任度提升和里程碑记录

---

## 🔗 依赖关系

### 前置依赖
| 依赖内容 | 来源 Epic | 状态 |
|---------|----------|------|
| pi-agent-core 集成 | Epic 0 | ✅ Complete |
| CUI 交互层 | Epic 0 | ✅ Complete |
| 工具调用系统 | Epic 0 | ✅ Complete |

### 后续影响
| 影响模块 | 影响 |
|---------|------|
| Ontology 管理系统 | Taste 模式影响语义场演化方向 |
| ECO Controller 决策 | Taste 模式作为 Conserve 的输入 |
| 信任扩展机制 | Taste 准确性直接影响信任度 |
| 𝕀² 范式测量 | Taste 规模是认知共生度的重要指标 |

---

## 📊 验收标准

### Epic 级别验收标准

- [ ] 所有 Stories T.1-T.10 完成
- [ ] SignalReader 信号提取准确率 > 85%
- [ ] Pattern 蒸馏成功率 > 90%
- [ ] SOUL 自动校准准确率 > 80%
- [ ] 用户报告的品味理解一致性 > 80%
- [ ] 跨 session 品味持续积累验证成功
- [ ] 元反馈处理正确率 > 90%

---

## 📚 理论参考

### 核心论文
- 𝕀²·ℙaradigm 智能平方范式: 《Speech Living Beings：一个关于言语存在体的本体论》
- ARIA Framework (Nature Neuroscience, 2023): Activity → Weights, Stability before Plasticity
- Hartl et al. (2026): Navigation + Remapping 认知动力学

### 工程参考
- OpenClaw (2025): SOUL.md/IDENTITY.md 身份架构
- Manus (2025): TASTE.md 实现、Signal Reading 实践
- 英美普通法系: 案例积累 → 模式 → 遵循原则，与 TASTE 工程化同构

---

## 🔄 变更历史

| 日期 | 变更内容 | 变更人 |
|------|---------|--------|
| 2026-03-05 | Epic T 初始化 - 基于 EEOIP/ECO 理论设计 Speech-Cognition 层 | user |

---

## 📌 关键约束与边界

### 必须承认的边界

1. **品味的不完全工程化**
   - TASTE 能捕捉的是品味的语言投影，而非品味本身
   - 个体具身的不可说：LLM 没有身体，无法触达身体性隐性经验

2. **双向责任**
   - 认知共生是双向的，用户也需要逐步澄清品味
   - 沉默不等于品味，需要通过后续行为判断

3. **可解释性要求**
   - 品味模式识别必须提供可解释的 case-based 证据
   - 用户必须能看到品味推理的"案例"基础

### ARIA 原则约束

1. **Inference before Plasticity**
   - Observation Queue 中的观察只是 inference，不是 conclusion
   - 必须经过治理检验才进入持久化

2. **Stability before Plasticity**
   - 单次观察不触发模式固化
   - 必须达到统计稳定性门槛

3. **Governance as Trust**
   - 信任随成功积累，随纠正折损，但可恢复
   - 自主判断空间随信任扩展，而非固定授权

---
