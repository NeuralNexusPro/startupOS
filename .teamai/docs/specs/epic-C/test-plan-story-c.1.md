# Story C.1 测试计划: 文化检测 (Culture Detection + TASTE Draft)

**测试负责人:** QA Engineer
**创建日期:** 2026-03-07
**测试范围:** Phase 1 C.1 - 用户维度文化检测
**状态:** 待执行 (Implementation 未开始)

---

## 0. 测试范围摘要

### 核心测试目标
通过 3-5 轮对话隐性抽取用户品味，生成 TASTE Profile 草稿，验证：

| 测试类型 | 覆盖范围 | 优先级 |
|---------|---------|-------|
| 单元测试 | CultureSessionService, CultureDetectionService | P0 |
| 集成测试 | 3-5 轮对话端到端流程 | P0 |
| 性能测试 | LLM 分析 < 5秒, API 响应 < 1秒 | P1 |
| 验收测试 | 品味抽取准确率 > 60% | P1 |

### 测试原则
1. **风险导向测试** - 优先测试高影响、高风险的代码路径
2. **数据支撑质量门** -验收标准必须有可量化的指标
3. **单元 > 集成 > E2E** - 先确保单元质量，再向上验证

---

## 1. 单元测试计划

### 1.1 CultureSessionService

#### 测试文件路径
`src/lib/features/culture/__tests__/culture-session-service.test.ts`

#### 测试用例

