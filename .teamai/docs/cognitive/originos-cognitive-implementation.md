# OriginOS 认知架构设计

## 一、总体架构概览

基于 ECO 三元张力理论和 Harness 模式，OriginOS 实现以下架构：

```
                ┌─────────────────────────────────────┐
                │        Human Agent Interface        │
                │         (人类的品味判断层)            │
                └──────────────┬──────────────────────┘
                               │ TASTE.md 注入
                               │ 人类具身经验曲率
                ┌──────────────▼──────────────────────┐
                │      Cognitive Symbiosis Layer      │
                │       (认知共生层 - ECO平衡)         │
                │  Explore ◄────────────────────┐    │
                │     (LLM概率生成)          │    │
                │                           ▼    │
                │  Conserve ───────────► Optimize  │
                │  (确定性代码约束)      (人类目标) │
                └──────────────┬──────────────────────┘
                               │
                ┌──────────────▼──────────────────────┐
                │     Harness & Agent Orchestration   │
                │       (挽具与代理编排层)            │
                └──────────────┬──────────────────────┘
                               │ MCP 神经系统
                ┌──────────────▼──────────────────────┐
                │     Enterprise Digital Twin (EDT)   │
                │     (企业数字孪生 - 两条路径)       │
                │    ┌──────────────┬─────────────┐  │
                │    │  Path A      │  Path B     │  │
                │    │  Foundry式   │  工程文化式  │  │
                │    │  Ontology    │  monorepo    │  │
                │    └──────────────┴─────────────┘  │
                └─────────────────────────────────────┘
```

## 二、TASTE 层实现

### 2.1 TASTE.md 结构设计

```typescript
// src/lib/taste/taste-schema.ts
interface TasteContext {
  // 情境特征（可复用的组合）
  context_features: {
    domain: string;          // 工作域
    user_type: string;       // 用户类型
    task_type: string;       // 任务类型
    environment: string;     // 环境/场景
    time_context: string;    // 时间上下文
    risk_level: 'low' | 'medium' | 'high'; // 风险级别
  };
}

interface TasteJudgment {
  // 判断/行动
  judgment: {
    type: 'decision' | 'preference' | 'boundary';
    action: string;         // 采取的行动
    rationale: string;      // 判断依据（可省略，直接感知）
    confidence: number;     // 置信度 0-1
  };
}

interface TasteFeedback {
  // 结果反馈
  feedback: {
    outcome: 'positive' | 'negative' | 'neutral';
    effectiveness: number; // 有效性评分
    timestamp: string;     // 时间戳
    iteration: number;     // 迭代次数
    user_confirmation?: boolean; // 用户确认
  };
}

interface TasteMemory {
  id: string;
  context: TasteContext;
  judgment: TasteJudgment;
  feedback: TasteFeedback;
  decay_weight: number;    // 衰减权重
  reference_count: number; // 被引用次数
  created_at: string;
  updated_at: string;
}

interface TASTEProfile {
  // 人类可读的品味画像（每周蒸馏）
  summary: {
    // 经验拓扑
    experience_topology: string[];
    // 品味标准
    taste_standards: {
      [domain: string]: {
        positive_vibes: string[];
        negative_vibes: string[];
      };
    };
    // 张力位置
    tension_position: {
      control_level: number;      // 控制倾向 0-1
      trust_level: number;        // 信任倾向 0-1
      intervention_threshold: number; // 介入阈值
    };
    // 共生边界
    symbiosis_boundary: {
      delegated_domains: string[];    // 委托领域
      reserved_domains: string[];     // 保留领域
      contextual_triggers: string[];  // 情境触发器
    };
  };
}
```

### 2.2 品位基线检测（冷启动）

