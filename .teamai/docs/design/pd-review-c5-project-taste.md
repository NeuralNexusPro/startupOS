# Product Design 审核报告：C.5 项目创建 Skill 隐形采集

**审核人:** Product Designer
**审核日期:** 2026-03-16
**文档版本:** 1.0.0

---

## 1. 审核范围

### 已审核文档
- `docs/specs/epic-C/story-C.5/README.md` - Story 技术规范
- `docs/specs/epic-C/story-C.5/ux-design.md` - UX 设计文档
- `docs/design/ux-design-c1-onboarding.md` - C.1 设计方案（参考）

### 审核标准
1. 隐形采集原则是否贯彻
2. 与 C.1 User TASTE 的衔接是否合理
3. User TASTE + Project TASTE 融合机制
4. 用户价值主张是否清晰

---

## 2. 核心原则符合度评估

### 2.1 隐形采集原则 ✅

| 原则 | 设计实现 | 评分 |
|------|---------|------|
| 用户感知仅为"项目创建" | 4 步表单式访谈，无"TASTE"字样 | ⭐⭐⭐⭐⭐ |
| 所有问题围绕项目 | 背景、目标、工作模式均为项目相关 | ⭐⭐⭐⭐⭐ |
| 选项预映射 TASTE | 核心目标、工作模式选项都有明确映射 | ⭐⭐⭐⭐⭐ |
| 可跳过不强制 | 每步都有"跳过"选项，有默认值 | ⭐⭐⭐⭐⭐ |

**评估**: 完全符合隐形采集原则，用户不会感知 TASTE 存在。

### 2.2 TASTE 四维度覆盖 ✅

| 维度 | 提取时机 | 提取方式 | 完整度 |
|------|---------|---------|--------|
| Experience Topology | Step 1 项目背景 | NLP + 领域识别 | ⭐⭐⭐⭐⭐ |
| Taste Standards | Step 2 核心目标 | 预设映射 + LLM | ⭐⭐⭐⭐⭐ |
| Tension Position | Step 2 核心目标 | 阈值推断 | ⭐⭐⭐⭐ |
| Symbiosis Boundary | Step 3 工作模式 | 预设映射 | ⭐⭐⭐⭐⭐ |

**备注**: Tension Position 仅从核心目标推断，可能不够精细，建议增加追问机制。

### 2.3 与 C.1 的设计一致性 ✅

| 方面 | C.1 User TASTE | C.5 Project TASTE | 一致性 |
|------|----------------|-------------------|--------|
| 材质风格 | Acrylic | Acrylic | ⭐⭐⭐⭐⭐ |
| 颜色系统 | OriginOS 设计系统 | 同左 | ⭐⭐⭐⭐⭐ |
| 动画规范 | 统一时长和缓动 | 同左 | ⭐⭐⭐⭐⭐ |
| 无障碍 | WCAG 2.1 AA | 同左 | ⭐⭐⭐⭐⭐ |

---

## 3. User TASTE + Project TASTE 融合设计审核

### 3.1 融合机制评估

根据 Epic C README 中的融合规则：

```typescript
function mergeTASTE(user: TASTEProfile, project: TASTEProfile): TASTEProfile
```

**融合策略评估：**

| 维度 | 融合规则 | 合理性 | 建议 |
|------|---------|--------|------|
| Experience Topology | 合并 + 去重 | ⭐⭐⭐⭐⭐ | 保持 |
| Taste Standards | Project 覆盖 User | ⭐⭐⭐⭐ | 合理，项目上下文优先 |
| Tension Position | 加权平均（Project 0.7） | ⭐⭐⭐⭐ | 合理 |
| Symbiosis Boundary | 合并 | ⭐⭐⭐⭐ | 需考虑冲突处理 |

### 3.2 冲突处理建议 ⚠️

**问题**: 当 User TASTE 和 Project TASTE 在某些维度冲突时如何处理？

**建议**: 增加 ConflictResolutionStrategy：

```typescript
interface TASTEMergeConfig {
  experience_topology: 'merge';              // 合并去重
  taste_standards: 'project_priority';       // 项目优先
  tension_position: 'weighted_average';      // 加权平均
  symbiosis_boundary: 'intersection';        // 交集优先（更保守）

  // 冲突处理
  conflict_resolution: {
    reserved_domains: 'union';               // 保留域取并集（更保守）
    delegated_domains: 'intersection';       // 委托域取交集（更谨慎）
  };
}
```

### 3.3 加载时机验证 ✅

```
用户启动 OriginOS → 加载 User TASTE
        ↓
进入项目 → 加载 Project TASTE → 融合 User + Project
        ↓
退出项目 → 卸载 Project TASTE → 恢复 User TASTE
```

**评估**: 加载时机设计合理，符合两层架构原则。

---

## 4. 用户价值主张评估

### 4.1 用户感知的价值

| 用户感知 | 实际产出 | 价值匹配 |
|---------|---------|---------|
| "创建项目" | Project + TASTE + Ontology | ⭐⭐⭐⭐⭐ |
| "回答项目问题" | 隐性提取品味线索 | ⭐⭐⭐⭐⭐ |
| "AI 辅助配置" | TASTE 驱动的智能行为 | ⭐⭐⭐⭐ |

### 4.2 价值主张清晰度 ⚠️

**问题**: 用户在完成访谈后，不知道系统"做了什么"。

**建议**: 在成功界面增加价值暗示：