```typescript
describe('CultureSessionService', () => {
  describe('startDetection()', () => {
    it('应该创建新的检测会话并返回有效的 sessionId', async () => {
      const service = new CultureSessionService();
      const request = {
        projectId: 'test-project',
        userId: 'test-user',
        maxRounds: 3,
      };

      const session = await service.startDetection(request);

      expect(session.sessionId).toBeDefined();
      expect(session.projectId).toBe('test-project');
      expect(session.currentRound).toBe(0);
      expect(session.maxRounds).toBe(3);
      expect(session.status).toBe('active');
    });

    it('应该使用默认 maxRounds = 3 当未提供时', async () => {
      const service = new CultureSessionService();
      const request = {
        projectId: 'test-project',
      };

      const session = await service.startDetection(request);

      expect(session.maxRounds).toBe(3);
    });

    it('应该存储会话到 data/culture/{sessionId}.json', async () => {
      const service = new CultureSessionService();
      const request = { projectId: 'test-project' };

      const session = await service.startDetection(request);

      // 验证文件已创建
      const filePath = `data/culture/${session.sessionId}.json`;
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('应该为同一项目创建唯一 sessionId', async () => {
      const service = new CultureSessionService();
      const request = { projectId: 'test-project' };

      const session1 = await service.startDetection(request);
      const session2 = await service.startDetection(request);

      expect(session1.sessionId).not.toBe(session2.sessionId);
    });
  });

  describe('addMessage()', () => {
    it('应该添加用户消息并返回 agent 响应', async () => {
      const service = new CultureSessionService();
      const session = await service.startDetection({ projectId: 'test' });

      const response = await service.addMessage(
        session.sessionId,
        '我喜欢代码简洁清晰的风格'
      );

      expect(response.message).toBeDefined();
      expect(response.round).toBeGreaterThan(0);
      expect(typeof response.isComplete).toBe('boolean');
    });

    it('应该更新 currentRound 计数器', async () => {
      const service = new CultureSessionService();
      const session = await service.startDetection({ projectId: 'test' });

      await service.addMessage(session.sessionId, '第一轮消息');
      const updatedSession = await service.getSession(session.sessionId);

      expect(updatedSession.currentRound).toBe(1);
    });

    it('应该支持多轮对话（最多 maxRounds）', async () => {
      const service = new CultureSessionService();
      const session = await service.startDetection({ projectId: 'test', maxRounds: 3 });

      // Round 1
      await service.addMessage(session.sessionId, '第一轮');
      // Round 2
      await service.addMessage(session.sessionId, '第二轮');
      // Round 3
      const response = await service.addMessage(session.sessionId, '第三轮');

      expect(response.round).toBe(3);
    });

    it('应该记录完整对话历史（user + assistant）', async () => {
      const service = new CultureSessionService();
      const session = await service.startDetection({ projectId: 'test' });

      await service.addMessage(session.sessionId, '用户消息');
      const updatedSession = await service.getSession(session.sessionId);

      expect(updatedSession.dialogue).toHaveLength(2); // user + assistant
      expect(updatedSession.dialogue[0].role).toBe('user');
      expect(updatedSession.dialogue[1].role).toBe('assistant');
    });

    it('应该为每条消息记录时间戳', async () => {
      const service = new CultureSessionService();
      const session = await service.startDetection({ projectId: 'test' });

      await service.addMessage(session.sessionId, '消息');
      const updatedSession = await service.getSession(session.sessionId);

      expect(updatedSession.dialogue[0].timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
      );
    });

    it('当达到 maxRounds 时 shouldAnalyze 应该返回 true', async () => {
      const service = new CultureSessionService();
      const session = await service.startDetection({ projectId: 'test', maxRounds: 3 });

      // 模拟 2 轮对话（user + assistant = 4 条消息）
      // shouldAnalyze 逻辑: minRounds * 2 = 2 * 2 = 4 条消息
      await service.addMessage(session.sessionId, '第一轮');
      await service.addMessage(session.sessionId, '第二轮');

      expect(service.shouldAnalyze(session)).toBe(true);
    });
  });

  describe('analyzeCulture()', () => {
    it('应该返回有效的 CultureLayerDetection 结果', async () => {
      const service = new CultureSessionService();
      const session = await service.startDetection({ projectId: 'test' });

      // 添加足够的对话
      await service.addMessage(session.sessionId, '第一轮消息');
      await service.addMessage(session.sessionId, '第二轮消息');

      const result = await service.analyzeCulture(session.sessionId);

      expect(result).toHaveProperty('result');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('summary');
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('应该抽取 experience_topology', async () => {
      const service = new CultureSessionService();
      const session = await service.startDetection({ projectId: 'test' });

      await service.addMessage(session.sessionId, '我主要负责代码评审和架构设计');
      await service.addMessage(session.sessionId, '我经常做集成测试');

      const result = await service.analyzeCulture(session.sessionId);

      expect(result.result.experience_topology).toBeDefined();
      expect(Array.isArray(result.result.experience_topology)).toBe(true);
    });

    it('应该抽取 taste_standards', async () => {
      const service = new CultureSessionService();
      const session = await service.startDetection({ projectId: 'test' });

      await service.addMessage(session.sessionId, '评审时我喜欢看到具体的建议');
      await service.addMessage(session.sessionId, '我讨厌只指出格式问题的评审');

      const result = await service.analyzeCulture(session.sessionId);

      expect(result.result.taste_standards).toBeDefined();
      expect(typeof result.result.taste_standards).toBe('object');
    });

    it('应该包含 tension_position（可选）', async () => {
      const service = new CultureSessionService();
      const session = await service.startDetection({ projectId: 'test' });

      await service.addMessage(session.sessionId, '我偏好保持一定的控制权');
      await service.addMessage(session.sessionId, '在关键时刻我希望自己决定');

      const result = await service.analyzeCulture(session.sessionId);

      // tension_position 是可选的，但如果存在应该验证结构
      if (result.result.tension_position) {
        expect(result.result.tension_position.control_level).toBeDefined();
        expect(result.result.tension_position.trust_level).toBeDefined();
        expect(result.result.tension_position.intervention_threshold).toBeDefined();
      }
    });

    it('应该更新 session 状态为 completed', async () => {
      const service = new CultureSessionService();
      const session = await service.startDetection({ projectId: 'test' });

      await service.addMessage(session.sessionId, '消息');
      await service.analyzeCulture(session.sessionId);

      const updatedSession = await service.getSession(session.sessionId);
      expect(updatedSession.status).toBe('completed');
    });
  });

  describe('getTasteDraft()', () => {
    it('应该返回 TASTE Profile 草稿', async () => {
      const service = new CultureSessionService();
      const session = await service.startDetection({ projectId: 'test' });

      await service.addMessage(session.sessionId, '第一轮');
      await service.addMessage(session.sessionId, '第二轮');
      await service.analyzeCulture(session.sessionId);

      const draft = await service.getTasteDraft(session.sessionId);

      expect(draft).toBeDefined();
      expect(draft.version).toBe('1.0.0');
      expect(draft.projectId).toBe('test');
    });

    it('应该在不存在时返回 null', async () => {
      const service = new CultureSessionService();
      const session = await service.startDetection({ projectId: 'test' });

      const draft = await service.getTasteDraft(session.sessionId);

      expect(draft).toBeNull();
    });
  });
});
```