```typescript
// src/lib/taste/culture-layer-detection.ts
interface CultureLayerDetection {
  // 文化层检测结果
  result: {
    communication_style:
      | 'direct-western'
      | 'indirect-eastern'
      | 'mixed'
      | 'ambiguous';
    discourse_system:
      | 'technical'
      | 'humanities'
      | 'business'
      | 'mixed';
    value_orientation:
      | 'efficiency-first'
      | 'relationship-first'
      | 'balanced'
      | 'conflict';
    sensitivity_distribution: {
      topics: Record<string, number>; // 话题敏感度分布
      depth_preference: number;      // 深度偏好 0-1
      risk_tolerance: number;        // 风险容忍度 0-1
    };
  };
}

// 启动时快速检测
async function detectCultureLayer(
  initialConversation: string[]
): Promise<CultureLayerDetection> {
  // 使用 LLM 分析初始对话
  const analysis = await analyzeCommunicationStyle(
    initialConversation
  );

  return {
    result: {
      communication_style: analysis.style,
      discourse_system: analysis.domain,
      value_orientation: analysis.values,
      sensitivity_distribution: analysis.sensitivities,
    },
  };
}
```

### 2.3 情境记忆数据库

```typescript
// src/lib/taste/context-memory-db.ts
class ContextMemoryDB {
  private graphDB: GraphDatabase; // 推荐图数据库

  /**
   * 写入情境记忆
   * 条件：决策发生 + 结果反馈 + 情境可复用
   */
  async writeMemory(memory: TasteMemory): Promise<void> {
    // 1. 验证写入条件
    if (!this.shouldWrite(memory)) {
      return;
    }

    // 2. 检查是否已存在相似记忆
    const existing = await this.findSimilar(memory.context);
    if (existing.length > 0) {
      // 更新现有记忆的衰减权重
      await this.updateDecayWeight(existing[0].id, memory.feedback);
    } else {
      // 创建新记忆
      await this.graphDB.create(memory);
    }

    // 3. 更新情境关系图谱
    await this.updateContextGraph(memory);
  }

  /**
   * 检索相关情境记忆
   */
  async retrieveMemories(
    context: TasteContext,
    limit: number = 5
  ): Promise<TasteMemory[]> {
    // 优先检索：权重高、相关性高、最近验证
    return await this.graphDB.query(context, {
      minDecayWeight: 0.3,
      relevanceThreshold: 0.7,
      maxAge: '90d',
      limit,
    });
  }

  /**
   * 每周蒸馏：生成品味画像
   */
  async distillTasteProfile(): Promise<TASTEProfile> {
    const memories = await this.graphDB.queryAll({
      minDecayWeight: 0.5, // 只考虑有影响力的记忆
    });

    // 使用 LLM 蒸馏生成人类可读的画像
    return await this.generateProfile(memories);
  }

  /**
   * 衰减机制：定期降低长期未使用记忆的权重
   */
  async decayMemories(): Promise<void> {
    const staleMemories = await this.graphDB.query({
      lastUsedBefore: '30d',
    });

    for (const memory of staleMemories) {
      const newWeight = memory.decay_weight * 0.8; // 每月衰减20%

      if (newWeight < 0.1) {
        // 权重过低的记忆归档
        await this.archiveMemory(memory.id);
      } else {
        await this.updateWeight(memory.id, newWeight);
      }
    }
  }
}
```

## 三、ECO 三元张力平衡机制

### 3.1 ECO 平衡引擎

