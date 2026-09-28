# Epic C Story C.2-C.4 测试筹备计划

**创建日期**: 2026-03-16
**创建人**: QA Engineer
**状态**: Planning

---

## 📋 概述

本文档为 Epic C Phase 1 的 Story C.2、C.3、C.4 提供测试筹备计划，包括测试策略、测试用例框架和质量门定义。

---

## Story C.2: 行动确认 (Action Confirmation)

### 测试范围

**核心功能**: 基于 TASTE.md 张力位置的操作前确认机制

**依赖**:
- C.1 完成的 tension_position 数据
- pi-agent-core 操作拦截能力

### 单元测试计划

#### ActionConfirmationMiddleware 测试

```typescript
describe('ActionConfirmationMiddleware', () => {
  describe('requiresConfirmation()', () => {
    // TC-C2-001: 代码格式化 - intervention_threshold >= 0.5
    it('should require confirmation for code_formatting when threshold >= 0.5', () => {
      const middleware = new ActionConfirmationMiddleware();
      const operation = { type: 'code_formatting' };
      const tensionPosition = { intervention_threshold: 0.5 };

      expect(middleware.requiresConfirmation(operation, tensionPosition)).toBe(true);
    });

    // TC-C2-002: 代码格式化 - intervention_threshold < 0.5
    it('should NOT require confirmation for code_formatting when threshold < 0.5', () => {
      const middleware = new ActionConfirmationMiddleware();
      const operation = { type: 'code_formatting' };
      const tensionPosition = { intervention_threshold: 0.4 };

      expect(middleware.requiresConfirmation(operation, tensionPosition)).toBe(false);
    });

    // TC-C2-003: 文件修改 - intervention_threshold >= 0.7
    it('should require confirmation for file_modification when threshold >= 0.7', () => {
      const middleware = new ActionConfirmationMiddleware();
      const operation = { type: 'file_modification' };
      const tensionPosition = { intervention_threshold: 0.7 };

      expect(middleware.requiresConfirmation(operation, tensionPosition)).toBe(true);
    });

    // TC-C2-004: 数据库变更 - intervention_threshold >= 0.9 (始终需要确认)
    it('should ALWAYS require confirmation for database_migration', () => {
      const middleware = new ActionConfirmationMiddleware();
      const operation = { type: 'database_migration' };

      // 即使阈值很低，数据库变更也需要确认
      expect(middleware.requiresConfirmation(operation, { intervention_threshold: 0.1 })).toBe(true);
    });

    // TC-C2-005: tension_position 缺失时的默认行为
    it('should use default threshold when tension_position is undefined', () => {
      const middleware = new ActionConfirmationMiddleware();
      const operation = { type: 'code_formatting' };

      expect(middleware.requiresConfirmation(operation, undefined)).toBe(true);
    });

    // TC-C2-006: 未知操作类型的默认行为
    it('should NOT require confirmation for unknown operation types', () => {
      const middleware = new ActionConfirmationMiddleware();
      const operation = { type: 'unknown_operation' };
      const tensionPosition = { intervention_threshold: 0.9 };

      expect(middleware.requiresConfirmation(operation, tensionPosition)).toBe(false);
    });
  });

  describe('intercept()', () => {
    // TC-C2-007: 需要确认的操作 - 用户确认
    it('should show confirmation modal and continue when user confirms', async () => {
      // Mock setup
      const modalService = { showConfirmation: vi.fn(), awaitDecision: vi.fn().mockResolvedValue('confirm') };
      const middleware = new ActionConfirmationMiddleware(undefined, modalService);

      const result = await middleware.intercept(operation, req, res, next);

      expect(modalService.showConfirmation).toHaveBeenCalled();
      expect(result).toBe('proceeded');
    });

    // TC-C2-008: 需要确认的操作 - 用户取消
    it('should cancel operation when user cancels', async () => {
      const modalService = { showConfirmation: vi.fn(), awaitDecision: vi.fn().mockResolvedValue('cancel') };
      const middleware = new ActionConfirmationMiddleware(undefined, modalService);

      const result = await middleware.intercept(operation, req, res, next);

      expect(result).toBe('cancelled');
    });

    // TC-C2-009: 不需要确认的操作 - 直接执行
    it('should proceed without confirmation when not required', async () => {
      const middleware = new ActionConfirmationMiddleware();
      const operation = { type: 'unknown_operation' };

      const result = await middleware.intercept(operation, req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('simplifyDescription()', () => {
    // TC-C2-010: 技术细节简化
    it('should return simple description instead of technical details', () => {
      const middleware = new ActionConfirmationMiddleware();
      const operation = {
        type: 'code_formatting',
        description: 'Running prettier with options: --single-quote --trailing-comma es5',
        simpleDescription: '对代码进行格式化'
      };

      const result = middleware.simplifyDescription(operation);

      expect(result).toBe('对代码进行格式化');
    });
  });

  describe('recordDecision()', () => {
    // TC-C2-011: 记录用户确认
    it('should record confirmed decision for trust learning', async () => {
      const trustLearningService = { recordDecision: vi.fn() };
      const middleware = new ActionConfirmationMiddleware(undefined, undefined, trustLearningService);

      await middleware.recordDecision(req, operation, 'confirmed');

      expect(trustLearningService.recordDecision).toHaveBeenCalledWith(
        req.projectId,
        operation.type,
        'confirmed'
      );
    });

    // TC-C2-012: 记录用户取消
    it('should record canceled decision for trust learning', async () => {
      const trustLearningService = { recordDecision: vi.fn() };
      const middleware = new ActionConfirmationMiddleware(undefined, undefined, trustLearningService);

      await middleware.recordDecision(req, operation, 'canceled');

      expect(trustLearningService.recordDecision).toHaveBeenCalledWith(
        req.projectId,
        operation.type,
        'canceled'
      );
    });
  });
});
```