---

### 1.2 CultureDetectionService

#### 测试文件路径
`src/lib/features/culture/__tests__/culture-detection-service.test.ts`

#### 测试用例

```typescript
describe('CultureDetectionService', () => {
  describe('LLM 抽取功能', () => {
    it('应该从对话中抽取 experience_topology', async () => {
      const service = new CultureDetectionService();
      const dialogue = [
        { role: 'user' as const, content: '我主要负责代码评审', round: 1 },
        { role: 'assistant' as const, content: '了解了', round: 1 },
        { role: 'user' as const, content: '我也经常做架构设计', round: 2 },
        { role: 'assistant' as const, content: '好的', round: 2 },
      ];

      const result = await service.extractFromDialogue(dialogue);

      expect(result.experience_topology).toContain('code-review');
      expect(result.experience_topology).toContain('architecture-design');
    });

    it('应该抽取 positive_vibes 和 negative_vibes', async () => {
      const service = new CultureDetectionService();
      const dialogue = [
        {
          role: 'user' as const,
          content: '我在代码评审中喜欢看到具体的建议和解释原因',
          round: 1,
        },
        {
          role: 'user' as const,
          content: '讨厌那些只指出格式问题但忽略逻辑的评审',
          round: 2,
        },
      ];

      const result = await service.extractFromDialogue(dialogue);

      const codeReviewStandards = result.taste_standards['code-review'];
      expect(codeReviewStandards).toBeDefined();
      expect(codeReviewStandards.positive_vibes.length).toBeGreaterThan(0);
      expect(codeReviewStandards.negative_vibes.length).toBeGreaterThan(0);
    });

    it('应该推断 tension_position 值', async () => {
      const service = new CultureDetectionService();
      const dialogue = [
        {
          role: 'user' as const,
          content: '我希望在关键决策上保留控制权',
          round: 1,
        },
        {
          role: 'user' as const,
          content: '对于简单的任务，我可以信任系统自动处理',
          round: 2,
        },
      ];

      const result = await service.extractFromDialogue(dialogue);

      expect(result.tension_position).toBeDefined();
      expect(result.tension_position.control_level).toBeGreaterThanOrEqual(0);
      expect(result.tension_position.control_level).toBeLessThanOrEqual(1);
      expect(result.tension_position.trust_level).toBeGreaterThanOrEqual(0);
      expect(result.tension_position.trust_level).toBeLessThanOrEqual(1);
    });

    it('应该计算合理的 confidence 值', async () => {
      const service = new CultureDetectionService();
      const dialogue = [
        // 3 轮对话，6 条消息
        { role: 'user' as const, content: '消息1', round: 1 },
        { role: 'assistant' as const, content: '响应1', round: 1 },
        { role: 'user' as const, content: '消息2', round: 2 },
        { role: 'assistant' as const, content: '响应2', round: 2 },
        { role: 'user' as const, content: '消息3', round: 3 },
        { role: 'assistant' as const, content: '响应3', round: 3 },
      ];

      const result = await service.extractFromDialogue(dialogue);

      // 对于 3 轮对话，confidence 应该在合理范围内
      expect(result.confidence).toBeGreaterThan(0.3);
      expect(result.confidence).toBeLessThanOrEqual(0.9);
    });

    it('应该生成摘要说明', async () => {
      const service = new CultureDetectionService();
      const dialogue = [
        { role: 'user' as const, content: '测试消息', round: 1 },
        { role: 'assistant' as const, content: '测试响应', round: 1 },
      ];

      const result = await service.extractFromDialogue(dialogue);

      expect(result.summary).toBeDefined();
      expect(typeof result.summary).toBe('string');
      expect(result.summary.length).toBeGreaterThan(0);
    });
  });

  describe('错误处理', () => {
    it('应该处理 LLM 响应解析失败的情况', async () => {
      const service = new CultureDetectionService();
      // Mock LLM 返回无效 JSON
      vi.spyOn(service, 'callLLM').mockResolvedValue('invalid json');

      const dialogue = [
        { role: 'user' as const, content: '测试', round: 1 },
      ];

      const result = await service.extractFromDialogue(dialogue);

      // 应该返回默认值而不是抛出错误
      expect(result).toBeDefined();
      expect(result.experience_topology).toEqual([]);
    });

    it('应该处理空对话的情况', async () => {
      const service = new CultureDetectionService();

      const result = await service.extractFromDialogue([]);

      expect(result.experience_topology).toEqual([]);
      expect(result.confidence).toBe(0);
    });
  });
});
```

