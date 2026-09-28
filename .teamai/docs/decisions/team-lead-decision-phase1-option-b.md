# Team Lead Decision: Phase 1 Strategy - Option B (Progressive)

## 核心决策

**Option B (渐进式 + 架构准备) 被批准作为 Phase 1 策略**

---

## 理由

### 1. 认知精髓的传递方式

TASTE.md 的本质是 **Weights → Activity 的工程路径**，而非一次性配置。

| 传统理解 | 正确理解 |
|---------|---------|
| 静态偏好列表（一次填写，永久使用） | 动态存在论表达（Activity → Weights 循环） |
| 显式配置（表单填写） | 隐性提取（通过对话和使用抽取） |
| User teaches system | System observes user's embodied experience |

渐进式的本质符合认知框架：
- **Phase 1 (Observer Mode)**: 系统观察用户的具身经验，建立初步 weights
- **Phase 2 (Local Loop)**: 隐性反馈，系统说"我注意到你喜欢 X"，用户验证
- **Phase 3 (Ontology Crystallization)**: 用户获得完整编辑权，weights 结晶为明确结构

这不是"简化"，这是**正确的工程路径**。

### 2. 避免风险的关键措施

PM 提出的担忧：如何避免"偏离认知精髓"？

**Team Lead 的回答：通过明确定义"认知精髓"来避免偏离**

认知精髓不在于：
- ❌ 一次性完整呈现4个维度的UI
- ❌ 让用户理解"具身直观感知"、"存在论表达"

认知精髓在于：
- ✅ 系统通过 Activity 抽取 Weights
- ✅ 系统行为体现 ECO 张力和边界
- ✅ 用户保留控制权（Human in the Loop）
- ✅ 为 Phase 3 的完整显式编辑预留架构

---

## 三个关键约束（防止偏差）

### 约束 1：架构完整性

即使 Phase 1 不完全使用，数据结构必须支持完整4个维度。

```sql
-- Phase 1 可能只填充 experience_topology 和 taste_standards
-- 但表结构必须预留所有字段
CREATE TABLE taste_manifest (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,

  -- 经验拓扑：直觉感知领域
  experience_topology JSONB,  -- Phase 1: 从对话抽取

  -- 品味标准：直接感知判断
  taste_standards JSONB,       -- Phase 1: 从对话抽取

  -- 张力位置：人/LLM/代码三方定位
  tension_position JSONB,      -- Phase 1: 简单滑块（信任度）

  -- 共生边界：判断委托范围
  symbiosis_boundary JSONB,    -- Phase 1: 隐性（通过行动确认体现）

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**关键：** Architect 必须确保表结构支持 Phase 3 的完整需求。

### 约束 2：价值演示机制

Phase 1 末期，必须有一个"价值演示"环节：

```
用户体验流程：
[Week 1-3] 使用系统 + 对话式文化检测
         ↓
[Week 4] 系统展示："因为我学习了你的偏好，所以..."
         ↓
         案例展示：
         - "没有 TASTE.md，我会建议过复杂的重构"
         - "有了对你是'偏好简洁'的理解，我建议了小范围重构"
         - 结果："这个建议是否更符合你的期望？"
```

**目的：** 让用户"感觉"到差异，而非"理解"概念。

### 约束 3：结晶化承诺

在产品文档中明确标注 Phase 3 的承诺：

```markdown
## Roadmap

### Phase 1: Observer Mode (当前)
- 对话式文化检测
- 隐性抽取 experience_topology + taste_standards
- 简单 Profile 展示

### Phase 2: Local Loop (未来 3-6 个月)
- 隐性反馈："我注意到你喜欢 X"
- 用户验证或调整

### Phase 3: Ontology Crystallization (承诺 6-9 个月)
- 完整 4 维度显式编辑器
- 包括：experience_topology 编辑器, taste_standards 编辑器,
         tension_position 配置系统, symbiosis_boundary 规则引擎