### 集成测试计划

```typescript
describe('Action Confirmation E2E', () => {
  // TC-C2-INT-001: 端到端格式化确认流程
  it('should complete full formatting confirmation flow', async () => {
    // 1. 创建带高 tension_position 的用户
    // 2. 触发代码格式化操作
    // 3. 验证确认弹窗显示
    // 4. 用户确认
    // 5. 验证操作执行
    // 6. 验证决定被记录
  });

  // TC-C2-INT-002: 用户取消操作
  it('should cancel operation when user declines', async () => {
    // 1. 触发需要确认的操作
    // 2. 用户取消
    // 3. 验证操作未执行
    // 4. 验证取消被记录
  });

  // TC-C2-INT-003: 低阈值用户跳过确认
  it('should skip confirmation for low threshold user', async () => {
    // 1. 创建 intervention_threshold = 0.3 的用户
    // 2. 触发代码格式化
    // 3. 验证无确认弹窗
    // 4. 操作直接执行
  });
});
```

### 验收标准

| 标准 | 测量方法 | 目标值 |
|-----|---------|-------|
| 拦截成功率 | 测试覆盖率 | > 95% |
| 弹窗正确展示 | E2E 测试 | 100% |
| 用户选择记录 | 单元测试 | 100% |
| 取消操作正确停止 | E2E 测试 | 100% |

---

## Story C.3: 信任学习 (Trust Learning)

### 测试范围

**核心功能**: 连续确认后询问跳过确认，更新共生边界

**依赖**:
- C.2 的决定记录
- C.1 的 TASTE Profile

### 单元测试计划