---

### 1.3 TASTE Profile JSON 生成

#### 测试文件路径
`src/lib/features/culture/__tests__/taste-draft-builder.test.ts`

#### 测试用例

```typescript
import { validateTASTEProfile } from '@/lib/taste/taste-schema';

describe('TASTE Draft Builder', () => {
  describe('JSON 生成正确性', () => {
    it('应该生成符合 schema 的完整 TASTE Profile', async () => {
      const builder = new TasteDraftBuilder();
      const analysisResult = {
        result: {
          experience_topology: ['code-review', 'architecture-design'],
          taste_standards: {
            'code-review': {
              positive_vibes: ['constructive feedback'],
              negative_vibes: ['nitpicking'],
            },
          },
          tension_position: {
            control_level: 0.6,
            trust_level: 0.5,
            intervention_threshold: 0.7,
          },
        },
        confidence: 0.75,
        summary: '测试摘要',
      };

      const profile = builder.buildDraft(analysisResult, 'test-project');

      // 验证 schema
      const validated = validateTASTEProfile(profile);
      expect(validated).toBeDefined();
    });

    it('应该包含所有必需字段', () => {
      const profile = {
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        projectId: 'test',
        summary: {
          experience_topology: [],
          taste_standards: {},
          tension_position: {
            control_level: 0.5,
            trust_level: 0.5,
            intervention_threshold: 0.7,
          },
          symbiosis_boundary: {
            delegated_domains: [],
            reserved_domains: [],
            contextual_triggers: [],
          },
        },
        memory_stats: {
          total_memories: 0,
          high_confidence_count: 0,
          avg_confidence: 0,
        },
        trust_score: {
          successful_actions: 0,
          total_actions: 0,
          user_confirms: 0,
        },
      };

      expect(profile.version).toBe('1.0.0');
      expect(profile.createdAt).toBeDefined();
      expect(profile.projectId).toBeDefined();
      expect(profile.summary).toBeDefined();
    });

    it('应该自动生成 createdAt 时间戳', () => {
      const builder = new TasteDraftBuilder();
      const profile = builder.buildDraft(
        {
          result: {
            experience_topology: [],
            taste_standards: {},
          },
          confidence: 0.5,
          summary: 'test',
        },
        'test-project'
      );

      expect(profile.createdAt).toMatchIso8601();
    });

    it('应该初始化 memory_stats 和 trust_score 为零值', () => {
      const builder = new TasteDraftBuilder();
      const profile = builder.buildDraft(
        {
          result: {
            experience_topology: [],
            taste_standards: {},
          },
          confidence: 0.5,
          summary: 'test',
        },
        'test-project'
      );

      expect(profile.memory_stats.total_memories).toBe(0);
      expect(profile.trust_score.successful_actions).toBe(0);
    });
  });

  describe('Phase 3 架构兼容性', () => {
    it('应该支持未来扩展到 full TASTE Profile', () => {
      // Phase 1 生成的 draft 应该是 Phase 3 完整结构的子集
      const draft = {
        version: '1.0.0',
        summary: {
          experience_topology: ['code-review'],
          taste_standards: {
            'code-review': {
              positive_vibes: ['exact'],
            },
          },
          tension_position: {
            control_level: 0.6,
          },
          symbiosis_boundary: {
            delegated_domains: [],
            reserved_domains: [],
            contextual_triggers: [],
          },
        },
      };

      // 验证所有 Phase 3 必需字段都存在
      const requiredFields = [
        'version',
        'summary',
        'summary.experience_topology',
        'summary.taste_standards',
        'summary.tension_position',
        'summary.symbiosis_boundary',
      ];

      requiredFields.forEach((field) => {
        const value = field.split('.').reduce((obj, key) => obj?.[key], draft);
        expect(value).toBeDefined();
      });
    });
  });
});
```

