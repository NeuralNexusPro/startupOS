# Epic C Story C.1 架构审查报告

**审查日期:** 2026-03-12
**审查人:** System Architect
**Story:** C.1 - 用户维度文化检测（首次 Onboarding）
**状态:** ✅ 架构符合原则，Phase 1.5 可行

---

## 1. 执行摘要

### 1.1 审查结论

**总体评估:** ✅ **通过**

C.1 的架构设计**符合两层 TASTE.md 架构原则**，类型系统完整，API 设计合理，服务层职责清晰。

### 1.2 关键发现

| 方面 | 状态 | 说明 |
|-----|------|-----|
| 两层架构支持 | ✅ 完整 | Schema 支持 user/project/merged 三种来源 |
| 类型系统一致性 | ✅ 一致 | `src/types/taste.ts` 与 `src/lib/features/culture/types.ts` 对齐 |
| API 设计 | ✅ 符合 | 4 个端点设计合理，请求/响应格式清晰 |
| 服务层职责 | ✅ 清晰 | CultureSessionService / CultureDetectionService 分离良好 |
| pi-agent 集成点 | ✅ 预留 | Phase 1.5 LLM 集成点已标识 |

---

## 2. 架构符合性分析

### 2.1 两层 TASTE 架构原则验证

#### 2.1.1 Schema 设计验证

**位置:** `/Users/archersado/workspace/originos/src/types/taste.ts`

```typescript
// TASTE Profile 支持三种来源
export const TASTEProfileSourceSchema = z.enum(['user', 'project', 'merged']);
export type TASTEProfileSource = z.infer<typeof TASTEProfileSourceSchema>;
```

**验证结果:** ✅ **完全符合**

- `TASTEProfile` 同时支持 `userId` 和 `projectId`
- `metadata.source` 明确标识来源类型
- 提供 `mergeTASTEProfiles()` 工厂函数处理融合逻辑

#### 2.1.2 四维度支持验证

| 维度 | Schema 字段 | 实现状态 |
|-----|------------|---------|
| 经验拓扑 | `experience_topology: string[]` | ✅ 完整 |
| 品味标准 | `taste_standards: Record<domain, {positive_vibes, negative_vibes}>` | ✅ 完整 |
| 张力位置 | `tension_position: {control_level, trust_level, intervention_threshold}` | ✅ 完整 |
| 共生边界 | `symbiosis_boundary: {delegated_domains, reserved_domains, contextual_triggers}` | ✅ 完整 |

#### 2.1.3 融合规则验证

**位置:** `/Users/archersado/workspace/originos/src/types/taste.ts:472-563`

```typescript
export function mergeTASTEProfiles(
  userTASTE: TASTEProfile,
  projectTASTE: TASTEProfile
): TASTEProfile {
  // 经验拓扑: 合并去重
  // 品味标准: Project 覆盖 User（同一 domain）
  // 张力位置: 加权平均（Project 权重 0.7）
  // 共生边界: 合并
}
```

**验证结果:** ✅ **融合规则正确**
- 经验拓扑合并策略合理
- 品味标准 Project 优先符合项目直觉原则
- 张力位置加权平均（Project 0.7 / User 0.3）合理

---

### 2.2 API 设计符合性

#### 2.2.1 端点设计验证

| 端点 | 方法 | 实现状态 | 文件位置 |
|-----|------|---------|---------|
| `/api/taste/user/detection/start` | POST | ✅ 实现 | `src/app/api/taste/user/detection/start/route.ts` |
| `/api/taste/user/detection/[sessionId]/message` | POST | ✅ 实现 | `src/app/api/taste/user/detection/[sessionId]/message/route.ts` |
| `/api/taste/user/detection/[sessionId]/analyze` | POST | ✅ 实现 | `src/app/api/taste/user/detection/[sessionId]/analyze/route.ts` |
| `/api/taste/user/detection/[sessionId]/taste-draft` | GET | ✅ 实现 | `src/app/api/taste/user/detection/[sessionId]/taste-draft/route.ts` |

#### 2.2.2 数据流验证

```
用户对话 → HTTP POST → CultureSessionService → 对话存储
                                      ↓
                          CultureDetectionService → LLM 分析
                                      ↓
                              TASTE Profile 生成
                                      ↓
                              JsonStore 持久化
```

**验证结果:** ✅ **数据流清晰**

---

### 2.3 服务层职责分析

#### 2.3.1 CultureSessionService

**职责:** 会话生命周期管理