```
┌─────────────────────────────────────────────────────────────────┐
│  项目创建成功！                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  ✓ 项目结构已创建                                               │
│  ✓ 智能助手已配置（基于你的回答）    ← 价值暗示                  │
│  ✓ 项目看板已就绪                                               │
│                                                                 │
│  💡 随着你的使用，助手会越来越懂你的工作风格                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. 发现的问题与建议

### 5.1 Tension Position 提取精度 ⚠️

**问题**: 仅从"核心目标"推断 Tension Position 可能不够准确。

**建议**: 在 Step 2 增加可选追问：

```
如果用户选择"稳定可靠"：
追问（可选）: "当需要在速度和稳定性之间选择时，你通常会怎么做？"
  ○ 优先速度，边跑边修
  ○ 优先稳定，宁可慢一点
  ○ 看情况，没有固定偏好
```

### 5.2 工作模式选项粒度 ⚠️

**问题**: Step 3 的 3 个选项可能不够覆盖实际场景。

**建议**: 增加混合模式选项：

```
○ 混合模式
  有些项目我自己开发，有些项目我只需要提需求
```

### 5.3 Ontology 构建可见性 ⚠️

**问题**: 用户看不到 Ontology 的构建过程和结果。

**建议**: 在成功界面提供可展开的业务模型预览：

```
┌─────────────────────────────────────────────────────────────────┐
│  项目创建成功！                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  [展开] 识别到的业务领域                                        │
│  ├─ 库存管理                                                    │
│  ├─ 订单处理                                                    │
│  └─ 商品追踪                                                    │
│                                                                 │
│  这些会在后续使用中帮助助手更好地理解你的项目                    │
└─────────────────────────────────────────────────────────────────┘
```

### 5.4 后续补充入口 ✅

**评估**: 设计支持"稍后完善"，用户可以在项目设置中补充信息。这是合理的渐进式策略。

---

## 6. 与 Phase 1.5 衔接评估

### 6.1 API 设计评估 ✅

| API | 功能 | 与 C.1 一致性 |
|-----|------|--------------|
| POST /api/project/create/start | 开始访谈 | 与 C.1 对话式一致 |
| POST /api/project/create/:sessionId/answer | 回答问题 | 与 C.1 message 一致 |
| POST /api/project/create/:sessionId/complete | 完成 | 与 C.1 analyze 一致 |

### 6.2 存储结构评估 ✅

```
data/taste/users/{userId}/profile.json    ← User TASTE (C.1)
data/taste/projects/{projectId}/profile.json ← Project TASTE (C.5)
data/ontologies/{projectId}/              ← 业务模型 (C.5)
```

**评估**: 存储结构清晰，两层分离合理。

---

## 7. 最终评估

### 总体评分: ⭐⭐⭐⭐☆ (优秀，有小改进空间)

| 评估维度 | 评分 | 说明 |
|---------|------|------|
| 隐形采集原则 | ⭐⭐⭐⭐⭐ | 完全贯彻 |
| TASTE 四维度覆盖 | ⭐⭐⭐⭐☆ | Tension Position 可加强 |
| 与 C.1 一致性 | ⭐⭐⭐⭐⭐ | 设计系统一致 |
| 融合机制 | ⭐⭐⭐⭐☆ | 需增加冲突处理 |
| 用户价值主张 | ⭐⭐⭐⭐☆ | 需增加价值暗示 |
| API 设计 | ⭐⭐⭐⭐⭐ | 与 C.1 一致 |

### 设计批准状态: ✅ 通过（附条件）

设计方案整体优秀，建议采纳以下改进后再进入开发：

### 必须改进 (P1)
无

### 建议改进 (P2)
1. **Step 2 增加可选追问** - 提升 Tension Position 提取精度
2. **成功界面增加价值暗示** - 让用户感知 AI 配置的价值
3. **增加业务模型预览** - Ontology 可见性

---

## 8. 下一步行动

### 立即执行
- [x] 设计方案审核完成
- [ ] 向 PM 汇报审核结果
- [ ] 与 UX Designer 确认改进建议

### 后续准备
- [ ] 等待 C.1 开发完成后启动 C.5 开发
- [ ] 准备 C.5 API 设计文档

---

## 9. 融合策略详细设计（补充）

### 9.1 User TASTE + Project TASTE 融合规则

```typescript
interface TASTEMergeStrategy {
  // 经验拓扑：合并去重
  experience_topology: {
    strategy: 'merge';
    priority: 'none';  // 无优先级，合并所有
  };

  // 品味标准：项目优先
  taste_standards: {
    strategy: 'project_priority';
    sameDomain: 'project_wins';  // 同领域时项目覆盖用户
    diffDomain: 'merge';         // 不同领域合并
  };

  // 张力位置：加权平均
  tension_position: {
    strategy: 'weighted_average';
    weights: { user: 0.3, project: 0.7 };  // 项目权重更高
  };

  // 共生边界：交集优先
  symbiosis_boundary: {
    delegated_domains: 'intersection';  // 委托域取交集（更谨慎）
    reserved_domains: 'union';          // 保留域取并集（更保守）
  };
}
```

### 9.2 融合时机

| 时机 | 行为 | TASTE 状态 |
|------|------|-----------|
| 启动 OriginOS | 加载 User TASTE | User only |
| 进入项目 A | 加载 Project A TASTE → 融合 | Merged (User + Project A) |
| 切换到项目 B | 卸载 Project A → 加载 Project B → 融合 | Merged (User + Project B) |
| 退出所有项目 | 卸载 Project TASTE | User only |

---

**审核结论**: 设计方案优秀，建议采纳 P2 改进后进入开发阶段。

---

**签字**: Product Designer
**日期**: 2026-03-16