---

## 2. 集成测试计划

### 2.1 端到端 3-5 轮对话流程

#### 测试文件路径
`src/lib/features/culture/__tests__/culture-detection-e2e.test.ts`

#### 测试用例

```typescript
describe('Culture Detection E2E Integration', () => {
  describe('3 轮对话流程', () => {
    it('应该完成完整的 3 轮对话并生成 TASTE 草稿', async () => {
      const service = new CultureSessionService();

      // Step 1: 启动会话
      const session = await service.startDetection({
        projectId: 'test-project',
        maxRounds: 3,
      });

      // Step 2: 3 轮对话
      const responses = [];
      responses.push(await service.addMessage(session.sessionId, '我主要负责代码评审，我喜欢看到具体的建议和解释'));
      responses.push(await service.addMessage(session.sessionId, '我也经常做架构设计，偏好渐进式重构'));
      responses.push(await service.addMessage(session.sessionId, '对于简单任务我可以信任系统，但关键决策我要自己决定'));

      // Step 3: 分析
      const analysis = await service.analyzeCulture(session.sessionId);

      // Step 4: 获取 TASTE 草稿
      const draft = await service.getTasteDraft(session.sessionId);

      // 验证
      expect(analysis.result.experience_topology.length).toBeGreaterThan(0);
      expect(Object.keys(analysis.result.taste_standards).length).toBeGreaterThan(0);
      expect(draft).toBeDefined();
      expect(draft.projectId).toBe('test-project');
    });

    it('对话流程应该是流畅自然的', async () => {
      const service = new CultureSessionService();
      const session = await service.startDetection({ projectId: 'test' });

      const userMessages = [
        '我主要负责代码评审',
        '我喜欢看到具体的建议',
        '简单任务可以自动处理',
      ];

      for (const msg of userMessages) {
        const response = await service.addMessage(session.sessionId, msg);
        expect(response.message).toBeDefined();
        expect(response.message.length).toBeGreaterThan(0);
        expect(response.message).not.toBe('I do not understand');
      }
    });
  });

  describe('API 端点集成', () => {
    it('POST /api/culture/detection/start 应该有效', async () => {
      const response = await fetch('/api/culture/detection/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: 'test-project',
          maxRounds: 3,
        }),
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.sessionId).toBeDefined();
      expect(data.currentRound).toBe(0);
      expect(data.status).toBe('active');
    });

    it('POST /api/culture/detection/:sessionId/message 应该有效', async () => {
      // 先创建会话
      const startResponse = await fetch('/api/culture/detection/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: 'test' }),
      });

      const { sessionId } = await startResponse.json();

      // 发送消息
      const response = await fetch(`/api/culture/detection/${sessionId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '测试消息' }),
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.message).toBeDefined();
      expect(data.round).toBeGreaterThan(0);
    });

    it('POST /api/culture/detection/:sessionId/analyze 应该返回结果', async () => {
      // 创建并填充会话
      const startResponse = await fetch('/api/culture/detection/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: 'test' }),
      });

      const { sessionId } = await startResponse.json();

      // 添加足够对话
      await fetch(`/api/culture/detection/${sessionId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '第一轮' }),
      });

      await fetch(`/api/culture/detection/${sessionId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '第二轮' }),
      });

      // 分析
      const response = await fetch(`/api/culture/detection/${sessionId}/analyze`, {
        method: 'POST',
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.cultureLayer).toBeDefined();
      expect(data.confidence).toBeDefined();
    });

    it('GET /api/culture/detection/:sessionId/taste-draft 应该返回草稿', async () => {
      // 创建、填充、分析后的会话
      // ... (同上 setup)

      const response = await fetch(`/api/culture/detection/${sessionId}/taste-draft`, {
        method: 'GET',
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.draft).toBeDefined();
      expect(data.draft.version).toBe('1.0.0');
    });
  });

  describe('与 pi-agent 集成', () => {
    it('应该正确调用 pi-agent 的 LLM 能力', async () => {
      const service = new CultureSessionService();

      // Mock pi-agent 调用
      vi.spyOn(service, 'callAgent').mockResolvedValue({
        message: '收到，这有助于我理解你的编码偏好',
      });

      const session = await service.startDetection({ projectId: 'test' });
      const response = await service.addMessage(session.sessionId, '测试消息');

      expect(service.callAgent).toHaveBeenCalled();
      expect(response.message).toBeDefined();
    });
  });
});
```

---

## 3. 性能测试计划

### 3.1 LLM 分析时间

#### 测量标准
- **目标:** LLM 分析响应 < 5 秒
- **测量方法:** 实际调用 LLM 并测量端到端时间
- **测试频率:** 采样 10 次，取 P95 值

```typescript
describe('Culture Detection Performance', () => {
  it('LLM 分析应该在 5 秒内完成', async () => {
    const service = new CultureDetectionService();
    const dialogue = generateMockDialogue(3); // 3 轮对话

    const startTime = Date.now();
    await service.extractFromDialogue(dialogue);
    const endTime = Date.now();

    const duration = endTime - startTime;
    expect(duration).toBeLessThan(5000); // 5 秒

    console.log(`LLM 分析耗时: ${duration}ms`);
  });

  it('API 响应应该 < 1 秒（不含 LLM）', async () => {
    const service = new CultureSessionService();

    const startTime = Date.now();
    await service.startDetection({ projectId: 'test' });
    const endTime = Date.now();

    const duration = endTime - startTime;
    expect(duration).toBeLessThan(1000); // 1 秒

    console.log(`API 响应耗时: ${duration}ms`);
  });

  it('TASTE.md 生成应该 < 200ms', async () => {
    const builder = new TasteDraftBuilder();
    const analysisResult = generateMockAnalysisResult();

    const startTime = Date.now();
    const draft = builder.buildDraft(analysisResult, 'test');
    const endTime = Date.now();

    const duration = endTime - startTime;
    expect(duration).toBeLessThan(200); // 200ms

    console.log(`TASTE Profile 生成耗时: ${duration}ms`);
  });
});
```

### 3.2 并发测试

```typescript
describe('Concurrency Tests', () => {
  it('应该支持多个并发会话', async () => {
    const service = new CultureSessionService();
    const concurrentSessions = 10;

    const promises = Array.from({ length: concurrentSessions }, () =>
      service.startDetection({ projectId: 'test' })
    );

    const sessions = await Promise.all(promises);

    expect(sessions).toHaveLength(concurrentSessions);
    expect(new Set(sessions.map(s => s.sessionId)).size).toBe(concurrentSessions);
  });

  it('并发消息处理不应该发生竞态条件', async () => {
    const service = new CultureSessionService();
    const session = await service.startDetection({ projectId: 'test' });

    const promises = Array.from({ length: 5 }, (_, i) =>
      service.addMessage(session.sessionId, `并发消息${i}`)
    );

    const responses = await Promise.all(promises);

    expect(responses).toHaveLength(5);
    // 验证所有响应都有合理的 round 且不重复
    const rounds = responses.map(r => r.round);
    expect(new Set(rounds).size).toBe(5);
  });
});
```

---

## 4. 验收标准

### 4.1 功能验收

| 标准 | 测量方法 | 目标值 | 测试类型 |
|-----|---------|-------|---------|
| 对话流程自然流畅 | UX 审查 + 用户反馈 | 3-5 轮顺畅完成 | E2E + UX |
| LLM 抽取结果可解释 | 抽取结果人工审查 | 经验/品味字段合理 | 单元 + 人工 |
| User TASTE.md 结构正确 | Schema 验证 | 100% 通过 zod 验证 | 单元 |
| 品味抽取准确率 | 用户验证（5 个场景） | > 60% (3/5) | UAT |

### 4.2 性能验收

| 指标 | 目标 | 测量方法 |
|-----|-----|---------|
| LLM 分析时间 | < 5 秒 | P95 值测量 |
| API 响应时间 | < 1 秒 | P95 值测量（不含 LLM） |
| TASTE.md 生成 | < 200ms | 生成操作时间 |
| 会话创建 | < 500ms | JSON 写入 + 返回 |

### 4.3 质量门

### 质量门定义

```
┌─────────────────────────────────────────────────────────────────┐
│                       C.1 Quality Gate                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  单元测试覆盖率: ≥ 80%                                           │
│  关键路径覆盖率: 100% (start, addMessage, analyze, getDraft)    │
│                                                                 │
│  性能指标:                                                        │
│  ├─ LLM 分析: P95 < 5s  [ ]                                     │
│  ├─ API 响应: P95 < 1s  [ ]                                     │
│  └─ TASTE 生成: < 200ms   [ ]                                   │
│                                                                 │
│  功能验收:                                                        │
│  ├─ Schema 验证: 100% 通过 [ ]                                  │
│  ├─ E2E 流程: 3-5 轮完成   [ ]                                  │
│  └─ 人工验证: 准确率 > 60% [ ]                                  │
│                                                                 │
│  [ ] 所有单元测试通过                                             │
│  [ ] 所有集成测试通过                                             │
│  [ ] 性能测试达标                                                 │
│  [ ] QA 审查通过                                                 │
│  [ ] PM 验收通过                                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. 测试环境要求