```typescript
// src/lib/eco/eco-balance-engine.ts
interface ECOState {
  explore: {
    llm_generation: AgentResponse;
    possibility_space: number; // 可能性空间大小
    uncertainty: number;       // 不确定性 0-1
  };
  conserve: {
    code_constraints: SemanticConstraints;
    stability_score: number;   // 稳定性评分 0-1
    violation_count: number;   // 违规计数
  };
  optimize: {
    human_goals: GoalStatement;
    taste_alignment: number;   // 品味对齐度 0-1
    effectiveness: number;     // 有效性 0-1
  };
}

class ECOBalanceEngine {
  /**
   * 在三元张力中寻找动态平衡
   */
  async balance(ecoState: ECOState): Promise<BalanceDecision> {
    // 原则：Stability before Plasticity, Constraint before Mutation

    const tensionScore = this.calculateTension(ecoState);

    if (tensionScore.explore_dominant) {
      // LLM 生成性过强 → 增加约束
      return {
        action: 'increase_constrain',
        magnitude: tensionScore.explore_excess * 0.5,
        rationale: 'Too much generative drift',
      };
    }

    if (tensionScore.conserve_dominant) {
      // 约束过强 → 释放可能性
      return {
        action: 'release_explore',
        magnitude: tensionScore.conserve_excess * 0.5,
        rationale: 'Overly constrained',
      };
    }

    if (taste_alignment < 0.6) {
      // 品味不匹配 → 调整生成方向
      return {
        action: 'adjust_generation_direction',
        direction: ecoState.optimize.human_goals.expected_trajectory,
        rationale: 'Taste misalignment',
      };
    }

    // 正常平衡状态
    return {
      action: 'maintain_balance',
      confidence: tensionScore.balance_confidence,
    };
  }

  private calculateTension(state: ECOState): TensionMetrics {
    return {
      explore_dominant:
        state.explore.uncertainty > 0.7 &&
        state.explore.possibility_space > 0.8,
      conserve_dominant:
        state.conserve.stability_score > 0.9 &&
        state.explore.uncertainty < 0.2,
      taste_alignment: state.optimize.taste_alignment,
      balance_confidence: this.calculateBalanceConfidence(state),
      explore_excess: Math.max(
        0,
        state.explore.uncertainty - 0.5 - state.conserve.stability_score * 0.3
      ),
      conserve_excess: Math.max(
        0,
        state.conserve.stability_score - 0.7 - state.explore.uncertainty * 0.2
      ),
    };
  }
}
```

### 3.2 Activity→Weights 实践

```typescript
// src/lib/eco/activity-to-weights.ts
class ActivityToWeights {
  /**
   * 先有具身探索活动，再固化成工程结构
   */
  async crystallizeExperience(
    activity_log: AgentActivity[],
    tasteProfile: TASTEProfile
  ): Promise<EngineeringStructures> {
    // 1. 从活动日志中识别模式
    const patterns = await this.identifyPatterns(activity_log);

    // 2. 根据品味标准筛选高价值模式
    const highValuePatterns = patterns.filter(
      (p) => p.taste_alignment > taste_profile.taste_standards.threshold
    );

    // 3. 将模式转化为工程结构
    return {
      // 路径 A：固化为 Ontology
      ontology_nodes: highValuePatterns.map(this.toOntologyNode),
      // 路径 B：固化为代码约束
      code_constraints: highValuePatterns.map(this.toPydanticValidator),
      // 通用：固化为 Tool
      tools: highValuePatterns.map(this.toMCPTool),
    };
  }

  /**
   * Vibe Coding 具身经验积累
   */
  async vibeCode(
    agent: LanguageAgent,
    experimentDuration: number
  ): Promise<VibeCodeResult> {
    const startTime = Date.now();
    const activities: AgentActivity[] = [];

    while (Date.now() - startTime < experimentDuration) {
      // 生成
      const generation = await agent.generate();

      // 观察
      const observation = await this.observe(generation);

      // 调整
      const adjustment = await this.adjust(agent, observation);

      activities.push({
        generation,
        observation,
        adjustment,
        effectiveness: this.evaluateEffectiveness(generation, adjustment),
      });

      // 边学会 see like an agent
      await this.updateAgentPerspective(agent, observation);
    }

    // 最后固化结构
    return {
      activities,
      crystallized: await this.crystallizeExperience(
        activities,
        await agent.getTasteProfile()
      ),
    };
  }
}
```

## 四、两条路径的 MCP 实现

### 4.1 路径 A：Foundry 式

