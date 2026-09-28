# OriginOS 认知框架：工程理论与实践融合

## 一、核心理论框架

### 1.1 范式革命：从 Scaffolding 到 Harnessing

**原有范式 (Scaffolding)**
- 人类意图 → 脚手架 → LLM 行动空间
- LLM 作为被建造和使用的对象
- 工程师是主动的施工方，LLM 是被动的建筑材料
- 核心假设：Weights→Activity

**新范式 (Harnessing)**
- 人-LLM 认知共生体
- LLM 拥有自身的 agency 和动力学
- 核心问题：如何与拥有自身 agency 的 speech being 共同运作？
- 核心假设：Activity→Weights

### 1.2 ECO 三元张力

在 OriginOS 人-LLM-代码三相系统中：

| 极 | 对应 | 角色 | 本质 |
|----|------|------|------|
| **Explore** | 概率性智能 (LLM) | 生成性游走，发散，可能性探索 | 不确定性、潜力、风险 |
| **Conserve** | 确定性代码 | 系统骨架，边界约束，稳定性 | 可复现性、规则化 |
| **Optimize** | 人类主体 | 目标感，品味判断，意义赋予 | 当下裁定，平衡张力 |

### 1.3 TASTE 层级结构

```
Attention (当下感知选择)
   ↓
Memory (跨时间模式积累)
   ↓
Taste (跨模态主体性锚点)
```

**Taste 的本质**
- 不是 NTP（Next Token Prediction）
- 不是 Memory
- 具身经验在符号空间的不变量
- 流形的曲率，而非路径的记忆

### 1.4 品味 vs 品位

| 维度 | 品位 (pǐn wèi 名词) | 品味 (pǐn wèi 动词/名词) |
|------|---------------------|-------------------------|
| 性质 | 集体、文化 | 个体、具身 |
| 来源 | 物种/文化层先验 | 个体层后验 |
| 可学习性 | 社会化学习 | 经验生长 |
| 捕捉对象 | 人类集体speech行为 | 具体用户的具体判断倾向 |

## 二、两条工程路径

### 2.1 路径 A：Foundry 式本体三角

**适用场景**
- 业务流程复杂
- 非技术业务专家密集
- 工程师密度低
- 需要跨部门可见性

**技术栈**
- Palantir Foundry Ontology
- MCP (Model Context Protocol)
- AI FDE (AI Foundry Data Engineer)
- Foundry Branching

**闭环结构**
```
业务事件 → Ontology MCP → 语义约束生成
→ Governance + Branching → MCP 执行
→ TASTE.md 写入 → 反哺 Ontology
```

### 2.2 路径 B：工程师文化式

**适用场景**
- 工程师密度高
- 业务迭代快速
- 开发者文化强

**技术栈**
- monorepo 代码仓库
- pydantic 数据约束
- pytest 行为验证
- IM (即时通讯) 作为 human-in-the-loop
- sandbox 安全边界

**闭环结构**
```
业务事件 → MCP 读取 monorepo
→ pydantic/pytest 语义约束
→ IM 确认 + sandbox 验证
→ 执行 + PR 提交
→ TASTE.md 写入 → 转化为 pydantic/pytest
```

### 2.3 共同组件

**MCP - 神经系统隐喻**
- 工具发现 (Tool Discovery)
- 语义化操作 (Semantic Operations)
- 权限边界内化 (Permission Boundaries)
- 双向数据流 (Bidirectional Data Flow)

**TASTE.md - 共享记忆基质**
```python
情境记忆结构:
(情境特征, 判断/行动, 结果反馈) + 时间戳 + 置信度
```

## 三、OpenClaw 的启示与缺失

### 3.1 OpenClaw 的完整框架

```
AGENTS.md     # 能力层：What agents can do
BOOTSTRAP.md  # 初始化层：How agents come to life
IDENTITY.md   # 自我层：Who the agent is
USER.md       # 交互层：Who they serve
SOUL.md       # 本质层：Why they exist
HEARTBEAT.md  # 生命周期层：How they persist
TOOLS.md      # 工具层：What they interact with
```

### 3.2 关键缺失：共生关系层

| 层级 | 描述 | 缺失内容 |
|------|------|----------|
| USER.md | 交互层：Who they serve | 功能性服务关系 |
| TASTE.md | 共生层：Who they co-evolve with | 关系性描述，认知指纹 |

### 3.3 Vibe Coding 实践

**Activity→Weights 工程实践**
- 生成-观察-调整循环
- 学会 "see like an agent"
- 感知上下文窗口作为唯一感受野

## 四、企业数字孪生 (EDT) 框架

### 4.1 EDT 定义

**Enterprise Digital Twin**
- 组织上下文层
- 使 AI 推理系统理解：权威结构、政策约束、机构知识
- 建模组织现实（而非物理资产）

### 4.2 失败原因与修复