| 方法 | 职责 | 状态 |
|-----|-----|-----|
| `createSession()` | 创建检测会话 | ✅ |
| `getSession()` | 获取会话 | ✅ |
| `saveSession()` | 保存会话 | ✅ |
| `getFirstQuestion()` | 获取首个问题 | ✅ |
| `getNextQuestion()` | 获取下一问题 | ✅ |
| `addMessage()` | 添加消息 | ✅ |
| `markAsAnalyzing()` | 标记分析中 | ✅ |
| `storeAnalysisResult()` | 存储分析结果 | ✅ |

#### 2.3.2 CultureDetectionService

**职责:** LLM 分析和 TASTE 提取

| 方法 | 职责 | 状态 |
|-----|-----|-----|
| `analyzeDialogue()` | 分析对话提取品味 | ✅ |
| `getTasteDraft()` | 获取 TASTE 草稿 | ✅ |
| `simulateLLMAnalysis()` | Phase 1 模拟分析 | ✅ |

**关键设计:** `simulateLLMAnalysis()` 标注了 Phase 1.5 集成点

```typescript
// Phase 1: Simplified implementation using keyword matching
// Phase 1.5: Integrate pi-agent LLM API
private async simulateLLMAnalysis(...)
```

---

### 2.4 pi-agent 集成点评估

#### 2.4.1 当前集成架构

```
OriginOSAgent (pi-agent-core wrapper)
    ├── System Prompt 注入
    ├── Tool Registry
    ├── Message Bridge
    └── Event Emitter
```

**位置:** `/Users/archersado/workspace/originos/src/lib/integrations/pi-agent/core/agent.ts`

#### 2.4.2 TASTE 加载预留点

**建议的 Phase 1.5 集成架构:**

```typescript
// 建议在 OriginOSAgent 中添加 TASTE 上下文加载
class OriginOSAgent {
  private tasteProfile: TASTEProfile | null = null;

  async loadTASTEContext(userId: string, projectId?: string): Promise<void> {
    const tasteLoader = new TasteLoader();
    this.tasteProfile = await tasteLoader.loadTASTE({ userId, projectId });

    // 注入到 System Prompt
    this.injectTASTEPrompt(this.tasteProfile);
  }

  private injectTASTEPrompt(taste: TASTEProfile): void {
    const tastePrompt = this.buildTASTEPrompt(taste);
    const currentPrompt = this.agent.state.systemPrompt;
    this.setSystemPrompt(`${currentPrompt}\n\n## 你的用户品味档案\n${tastePrompt}`);
  }
}
```

---

## 3. Phase 1.5 (C.5 项目维度) 技术可行性评估

### 3.1 项目创建 Skill 架构设计

**依赖:** C.1 用户维度基础设施

```
项目创建访谈流程
    ├── POST /api/project/create/start
    ├── POST /api/project/create/:sessionId/question
    ├── POST /api/project/create/:sessionId/answer
    └── POST /api/project/create/:sessionId/complete
            ↓
        生成 Project TASTE + Ontology
```

### 3.2 隐形采集策略评估

**关键原则:** 用户感知仅"项目创建访谈"，不感觉"品味提问"

**实现方案:**

```typescript
// 建议的访谈问题设计
const PROJECT_QUESTIONS = [
  {
    turn: 0,
    question: "项目的背景是什么？",
    signal_targets: ['experience_topology', 'domain_focus'],
    dual_purpose: {
      primary: '项目背景收集',
      secondary: '品味线索提取'
    }
  },
  {
    turn: 1,
    question: "这个项目的主要目标是什么？",
    signal_targets: ['taste_standards', 'tension_position'],
    dual_purpose: {
      primary: '项目目标收集',
      secondary: '品味线索提取'
    }
  },
  {
    turn: 2,
    question: "你们团队的工作模式是怎样的？",
    signal_targets: ['symbiosis_boundary', 'tension_position'],
    dual_purpose: {
      primary: '工作模式收集',
      secondary: '品味线索提取'
    }
  },
  {
    turn: 3,
    question: "项目中的主要业务领域有哪些？",
    signal_targets: ['ontology_extraction'],
    dual_purpose: {
      primary: 'Ontology 构建',
      secondary: 'N/A'
    }
  }
];
```

### 3.3 技术依赖关系

```
C.5 依赖链
    ├── C.1 ✅ 已完成
    │   ├── TASTE Schema ✅
    │   ├── CultureDetectionService ✅
    │   ├── API 端点 ✅
    │   └── 存储 infrastructure ✅
    ├── pi-agent LLM 集成 ⚠️ 待实现
    │   ├── 替换 simulateLLMAnalysis()
    │   └── 连接 pi-agent-core
    └── Ontology 服务 ⚠️ 待实现
        ├── 业务模型提取
        └── Ontology 存储