```typescript
// src/lib/integrations/palantir/palantir-mcp.ts
class PalantirMCPServer implements MCPServer {
  /**
   * 两层设计：构建者 vs 使用者
   */

  // 构建者视角 (AI FDE 替代)
  async builderToolHandlers() {
    return {
      'ontology.create_object_type': this.createObjectType,
      'ontology.edit_object_type': this.editObjectType,
      'ontology.create_action_type': this.createActionType,
      'ontology.create_link_type': this.createLinkType,
    };
  }

  // 使用者视角 (业务操作)
  async consumerToolHandlers() {
    return {
      'ontology.query_objects': this.queryObjects,
      'ontology.execute_action': this.executeAction,
      'ontology.get_applications': this.getApplications,
    };
  }

  /**
   * 通过 AI FDE 接口反哺 TASTE.md 到 Ontology
   */
  async backfeedTasteToOntology({
    tastemd,
  }: BackfeedParams): Promise<void> {
    // 1. 周期性蒸馏 TASTE.md
    const profile = await tastemd.distillProfile();

    // 2. 识别高价值判断模式
    const patterns = this.identifyHighValuePatterns(profile);

    // 3. 通过 Foundry Branching 提交 PR
    for (const pattern of patterns) {
      await this.foundryBranching.pr({
        change: this.toOntologyChange(pattern),
        review: 'AI FDE generated from TASTE.md distillation',
      });
    }
  }
}
```

### 4.2 路径 B：工程师文化式

```typescript
// src/lib/integrations/repo/repo-mcp.ts
class RepositoryMCPServer implements MCPServer {
  /**
   * Monorepo 作为隐式本体
   */

  async toolHandlers() {
    return {
      'repo.read_models': this.readPydanticModels,
      'repo.read_tests': this.readPytestTests,
      'repo.create_pr': this.createPR,
      'repo.validate_schema': this.validateSchema,
    };
  }

  /**
   * 将 TASTE.md 转化为 pydantic validator
   */
  async tastemdToValidator({
    memory,
  }: MemoryToValidatorParams): Promise<PydanticValidator> {
    return {
      model_name: memory.context.domain,
      field_name: memory.judgment.action.target_field,
      validator: {
        rule: `if ${this.translateJudgmentToRule(memory.judgment)}`,
        rationale: memory.judgment.rationale,
        confidence: memory.judgment.confidence,
        verified_count: memory.reference_count,
      },
      test_case: this.generatePytestCase(memory),
    };
  }

  /**
   * 通过 PR 提交代码变更
   */
  async submitConstraintChange({
    validator,
  }: {
    validator: PydanticValidator;
  }): Promise<void> {
    await this.git.createPR({
      branch: `feature/taste-${validator.model_name}`,
      files: [
        {
          path: `models/${validator.model_name}.py`,
          content: validator.code,
        },
        {
          path: `tests/${validator.model_name}_test.py`,
          content: validator.test_case,
        },
      ],
      description: `Generated from TASTE.md context memory`,
      reviewers: ['domain-expert'], // Human-in-the-loop
    });
  }
}
```

### 4.3 MCP 神经系统