```

**关键：** PD 必须在 messaging 中传达这个承诺。

---

## Phase 1 的功能定义（基于共识）

基于 PM, UX Designer, PD, QA Engineer 的综合方案：

| 功能 | 本质 | 认知精髓体现 |
|-----|-----|-------------|
| **文化检测** | 对话式抽取 experience_topology + taste_standards | Activity → Weights 的起点 |
| **行动确认** | 显化 tension_position（介入时刻） | ECO 张力，用户控制 |
| **基础 Profile** | display 显化抽取的品味 | 保持透明度 |
| **信任学习** | Activity → Weights 结晶化模式 | 习惯的形成 |

---

## 对 PM 三个问题的回答

### 问题 1：选项 B 是否可接受？

**✅ 可接受**，并且符合认知框架本质。

### 问题 2：如何描述才能避免"偏离认知精髓"？

**通过三个约束：**
1. 架构完整性（数据结构支持未来扩展）
2. 价值演示机制（让用户感知到差异）
3. 结晶化承诺（明确 Phase 3 会提供完整编辑器）

** messaging 上的建议（与 PD 的三层策略一致）：**

外部 messaging：
```
"OriginOS learns your coding style through conversation → adapts suggestions → gives you control

Over time: 'I've learned that you prefer clean over clever'
Want to fine-tune? You can edit your style profile at any time."
```

内部文档标注：
```
Phase 1: Activity Collection - Observer Mode
Phase 2: Implicit Feedback - "I noticed X" summaries
Phase 3: Explicit Crystallization - TASTE.md ontological editor
```

### 问题 3：如果不可接受，是否调整时间线？

**不调整时间线**，因为：
1. 选项 B 符合认知框架本质（渐进更符合 Activity → Weights）
2. 时间线延长不会解决用户认知门槛问题
3. UX 和 PD 的方案已经解决了"偏离精髓"的风险

---

## 下一步行动（指派给各角色）

### ✅ PM
- [ ] 更新 `docs/product/phase-1-cognitive-features.md`（基于渐进步骤）
- [ ] 整合 PD 的三层 messaging 策略
- [ ] 明确标注 Phase 3 承诺

### ✅ UX Designer
- [ ] 设计文化检测对话流程（3-5 轮）
- [ ] 设计 TASTE.md 草稿展示界面
- [ ] 设计价值演示 UI（Phase 1 末期）

### ✅ PD
- [ ] 完善 Onboarding messaging（Layer 1）
- [ ] 设计 Growth messaging（Layer 2-3）
- [ ] 设计 Power User messaging（Layer 4）

### ✅ Architect
- [ ] 设计完整的 4 维度数据结构（支持 Phase 3）
- [ ] 验证对话抽取的技术可行性
- [ ] 评估 tension_position 的简化实现（滑块 vs 完整配置）

### ✅ Developer
- [ ] 确认 Week 1-2 实现"文化检测 + TASTE.md 草稿生成"可行
- [ ] 设计对话抽取数据流（对话 → LLM 分析 → JSONB 存储）
- [ ] 确认 PostgreSQL JSONB 足够支持 Phase 1 需求

### ✅ QA Engineer
- [ ] 设计"隐性抽取准确性"测试
- [ ] 设计 A/B 测试（TASTE.md 草稿 vs 无草稿）
- [ ] 设计价值演示环节的测试

---

## 成功标准（Phase 1）

### 用户感知层面
1. 用户文化检测后感觉"系统了解我的风格"
2. 用户行动确认时感觉"我在控制"
3. 用户基础 Profile 让他们看到系统记了什么

### 认知精髓层面
1. 系统通过对话成功抽取用户的部分品味
2. 系统行为体现 ECO 张力（通过行动确认）
3. 架构为 Phase 3 完整编辑器预留空间

### 技术层面
1. 数据结构支持未来扩展
2. 对话抽取准确率 > 60%（用户验证）
3. Week 1-2 技术实现可行（Architect 和 Developer 确认）

---

## 结论

**Phase 1 采用渐进式策略，通过三个关键约束避免偏离认知精髓：**
1. 架构完整性（数据结构支持 Phase 3）
2. 价值演示机制（让用户感知差异）
3. 结晶化承诺（明确 Phase 3 完整编辑器）

**这种渐进方式不是"简化"，而是符合认知框架 essence 的正确工程路径：**
- Phase 1: Observer Mode（Activity → Weights 起点）
- Phase 2: Local Loop（隐性反馈循环）
- Phase 3: Ontology Crystallization（完整显式控制）

**请各角色立即行动，目标：1 天内完成 Phase 1 需求和设计文档更新。**

---

**决策时间：** 2026-03-05
**决策状态：** 最终决策
**生效范围：** Phase 1 完整技术路线图