```typescript
describe('TrustLearningService', () => {
  describe('recordDecision()', () => {
    // TC-C3-001: 确认计数增加
    it('should increment consecutive_confirms on confirm', async () => {
      const service = new TrustLearningService(trustStorage);

      await service.recordDecision('project-1', 'code_formatting', 'confirmed');
      await service.recordDecision('project-1', 'code_formatting', 'confirmed');

      const settings = await service.getTrustSettings('project-1', 'code_formatting');
      expect(settings.consecutive_confirms).toBe(2);
      expect(settings.total_confirms).toBe(2);
    });

    // TC-C3-002: 取消重置计数
    it('should reset consecutive_confirms on cancel', async () => {
      const service = new TrustLearningService(trustStorage);

      await service.recordDecision('project-1', 'code_formatting', 'confirmed');
      await service.recordDecision('project-1', 'code_formatting', 'confirmed');
      await service.recordDecision('project-1', 'code_formatting', 'canceled');

      const settings = await service.getTrustSettings('project-1', 'code_formatting');
      expect(settings.consecutive_confirms).toBe(0);
      expect(settings.total_confirms).toBe(2); // 总计不变
    });

    // TC-C3-003: 不同操作类型独立计数
    it('should track different operation types independently', async () => {
      const service = new TrustLearningService(trustStorage);

      await service.recordDecision('project-1', 'code_formatting', 'confirmed');
      await service.recordDecision('project-1', 'file_modification', 'confirmed');

      const formattingSettings = await service.getTrustSettings('project-1', 'code_formatting');
      const modificationSettings = await service.getTrustSettings('project-1', 'file_modification');

      expect(formattingSettings.consecutive_confirms).toBe(1);
      expect(modificationSettings.consecutive_confirms).toBe(1);
    });
  });

  describe('shouldAskToSkipConfirmation()', () => {
    // TC-C3-004: 达到阈值触发询问
    it('should return true when consecutive_confirms >= 3', () => {
      const service = new TrustLearningService(trustStorage);
      const settings = { consecutive_confirms: 3, skip_confirmation: false };

      expect(service.shouldAskToSkipConfirmation(settings)).toBe(true);
    });

    // TC-C3-005: 未达到阈值不询问
    it('should return false when consecutive_confirms < 3', () => {
      const service = new TrustLearningService(trustStorage);
      const settings = { consecutive_confirms: 2, skip_confirmation: false };

      expect(service.shouldAskToSkipConfirmation(settings)).toBe(false);
    });

    // TC-C3-006: 已跳过确认不再询问
    it('should return false when already skipping confirmation', () => {
      const service = new TrustLearningService(trustStorage);
      const settings = { consecutive_confirms: 3, skip_confirmation: true };

      expect(service.shouldAskToSkipConfirmation(settings)).toBe(false);
    });
  });

  describe('handleSkipConfirmationDecision()', () => {
    // TC-C3-007: 用户选择跳过确认
    it('should update skip_confirmation to true', async () => {
      const service = new TrustLearningService(trustStorage);

      await service.handleSkipConfirmationDecision('project-1', 'code_formatting', true);

      const settings = await service.getTrustSettings('project-1', 'code_formatting');
      expect(settings.skip_confirmation).toBe(true);
    });

    // TC-C3-008: 用户选择仍然确认
    it('should keep skip_confirmation as false', async () => {
      const service = new TrustLearningService(trustStorage);

      await service.handleSkipConfirmationDecision('project-1', 'code_formatting', false);

      const settings = await service.getTrustSettings('project-1', 'code_formatting');
      expect(settings.skip_confirmation).toBe(false);
    });

    // TC-C3-009: 跳过确认时更新共生边界
    it('should update symbiosis_boundary when skipping confirmation', async () => {
      const service = new TrustLearningService(trustStorage, tasteProfileService);

      await service.handleSkipConfirmationDecision('project-1', 'code_formatting', true);

      const profile = await tasteProfileService.get('project-1');
      expect(profile.summary.symbiosis_boundary.delegated_domains).toContain('code_formatting');
    });
  });
});
```

### 集成测试计划

```typescript
describe('Trust Learning E2E', () => {
  // TC-C3-INT-001: 完整信任学习流程
  it('should trigger skip confirmation ask after 3 confirms', async () => {
    // 1. 新用户，默认设置
    // 2. 连续确认 3 次 code_formatting
    // 3. 验证询问弹窗显示
    // 4. 用户选择"跳过确认"
    // 5. 验证设置更新
    // 6. 验证共生边界更新
  });

  // TC-C3-INT-002: 中断后重新计数
  it('should reset counter after cancel and re-accumulate', async () => {
    // 1. 确认 2 次
    // 2. 取消 1 次
    // 3. 确认 1 次
    // 4. 验证计数为 1（不触发询问）
    // 5. 再确认 2 次
    // 6. 验证触发询问
  });

  // TC-C3-INT-003: 用户选择仍然确认
  it('should continue asking when user chooses to keep confirmation', async () => {
    // 1. 连续确认 3 次
    // 2. 触发询问
    // 3. 用户选择"仍然每次确认"
    // 4. 再确认 3 次
    // 5. 不应再次触发询问
  });
});
```