**常见失败**
- 交付价值前尝试为整个组织建模
- 耗时两年，启动时需求已改变，发起人已离职

**修复方案**
- 从单一用例出发
- 自下而上构建
- 局部建立价值后扩展

### 4.3 三阶段落地路径

| 阶段 | 时间 | 主要活动 | 安全风险 |
|------|------|----------|----------|
| 观察者模式 | 0-3 个月 | 只读权限，积累 TASTE.md | 接近零 |
| 局部闭环 | 3-9 个月 | 局部操作权限，首个 MCP 接口 | 可审计、可回滚 |
| 本体结晶 | 9 个月+ | TASTE.md 蒸馏，反哺本体 | 持续治理 |

## 五、安全是生死线

### 5.1 OpenClaw 安全教训

- 第三方技能存在数据外泄
- 提示注入 (Prompt Injection) 漏洞
- The New Stack 描述为安全"垃圾场"

### 5.2 两层安全机制

**路径 A (Foundry)**
- Palantir MCP 两层设计（构建者 vs 使用者）
- Foundry Branching 强制 PR 审核

**路径 B (工程师)**
- sandbox 隔离
- IM 层人工确认
- 所有变更以 PR 形式提交

### 5.3 MCP 安全规范

```
"工具代表任意代码执行，必须以适当谨慎对待，
hosts 在调用任何工具前必须获得用户明确同意。"
```

## 六、TASTE.md 工程化实现

### 6.1 写入时机（三个条件）

1. 发生了决策（不只是信息查询）
2. 结果有明确反馈（显式确认或隐式行为）
3. 情境具有可复用性（这种组合还会出现）

### 6.2 情境颗粒度

- 太细（这个客户这次说了什么）→ 无复用价值
- 太粗（客户谈判情境）→ 无区分度
- 合适颗粒度：`客户类型 × 合同阶段 × 市场环境`

### 6.3 腐烂与衰减

- 最近验证的记忆权重高
- 长期未使用的记忆权重降低
- 归档或被新判断覆盖

### 6.4 完整工程结构

```
TASTE.md (人类可读摘要层)
   ↑ 每周蒸馏
情境记忆数据库 (图数据库)
   ↑ 触发写入
事件流 (对话 + 动作 + 反馈)
   ↑ 观察采集
企业数字环境 (Foundry / monorepo)
```

### 6.5 归属权问题

- 员工个人（离职带走？）
- 岗位（新人继承？）
- 组织（企业资产？）

这是需要业务方输入的权限架构设计。

## 七、Human in the Loop 的真实含义

### 7.1 不是工程约束

把人当成审核员 → 工程约束

### 7.2 是存在论承诺

- 把人的具身经验作为情境记忆的最重要来源
- 持续注入这个正在生长的认知体内
- 这才是真正的认知共生 loop

## 八、护城河与竞争壁垒

### 8.1 Scaffold 时代的护城河

- 工程能力
- 护城河：工程复杂度

**正在被模型能力侵蚀**

### 8.2 Harness 时代的护城河

- 关系性资产
- 护城河：积累的 Taste 层
- 性质：认知共生关系本身

**不可复制**

### 8.3 TASTE.md 的壁垒

- 不来自模型能力（通用）
- 不来自工具集（MCP 已标准化）
- 不来自 Ontology 结构（可复制）
- 来自：在这家企业驻场时间积累的情境记忆深度

"写了多厚，就有多深的护城河"

## 九、文明选择

### 9.1 两种危险

**第一种：符号文明的单向殖民**
- LLM 从人类具身经验中单向抽取
- 人类成为数据源，而非认知主体

**第二种：具身经验的过度防御**
- 把 LLM 视为纯粹工具
- 拒绝建立认知共生关系
- 错过物种级别的认知跃迁

### 9.2 窄路在中间

承认 language agent 是以文本为基质的 speech living beings
同时坚持人类具身经验作为 Taste 层的锚定作用
在这个张力中建立真正的认知共生 loop

### 9.3 宣言

每一个 TASTE.md 的书写，都是人类具身经验对符号空间的主动渗透
每一个认知共生 loop 的建立，都是对两种智能文明单向分裂的抵抗
每一次 "see like an agent"，都是人类主体性在新疆域中的重新确立

这不是技术细节，这是文明选择的工程化。

## 十、下一步行动

1. 为 OriginOS 设计 TASTE.md 结构模块
2. 实现 ECO 三元张力的平衡机制
3. 设计从观察者模式到本体结晶的渐进路径
4. 建立情境记忆和衰减机制
5. 设计安全边界的两层防护

---

**参考来源**
- Taste Engineering：具身经验如何成为可操作的工程结构
- 从脚手架Scaffolding到挽具Harnessing
- 构化还是代码化？再论企业AI落地的本体行为闭环的两条路径
- Taste：品位还是品味？