### 5.1 依赖项

| 组件 | 版本 | 用途 |
|-----|-----|------|
| Vitest | Latest | 单元/集成测试框架 |
| Node.js | 18+ | 运行时环境 |
| pi-agent-core | Epic 0 完成 | LLM 集成 |
| zod | Latest | Schema 验证 |
| fs-extra | Latest | 文件操作 mock |

### 5.2 Mock 策略

```typescript
// LLM 调用 mock
vi.mock('@/lib/integrations/pi-agent', () => ({
  callAgent: vi.fn().mockResolvedValue({
    message: 'Mocked response',
  }),
}));

// 文件系统 mock
vi.mock('fs', () => ({
  writeFileSync: vi.fn(),
  readFileSync: vi.fn().mockReturnValue('{}'),
  existsSync: vi.fn().mockReturnValue(true),
}));
```

### 5.3 测试数据

```typescript
// src/lib/features/culture/__tests__/fixtures/dialogue-fixtures.ts
export const MOCK_DIALOGUES = {
  minimalOneRound: [
    { role: 'user' as const, content: '我喜欢代码简洁', round: 1 },
    { role: 'assistant' as const, content: '收到', round: 1 },
  ],
  typicalThreeRounds: [
    { role: 'user' as const, content: '我主要负责代码评审，喜欢具体建议', round: 1 },
    { role: 'assistant' as const, content: '了解了', round: 1 },
    { role: 'user' as const, content: '也做架构设计，偏好渐进式', round: 2 },
    { role: 'assistant' as const, content: '好的', round: 2 },
    { role: 'user' as const, content: '关键决策我要自己决定', round: 3 },
    { role: 'assistant' as const, content: '明白', round: 3 },
  ],
  // ...
};

export const MOCK_ANALYSIS_RESULTS = {
  withTasteStandards: {
    result: {
      experience_topology: ['code-review', 'architecture-design'],
      taste_standards: {
        'code-review': {
          positive_vibes: ['constructive', 'specific'],
          negative_vibes: ['nitpicking'],
        },
      },
      tension_position: {
        control_level: 0.6,
        trust_level: 0.5,
        intervention_threshold: 0.7,
      },
    },
    confidence: 0.75,
    summary: '用户偏好具体的代码评审反馈，保留关键决策控制权',
  },
  // ...
};
```