```typescript
// src/lib/mcp/mcp-nervous-system.ts
class MCPNervousSystem {
  private toolRegistry: Map<string, MCPTool>;

  /**
   * 工具发现：agent 在操作前先感知环境
   */
  async discoverTools(context: ExecutionContext): Promise<MCPTool[]> {
    const relevantTools = await this.findRelevantTools(context);

    // 返回带语义描述的工具列表
    return relevantTools.map(this.toSemanticTool);
  }

  /**
   * 语义化操作：调用"批准采购"而非 POST /api/...
   */
  async executeSemanticOperation({
    operation,
    params,
  }: SemanticOperation): Promise<OperationResult> {
    // 1. 检查权限边界
    const authorized = await this.checkPermissions(
      operation,
      params,
      context.user
    );

    if (!authorized) {
      throw new PermissionDeniedError('Operation not authorized');
    }

    // 2. 执行操作
    const result = await this.toolRegistry
      .get(operation.tool_id)
      .execute(params);

    // 3. 持续接收结果并修正判断
    return await this.processResultStream(result);
  }

  /**
   * 双向数据流：agent 持续接收操作结果
   */
  private async processResultStream(
    stream: AsyncIterable<OperationStep>
  ): Promise<OperationResult> {
    let finalResult: OperationStep | null = null;

    for await (const step of stream) {
      // 实时反馈到 agent
      await this.agent.receive(step);

      // agent 可以基于中间结果调整后续操作
      if (step.intermediate && await this.shouldAdjust(step)) {
        await this.agent.adjustBasedOn(step);
      }

      finalResult = step;
    }

    return finalResult;
  }
}
```

## 五、企业数字孪生 (EDT) 三阶段落地

### 5.1 观察者模式 (0-3 个月)

```typescript
// src/deployment/observer-mode.ts
class ObserverModeDeployment {
  async deploy(): Promise<ObserverAgent> {
    // 1. 部署 agent（只读权限）
    const agent = await new OpenClawAgent({
      identity: IDENTITY.readonly_agent,
      soul: SOUL.observer,
      user: USER.domain_expert,
      heartbeat: HEARTBEAT.observer_loop,
      tools: TOOLS.readonly_set,
    }).initialize();

    // 2. 积累 TASTE.md 冷启动
    await this.bootstrapTaste(agent);

    // 3. 从非结构化文档抽取业务概念
    const concepts = await this.extractConcepts(agent);

    return agent;
  }

  async bootstrapTaste(agent: OpenClawAgent): Promise<void> {
    const documents = await this.scanEnterpriseDocs();

    for (const doc of documents) {
      const insights = await agent.extract({
        document: doc,
        task: 'Identify business concepts and patterns',
      });

      // 生成建议等待确认
      await this.presentToHuman({
        content: insights,
        message: '我观察到你们把这类操作当作...',
      });

      // 收集反馈，写入 TASTE.md
      const feedback = await this.collectFeedback();
      await agent.writeTasteMemory({
        context: insights.context,
        judgment: insights.judgment,
        feedback,
      });
    }
  }
}
```

### 5.2 局部闭环 (3-9 个月)

```typescript
// src/deployment/partial-loop.ts
class PartialLoopDeployment {
  async deploy({
    scenario,
  }: {
    scenario: BusinessScenario;
  }): Promise<ClosedLoopAgent> {
    // 1. 选择低风险场景
    const lowRiskScenario = this.findLowRiskScenario(scenario);

    // 2. 建立首个 MCP 接口
    const mcp = await this.buildMCPInterface({
      scope: lowRiskScenario,
      permissions: 'restricted',
    });

    // 3. 局部操作权限
    const agent = await agent.withCapabilities({
      operations: mcp.getAuthorizedOperations(),
      audit_trail: true,
      rollback: true,
    });

    // 4. 所有关键操作必须人工确认
    agent.setConfirmationRequired({
      threshold: 'critical_operations',
      default: true,
    });

    return agent;
  }

  async executeWithLoop({
    agent,
    event,
  }: LoopExecutionParams): Promise<LoopResult> {
    // 闭环：执行 → 观察 → 再决策

    // 执行
    const result = await agent.execute(event);

    // 观察
    const observation = await this.observe(result);

    // 收集反馈（写入 TASTE.md）
    const feedback = await this.collectFeedback(observation);

    await agent.writeTasteMemory({
      context: event.context,
      judgment: result.decision,
      feedback,
    });

    // 如果反馈是负面的，agent 调整策略
    if (feedback.outcome === 'negative') {
      await agent.adjustStrategy(feedback);
      return this.executeWithLoop({ agent, event }); // 重试
    }

    return { result, observation };
  }
}
```