### 验收标准

| 标准 | 测量方法 | 目标值 |
|-----|---------|-------|
| 连续 3 次确认触发询问 | E2E 测试 | 100% |
| 用户选择正确记录 | 单元测试 | 100% |
| 委托范围正确更新 | 集成测试 | 100% |
| Activity→Weights 模式验证 | E2E 测试 | 通过 |

---

## Story C.4: 显式品味收集 (Explicit Taste Collection)

### 测试范围

**核心功能**: 用户查看、添加、编辑品味偏好，导出 TASTE.md

**依赖**:
- C.1 完成的 TASTE Profile

### 单元测试计划

```typescript
describe('TastePreferencesService', () => {
  describe('getPreferences()', () => {
    // TC-C4-001: 获取用户品味偏好
    it('should return likes and dislikes from taste_standards', async () => {
      const service = new TastePreferencesService(tasteStorage);

      const preferences = await service.getPreferences('project-1');

      expect(preferences.likes).toBeDefined();
      expect(preferences.dislikes).toBeDefined();
      expect(preferences.stats.total_learned).toBeGreaterThanOrEqual(0);
    });

    // TC-C4-002: 统计正确计算
    it('should correctly calculate stats', async () => {
      const service = new TastePreferencesService(tasteStorage);

      // 假设有 2 个自动收集 + 1 个手动添加
      const preferences = await service.getPreferences('project-1');

      expect(preferences.stats.auto_collected).toBe(2);
      expect(preferences.stats.manual_added).toBe(1);
      expect(preferences.stats.total_learned).toBe(3);
    });
  });

  describe('addPreference()', () => {
    // TC-C4-003: 添加正向品味
    it('should add positive vibe to taste_standards', async () => {
      const service = new TastePreferencesService(tasteStorage);

      await service.addPreference('project-1', {
        tasteType: 'like',
        context: 'code-review',
        description: '具体的改进建议'
      });

      const preferences = await service.getPreferences('project-1');
      expect(preferences.likes.some(l => l.description === '具体的改进建议')).toBe(true);
    });

    // TC-C4-004: 添加负向品味
    it('should add negative vibe to taste_standards', async () => {
      const service = new TastePreferencesService(tasteStorage);

      await service.addPreference('project-1', {
        tasteType: 'dislike',
        context: 'code-review',
        description: '只指出格式问题'
      });

      const preferences = await service.getPreferences('project-1');
      expect(preferences.dislikes.some(d => d.description === '只指出格式问题')).toBe(true);
    });

    // TC-C4-005: 自动创建不存在的领域
    it('should create domain if not exists', async () => {
      const service = new TastePreferencesService(tasteStorage);

      await service.addPreference('project-1', {
        tasteType: 'like',
        context: 'new-domain',
        description: '新领域的偏好'
      });

      const profile = await tasteStorage.get('project-1');
      expect(profile.summary.taste_standards['new-domain']).toBeDefined();
    });
  });

  describe('editPreference()', () => {
    // TC-C4-006: 编辑品味描述
    it('should update preference description', async () => {
      const service = new TastePreferencesService(tasteStorage);

      await service.editPreference('project-1', 'memory-id', {
        description: '更新后的描述'
      });

      const preferences = await service.getPreferences('project-1');
      // 验证更新
    });

    // TC-C4-007: 编辑品味类型
    it('should allow changing taste type', async () => {
      const service = new TastePreferencesService(tasteStorage);

      // 从 like 改为 dislike
      await service.editPreference('project-1', 'memory-id', {
        tasteType: 'dislike'
      });

      // 验证移动到了正确的列表
    });
  });

  describe('deletePreference()', () => {
    // TC-C4-008: 删除品味
    it('should remove preference from taste_standards', async () => {
      const service = new TastePreferencesService(tasteStorage);

      await service.deletePreference('project-1', 'memory-id');

      const preferences = await service.getPreferences('project-1');
      // 验证已删除
    });
  });

  describe('exportTASTEDraft()', () => {
    // TC-C4-009: 导出 TASTE 草稿
    it('should generate valid TASTE profile', async () => {
      const service = new TastePreferencesService(tasteStorage);

      const draft = await service.exportTASTEDraft('project-1');

      expect(draft.version).toBe('1.0.0');
      expect(draft.summary).toBeDefined();
      expect(draft.summary.experience_topology).toBeDefined();
      expect(draft.summary.taste_standards).toBeDefined();
    });

    // TC-C4-010: 导出包含所有品味
    it('should include all preferences in export', async () => {
      const service = new TastePreferencesService(tasteStorage);

      // 添加一些品味
      await service.addPreference('project-1', { tasteType: 'like', context: 'dev', description: '测试品味' });

      const draft = await service.exportTASTEDraft('project-1');
      expect(draft.summary.taste_standards.dev.positive_vibes).toContain('测试品味');
    });
  });
});
```