---

## 6. 执行计划

### 6.1 里程碑

| 阶段 | 任务 | 天数 | 负责人 |
|-----|-----|------|--------|
| Phase 1 | 创建测试框架 + fixtures | 1 | QA |
| Phase 2 | 单元测试编写 | 2 | QA |
| Phase 3 | 集成测试编写 | 1.5 | QA |
| Phase 4 | 性能测试执行 | 0.5 | QA |
| Phase 5 | Bug 修复验证 | 按需 | Developer + QA |
| Phase 6 | 验收测试执行 | 1 | QA + PM |

**总计: 6 天** (在 Development 完成后执行)

### 6.2 与开发协同

| 任务 | 开始前置 | 完成条件 |
|-----|---------|---------|
| CultureSessionService 单元测试 | Dev 完成服务实现 | 测试通过 |
| CultureDetectionService 单元测试 | Dev 完成检测服务 | 测试通过 |
| E2E 集成测试 | API 端点完成 | 端到端流程通过 |
| 性能测试 | LLM 集成完成 | P95 达标 |
| 验收测试 | 所有测试通过 | PM 签字 |

---

## 7. 风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|-----|-----|-----|---------|
| LLM 抽取准确性低 | Medium | High | 1. 提示词迭代优化 2. 用户验证机制 3. 允许手动调整 |
| 性能测试不稳定（LLM 网络） | Medium | Medium | 1. 使用稳定的 mock 2. 定期实网验证 |
| 会话状态竞态条件 | Low | High | 1. 单例/互斥锁 2. 并发测试覆盖 |
| 测试数据不足 | Low | Medium | 1. 从真实对话积累 2. 生成多样化场景 |