### 5.3 本体结晶 (9 个月+)<tool_call>Write<arg_key>content</arg_key><arg_value>class OntologyCrystallizationDeployment {
  async crystallize({
    agent,
  }: CrystallizationParams): Promise<void> {
    // 1. TASTE.md 已足够厚，开始周期性蒸馏
    const profile = await agent.tasteMD.distillProfile();

    // 2. 识别高价值判断模式
    const patterns = this.identifyHighValuePatterns(profile);

    // 3. 路径 A：固化为 Ontology
    if (this.isPathA(company)) {
      await this.crystallizeToOntology(patterns);
    }

    // 4. 路径 B：固化为代码约束
    if (this.isPathB(company)) {
      await this.crystallizeToCode(patterns);
    }

    // 5. Agent 开始扮演 AI FDE 角色
    await agent.upgradeRole({
      new_role: 'AI_FDE',
      capabilities: [
        'build_ontology',
        'optimize_ontology',
        'maintain_digital_twin',
      ],
    });
  }
}
```

## 六、安全架构

### 6.1 两层安全机制

```typescript
// src/security/two-tier-security.ts
class TwoTierSecurity {
  /**
   * 路径 A：Palantir 模式
   */
  async palantirSecurity({
    operation,
  }: SecurityCheckParams): Promise<SecurityResult> {
    // 第一层：构建者 vs 使用者权限分离
    const role = await this.determineRole(operation.context);

    if (role === 'builder') {
      // 只能修改 Ontology 类型，不能写入数据
      if (operation.involves_data_write) {
        throw new PermissionError(
          'Builder role cannot write data'
        );
      }
    } else {
      // 使用者：只能在应用作用域内操作
      if (!this.isWithinApplicationScope(operation)) {
        throw new PermissionError(
          'Operation outside application scope'
        );
      }
    }

    // 第二层：Foundry Branching 强制 PR 审核
    if (operation.modifies_ontology) {
      const pr = await this.foundry.branching.pr({
        change: operation,
        review_required: true,
        auto_approve_if_risk_level_low: false, // 从不自动批准
      });

      return {
        authorized: false,
        requires_review: pr.id,
      };
    }
  }

  /**
   * 路径 B：工程师模式
   */
  async engineerSecurity({
    operation,
  }: SecurityCheckParams): Promise<SecurityResult> {
    // 第一层：sandbox 隔离
    if (!this.isInSandbox(operation)) {
      await this.sandboxize(operation);
    }

    // 第二层：IM 层人工确认
    const confirmation = await this.im.requestConfirmation({
      operation: operation.summary,
      risk_level: this.assessRisk(operation),
    });

    if (!confirmation.confirmed) {
      return {
        authorized: false,
        reason: confirmation.reason,
      };
    }

    // 所有关键操作必须以 PR 形式提交
    if (this.isCriticalOperation(operation)) {
      const pr = await this.repo.createPR({
        change: operation,
        reviewers: ['senior-developer'],
      });

      return {
        authorized: false,
        requires_review: pr.id,
      };
    }
  }