```

### 3.4 风险评估

| 风险 | 等级 | 缓解策略 |
|-----|-----|---------|
| LLM 分析准确率不足 | 中 | 关键词提取 + LLM 混合策略 |
| 用户感知到"品味采集" | 高 | 问题设计需产品验证 |
| Project TASTE 与 User TASTE 冲突 | 低 | 融合规则已定义，Project 优先 |
| Ontology 构建复杂度 | 中 | Phase 1.5 可简化 Ontology |

---

## 4. 架构建议

### 4.1 短期改进建议（Phase 1 完成）

#### 4.1.1 类型系统统一

**问题:** `src/types/taste.ts` 和 `src/lib/features/culture/types.ts` 存在类型重复

**建议:** 统一到 `src/types/taste.ts`，`culture/types.ts` 仅保留文化检测特定类型

```typescript
// src/lib/features/culture/types.ts 应该只导出文化检测特定类型
export type {
  CultureDetectionSession,
  CultureDetectionMessage,
  CultureDetectionStatus,
  // ...
} from './types';

// TASTE 相关类型统一从 @/types/taste 导入
import type { TASTEProfile, CultureLayerDetection } from '@/types/taste';
```

#### 4.1.2 测试覆盖增强

**当前状态:** 存在测试文件但覆盖不全

**建议:**
- 添加 API 端点集成测试
- 添加 TASTE 融合逻辑单元测试
- 添加 LLM 分析 mock 测试

### 4.2 Phase 1.5 实现建议

#### 4.2.1 TasteLoader 服务

**建议位置:** `src/lib/taste/taste-loader.ts`

```typescript
/**
 * TASTE 上下文加载器
 * 支持两层架构：User TASTE + Project TASTE
 */
export class TasteLoader {
  async loadTASTE(context: {
    userId: string;
    projectId?: string;
  }): Promise<TASTEProfile | null> {
    if (!context.projectId) {
      return this.loadUserTASTE(context.userId);
    }

    const [user, project] = await Promise.all([
      this.loadUserTASTE(context.userId),
      this.loadProjectTASTE(context.projectId)
    ]);

    if (!user && !project) return null;
    if (!user) return project;
    if (!project) return user;

    return mergeTASTEProfiles(user, project);
  }
}
```

#### 4.2.2 pi-agent 集成接口

**建议位置:** `src/lib/integrations/pi-agent/taste-context.ts`

```typescript
/**
 * pi-agent TASTE 上下文注入
 */
export function createTASTESystemPrompt(taste: TASTEProfile): string {
  return `
## 用户品味档案

### 经验领域
${taste.experience_topology.map(d => `- ${d}`).join('\n')}

### 品味标准
${Object.entries(taste.taste_standards)
  .map(([domain, std]) => `**${domain}**:
  - 偏好: ${std.positive_vibes.join(', ')}
  - 避免: ${std.negative_vibes.join(', ')}`)
  .join('\n\n')}

### 协作风格
- 控制倾向: ${taste.tension_position.control_level > 0.6 ? '高控制' : taste.tension_position.control_level < 0.4 ? '高信任' : '平衡'}
- 介入时机: ${taste.tension_position.intervention_threshold > 0.7 ? '晚介入' : '早介入'}
`.trim();
}
```

---

## 5. 验收检查清单

### 5.1 C.1 验收（用户维度）

- [x] 3-5 轮对话流畅自然
- [ ] LLM 抽取准确率 > 60%（需产品验证）
- [x] User TASTE Profile 生成正确
- [x] 数据结构支持完整 4 维度
- [x] 两层架构预留（Project TASTE 字段）

### 5.2 Phase 1.5 技术准备（项目维度）

- [ ] TasteLoader 服务实现
- [ ] pi-agent TASTE 上下文注入
- [ ] 项目创建 Skill API 端点
- [ ] Ontology 服务基础架构
- [ ] 融合逻辑集成测试

---

## 6. 结论

### 6.1 架构符合性评估

**结论:** ✅ **C.1 架构设计完全符合两层 TASTE.md 架构原则**

### 6.2 Phase 1.5 可行性评估

**结论:** ✅ **Phase 1.5 (C.5) 技术可行性高**

关键依赖已就绪：
1. TASTE Schema 支持两层架构
2. 融合逻辑已实现
3. 存储基础设施已建立
4. pi-agent 集成接口已预留

### 6.3 下一步行动

1. **Phase 1 收尾:**
   - 完成 API 端点集成测试
   - 产品验证 LLM 分析准确率

2. **Phase 1.5 准备:**
   - 实现 TasteLoader 服务
   - 实现 pi-agent TASTE 上下文注入
   - 设计项目创建 Skill 流程

---

**签名:** System Architect
**日期:** 2026-03-12