---

## 8. 测试报告模板

### 测试执行摘要

```
Story: C.1 - 文化检测
测试执行日期: 2026-03-XX
测试负责人: QA Engineer

测试结果总览:
┌─────────────────────────────────────────────────────────────┐
│  测试类型   │ 总用例 │ 通过 │ 失败 │ 跳过 │ 覆盖率         │
├─────────────────────────────────────────────────────────────┤
│  单元测试   │   45   │  44  │   1  │   0  │ 85%            │
│  集成测试   │   12   │  12  │   0  │   0  │ N/A (E2E)      │
│  性能测试   │    4   │   3  │   1  │   0  │ P95 达标率: 75%│
│  验收测试   │    5   │   4  │   1  │   0  │ 人工验证: 80%  │
├─────────────────────────────────────────────────────────────┤
│  合计      │   66   │  63  │   3  │   0  │                 │
└─────────────────────────────────────────────────────────────┘

关键指标:
• 单元覆盖率: 85% (目标 ≥ 80%) ✅
• LLM 分析 P95: 4.2s (目标 < 5s) ✅
• API 响应 P95: 980ms (目标 < 1s) ⚠️
• 品味抽取准确率: 4/5 = 80% (目标 > 60%) ✅

质量门:
[✅] 所有单元测试通过
[✅] 所有集成测试通过
[⚠️] 所有性能测试达标 (2/3 达标)
[✅] QA 审查通过
[ ] PM 验收通过 (待执行)

建议:
1. API 响应优化: investigate 982ms case (addMessage with large dialogue)
2. 失败用例: shouldAnalyze() edge case with message counting

结论: 🟢 APPROVED (附带上述优化建议)
```

---

## 9. 附件

### 9.1 测试文件结构

```
src/lib/features/culture/
├── __tests__/
│   ├── fixtures/
│   │   ├── dialogue-fixtures.ts
│   │   ├── session-fixtures.ts
│   │   └── analysis-fixtures.ts
│   ├── culture-session-service.test.ts     # ~45 用例
│   ├── culture-detection-service.test.ts   # ~30 用例
│   ├── taste-draft-builder.test.ts         # ~20 用例
│   └── culture-detection-e2e.test.ts       # ~15 用例
```

### 9.2 相关文档

| 文档 | 路径 |
|-----|------|
| Story C.1 PRD | `docs/specs/epic-C/story-C.1/README.md` |
| Phase 1 产品需求 | `docs/product/phase-1-cognitive-features.md` |
| 认知框架 QA 方法 | `docs/QA/cognitive-framework-quality-assurance.md` |
| TASTE Schema | `src/lib/taste/taste-schema.ts` |

---

**文档版本:** 1.0
**最后更新:** 2026-03-07
**状态:** 准备就绪 - 等待开发完成后执行