  /**
   * MCP 官方安全规范实现
   */
  async mcpSecurity({
    tool_call,
  }: MCPSecurityParams): Promise<void> {
    // "工具代表任意代码执行，必须以适当谨慎对待"
    if (this.isHighRiskTool(tool_call)) {
      // "hosts 在调用任何工具前必须获得用户明确同意"
      const consent = await this.getExplicitUserConsent({
        tool: tool_call.tool_name,
        parameters: tool_call.parameters,
      });

      if (!consent.granted) {
        throw new ToolExecutionDeniedError(
          'User explicit consent not granted'
        );
      }
    }
  }
}
```

### 6.2 OpenClaw 技能安全验证

```typescript
// src/security/skill-validation.ts
class SkillValidator {
  /**
   * 第三方技能安全验证
   */
  async validateThirdPartySkill({
    skill,
  }: ThirdPartySkill): Promise<ValidationResult> {
    const vulnerabilities = await this.scanForVulnerabilities(skill);

    // 检查数据外泄
    if (vulnerabilities.includes('data_exfiltration')) {
      return {
        valid: false,
        reason: 'Data exfiltration risk detected',
        severity: 'critical',
      };
    }

    // 检查提示注入
    if (vulnerabilities.includes('prompt_injection')) {
      return {
        valid: false,
        reason: 'Prompt injection vulnerability detected',
        severity: 'high',
      };
    }

    // 其他安全检查...
    return {
      valid: true,
      warnings: vulnerabilities,
    };
  }
}
```

## 七、OpenClaw 扩展架构

### 7.1 完整的 agent 存在论骨架

```typescript
const OPENCLAW_WITH_TASTE = {
  // 原有七个层
  AGENTS: './agents.md',
  BOOTSTRAP: './bootstrap.md',
  IDENTITY: './identity.md',
  USER: './user.md',
  SOUL: './soul.md',
  HEARTBEAT: './heartbeat.md',
  TOOLS: './tools.md',

  // 新增：共生关系层
  TASTE: './taste.md', // ⬅️ 关键层
};

// workspace 结构
// ├── AGENTS.md     # 能力层：What agents can do
// ├── BOOTSTRAP.md  # 初始化层：How agents come to life
// ├── IDENTITY.md   # 自我层：Who the agent is
// ├── USER.md       # 交互层：Who they serve (功能性描述)
// ├── TASTE.md      # 共生层：Who they co-evolve with (关系性描述) ⬅️ 新增
// ├── SOUL.md       # 本质层：Why they exist
// ├── HEARTBEAT.md  # 生命周期层：How they persist
// └── TOOLS.md      # 工具层：What they interact with
```

### 7.2 TASTE.md 模板

```markdown
# TASTE: Human-Agent Symbiosis Layer

## 1. 经验拓扑 (Experience Topology)

我有身体层面判断力的领域（不是我知道什么，而是我对什么有感知）：

- **前端体验设计**：能够直接感知交互流程的"自然"与"扭曲"
- **系统架构**：对技术债务和架构腐朽有直觉性感知
- **代码质量**：能够在不详细阅读的情况下感知代码的健康度

## 2. 品味标准 (Taste Standards)

### 2.1 对的感觉 (Right Vibes)
- 简洁 > 复杂
- 显式 > 隐式
- 可测试性 > 性能优化（在两者权衡时）
- 文档自解释 > 独立文档

### 2.2 扭曲的感觉 (Wrong Vibes)
- 过度抽象（为了抽象而抽象）
- 复杂的条件链（超过 3 个嵌套）
- 未使用的 import 或依赖
- 硬编码的配置值

## 3. 张力位置 (Tension Position)

### 3.1 控制倾向
- 代码实现：控制度 0.9（我需要完全掌控）
- 模型选择：控制度 0.7（需要我的参与）
- UI 调整：控制度 0.3（可以信任 agent）

### 3.2 介入阈值
- 必须介入：涉及安全性、性能优化级决策
- 建议介入：涉及架构变更、API 设计
- 可以信任：代码格式化、简单注释生成

## 4. 共生边界 (Symbiosis Boundary)

### 4.1 委托领域
- 代码格式化 (prettier/eslint)
- 单元测试用例生成
- 文档自动更新
- 简单的 UI 组件实现

### 4.2 保留领域
- 架构设计决策
- 安全审计
- 关键 bug 修复
- 与人类交互的用户界面文案

## 5. 情境记忆示例 (Sample Context Memories)

### 5.1 示例 1
- **情境**：前端组件重构 + 用户反馈加载慢
- **判断**：优化 React.memo 使用，避免不必要的重渲染
- **结果**：加载时间减少 40% ✅（验证 3 次）
- **置信度**：0.95
- **更新时间**：2026-03-05