### API 端点测试

```typescript
describe('Taste Preferences API', () => {
  describe('GET /api/taste/preferences', () => {
    // TC-C4-API-001: 获取品味偏好
    it('should return preferences with stats', async () => {
      const response = await fetch('/api/taste/preferences?projectId=project-1');
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.likes).toBeDefined();
      expect(data.dislikes).toBeDefined();
      expect(data.stats).toBeDefined();
    });
  });

  describe('POST /api/taste/preferences', () => {
    // TC-C4-API-002: 添加品味
    it('should add new preference', async () => {
      const response = await fetch('/api/taste/preferences', {
        method: 'POST',
        body: JSON.stringify({
          projectId: 'project-1',
          tasteType: 'like',
          context: 'development',
          description: '清晰的变量命名'
        })
      });

      expect(response.status).toBe(200);
    });

    // TC-C4-API-003: 验证必需参数
    it('should validate required parameters', async () => {
      const response = await fetch('/api/taste/preferences', {
        method: 'POST',
        body: JSON.stringify({ projectId: 'project-1' })
      });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/taste/preferences/:projectId/export', () => {
    // TC-C4-API-004: 导出 TASTE 草稿
    it('should export TASTE draft', async () => {
      const response = await fetch('/api/taste/preferences/project-1/export');
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.draft).toBeDefined();
      expect(data.exportedAt).toBeDefined();
    });
  });
});
```

### 验收标准

| 标准 | 测量方法 | 目标值 |
|-----|---------|-------|
| 用户能添加/编辑偏好 | E2E 测试 | 100% |
| 统计显示正确 | 单元测试 | 100% |
| 导出功能正常 | API 测试 | 100% |
| 数据支持 Phase 3 扩展 | 结构验证 | 通过 |

---

## 测试时间估算

| Story | 单元测试 | 集成测试 | API 测试 | 总计 |
|-------|---------|---------|---------|------|
| C.2 行动确认 | 1 天 | 0.5 天 | 0.5 天 | 2 天 |
| C.3 信任学习 | 1 天 | 0.5 天 | - | 1.5 天 |
| C.4 显式品味收集 | 1 天 | 0.5 天 | 0.5 天 | 2 天 |

**总计: 5.5 天**

---

## 风险与缓解

| 风险 | 概率 | 缓解措施 |
|-----|-----|---------|
| C.1 数据结构变更影响测试 | Medium | 使用接口隔离，Mock 数据 |
| 中间件测试困难 | Low | 使用依赖注入，Mock 服务 |
| 信任学习计数竞态条件 | Low | 添加并发测试用例 |
| 导出功能数据格式问题 | Low | Schema 验证测试 |

---

## 下一步行动

1. 等待 C.1 LLM 集成完成
2. 开发开始 C.2 时同步创建测试框架
3. 更新测试用例以匹配实际实现
4. 添加性能测试场景

---

**文档版本**: 1.0
**创建日期**: 2026-03-16