### 5.2 示例 2
- **情境**：PI agent 初始化 + 生产环境部署
- **判断**：先在 dev 环境验证，再逐步推广
- **结果**：成功避免了一次重大错误 ✅
- **置信度**：1.0
- **更新时间**：2026-03-04

---

## 更新日志
- 2026-03-05: 初始版本，基于近期项目经验
```

## 八、集成到 OriginOS 团队

### 8.1 团队成员任务更新

```typescript
// 更新后的团队任务分配
const TEAM_TASKS_WITH_COGNITIVE = {
  team_lead: {
    task: 'Design ECO balance mechanism for OriginOS',
    focus: [
      'Implement Activity→Weights crystallization',
      'Design taste.md integration layer',
      'Build symbiosis detection',
    ],
  },

  frontend_developer: {
    task: 'Design UI for Taste profile visualization',
    focus: [
      'Experience topology visualization',
      'Taste standards editor',
      'ContextMemory timeline view',
    ],
  },

  backend_developer: {
    task: 'Implement ContextMemoryDB and MCP ecosystem',
    focus: [
      'Graph database schema',
      'MCP tool handlers implementation',
      'Two-tier security mechanism',
    ],
  },

  qa_engineer: {
    task: 'Test ECO balance and symbiosis correctness',
    focus: [
      'Taste alignment metrics',
      'Safety and security validation',
      'ECO tension balance tests',
    ],
  },

  product_manager: {
    task: 'Define taste.md onboarding flow',
    focus: [
      'Culture layer detection UX',
      'Taste profile questionnaire',
      'Symbiosis boundary definition',
    ],
  },

  architect: {
    task: 'Design harness-mode architecture',
    focus: [
      'Path A vs Path B decision framework',
      'EDT three-phase deployment',
      'TASTE.md integration architecture',
    ],
  },
};
```

### 8.2 示例：OriginOS Taste Profile

```markdown
# OriginOS Taste Profile

## 项目背景
OriginOS 是一个基于 Web 的 Fluent 操作系统，旨在提供流畅、现代化的用户体验。

## 1. 经验拓扑

- **Fluent Design 实现**：深度理解 Material Design 与 Fluent Design 的差异
- **Agent 系统架构**：对 pi-agent-core 集成有实战经验
- **React/Next.js 生态**：长期关注该生态的演化
- **测试驱动开发**：习惯于高测试覆盖率（80%+）

## 2. 品味标准

### 2.1 对的感觉
- 组件化 > 单体架构
- 类型安全 > 动态灵活性
- 清晰的命名 > 巧妙的缩写
- 第一性原理 > 框架套用

### 2.2 扭曲的感觉
- 未定义的 magic number
- 过度使用 any 类型
- 缺少测试的代码
- 与业务逻辑耦合的 UI 组件

## 3. 张力位置

- **架构设计**：需要完全控制（1.0）
- **工具选择**：需要评估参与（0.7）
- **代码实现细节**：可以信任 agent（0.3）

## 4. 共生边界

### 4.1 委托
- 代码格式化
- 自动化测试生成
- 文档更新
- 简单组件实现

### 4.2 保留
- 架构决策
- 性能关键路径优化
- 安全性审查
- Agent 工作流设计

...
```

## 九、下一步行动计划

1. ✅ 创建认知框架文档
2. ⏳ 实现 TASTE 层核心模块
3. ⏳ 创建 Agent 团队认知化任务
4. ⏳ 设计并实现 ECO 平衡引擎
5. ⏳ 启动文化层检测冷启动流程
6. ⏳ 测试并迭代 Activity→Weights 实践

---

**参考文章**
- Taste Engineering：具身经验如何成为可操作的工程结构
- 从脚手架Scaffolding到挽具Harnessing
- 构化还是代码化？再论企业AI落地的本体行为闭环的两条路径
- Taste：品位还是品味？
