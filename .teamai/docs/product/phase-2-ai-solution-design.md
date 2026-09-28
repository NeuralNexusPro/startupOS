# 第二阶段：AI 解决方案设计 - 产品需求文档

## 文档信息

- **版本**: v1.0
- **创建日期**: 2026-04-20
- **状态**: 需求确认完成
- **负责人**: Product Team

---

## 1. 概述

### 1.1 阶段定位

第二阶段是 **AI 解决方案的概要设计阶段**，基于第一阶段沉淀的业务模型，设计 AI Native 解决方案。本阶段只产出方案和设计，不进行实际的 Agent/RoleAgent 创建和执行。

### 1.2 核心目标

- 将业务模型转化为 AI Native 的 Agent 架构设计
- 提供两种建模视角：事的维度（Agentic Workflow）和人的维度（Agentic System）
- 通过沙盒执行验证方案可行性
- 输出执行清单，约束第三阶段的详细设计与实施

### 1.3 前置条件

- 项目必须存在业务模型（`ontologyId` 不为空）
- 本体结构已完成（业务对象、流程、规则已定义）

---

## 2. 核心概念

### 2.1 建模视角

**事的维度（Task-based）**
- 适用场景：规则可枚举、执行确定性强的业务
- 运行模式：Agentic Workflow
- 设计重点：业务流程分解、任务节点识别、Agent 职责划分
- 内聚性依据：业务领域的内聚性

**人的维度（Role-based）**
- 适用场景：强依赖人决策、开放探索性的业务
- 运行模式：Agentic System
- 设计重点：岗位职责模型、角色协作关系、RoleAgent 团队设计
- 内聚性依据：岗位职责边界

### 2.2 方案结构

```
Solution（解决方案）
├── 基本信息
│   ├── id
│   ├── projectId（归属项目）
│   ├── ontologyId（基于哪个本体版本）
│   ├── name
│   ├── version（支持多版本）
│   └── status（draft | reviewing | confirmed）
├── 设计内容
│   ├── modelingDimension（"task" | "role"）
│   ├── businessGoal（业务目标描述）
│   ├── recommendation（AI 推荐理由）
│   ├── agents[]（Agent/RoleAgent 规划列表）
│   │   ├── id
│   │   ├── type（"agent" | "role-agent"）
│   │   ├── name
│   │   ├── responsibility（职责描述）
│   │   ├── domain（业务领域）
│   │   ├── ontologyObjects[]（操作的本体对象）
│   │   └── collaborations[]（协作关系）
│   └── topology（协作拓扑可视化数据）
└── 产物
    └── executionManifest（执行清单，供第三阶段消费）
```

### 2.3 SOP I/O 契约（本体数据流）

第二阶段还需要明确每个 SOP 步骤的**输入输出都是本体对象集合**，这样 Agent 才能知道怎么通过操作本体工具获取输入、通过调用技能产出输出。

**设计原则**：
- SOP 步骤的输入输出都是对本体对象集合的操作声明
- Skill 需要声明 `inputContract`（期望从本体读取什么）和 `outputContract`（承诺向本体写入什么）
- 上游步骤的 `outputContract.produces` 必须与下游步骤的 `inputContract.requires` 匹配
- Agent 执行时根据 I/O 契约自动路由：`queryEntities()` → 调用 Skill → `createEntity()`/`updateEntity()`

**方案结构扩展**：

```
Solution（解决方案）
├── 基本信息
├── 设计内容
│   ├── agents[]
│   │   └── skills[]
│   │       ├── ontologyObjects（已存在）     # 操作哪些本体对象
│   │       ├── inputContract（新增）         # 期望从本体读取什么
│   │       ├── outputContract（新增）        # 承诺向本体写入什么
│   │       └── sopIO（新增）                # SOP 步骤级数据流
│   └── topology
└── 产物
```

**Skill I/O 契约示例**：

```json
{
  "id": "naming-reviewer",
  "ontologyObjects": {
    "位号": ["read"],
    "命名审查结果": ["create"]
  },
  "inputContract": {
    "requires": [
      {
        "objectType": "位号",
        "minCount": 1,
        "fields": ["位号名称", "项目类型", "审查对象类型"]
      },
      {
        "objectType": "命名规则",
        "minCount": 1,
        "fields": ["规则项", "连接符"]
      }
    ]
  },
  "outputContract": {
    "produces": [
      {
        "objectType": "命名审查结果",
        "fields": ["位号ID", "是否符合", "不符合原因", "准确率"]
      }
    ]
  }
}
```

**SOP 数据流连通性验证**：

当 solution-design skill 规划 SOP 时，需要自动验证：
- 每个 Skill 的 `inputContract.requires` 是否都有数据来源（上游产出或用户输入）
- 不存在"断流"的步骤（需要的数据没有步骤产出）
- 循环依赖检测（A 产出 X → B 需要 X 产出 Y → C 需要 Y 产出 X）

---

### 2.4 三种维度的完整规划

结合上述扩展，第二阶段的完整规划框架为：

| 维度 | 回答的问题 | 产出物 |
|------|-----------|--------|
| **资源维度** | 需要什么 Agent 和 Skill？ | Agent + Skill 清单 |
| **流程维度** | 这件事分几步？每步输入输出是什么？ | SOP DAG + I/O 契约 |
| **组织维度** | 这类任务需要怎样的团队？ | Team Pattern 模板 |

---

## 3. 功能模块

### 3.1 入口与窗体

**入口位置**
- 项目窗体内新增"AI 解决方案"入口按钮
- 前置条件检查：项目必须存在业务模型

**窗体结构**
```
解决方案窗体（独立窗体）
├── 左侧：方案列表（版本管理）
├── 中间：方案编辑区
│   ├── 建模维度 + AI 推荐理由
│   ├── Agent/RoleAgent 规划列表
│   └── 协作拓扑可视化
└── 右侧：沙盒执行区（独立功能区）
    ├── 典型场景列表
    ├── 推演过程输出
    └── 推演报告 + 本体缺口报告
```

### 3.2 方案初始化

**AI 分析流程**
1. 读取项目本体结构（业务对象、流程、规则）
2. 分析业务特征，判断建模维度
3. 输出推荐结果 + 推荐理由

**建模维度判断逻辑**
```
IF 规则可枚举 AND 执行确定性强
  THEN 推荐"事的维度"（Agentic Workflow）
ELSE IF 强依赖人决策 AND 开放探索性
  THEN 推荐"人的维度"（Agentic System）
```

**初版方案生成**
- 业务领域划分建议
- Agent/RoleAgent 列表草稿
- 初步协作关系

### 3.3 方案编辑（迭代式）

**用户可调整内容**
- 接受或修改建模维度
- 调整 Agent 的职责边界
- 修改业务领域划分
- 调整 Agent 操作的本体对象
- 修改协作关系

**实时反馈**
- 每次修改后 AI 同步更新拓扑图
- 一致性检查（孤立 Agent、死循环流程）

### 3.4 协作拓扑可视化

**可视化元素**
- 节点：Agent/RoleAgent
- 边：协作关系（触发/通知/依赖）
- 节点颜色：区分事的维度 vs 人的维度
- 交互：点击节点查看详情

### 3.5 沙盒执行（模拟运行）

**核心机制**
```
本体结构（Schema）
    ↓ AI 根据字段类型/约束自动生成
模拟数据实例（Mock Data）
    ↓ 注入沙盒环境
Agent 在沙盒中运行，读写模拟数据
    ↓
输出推演过程和结果（不持久化）
```

**触发方式**
- 独立功能区，用户可随时触发
- 系统自动生成 3-5 个典型场景（基于本体和业务目标）
- 用户选择场景后启动推演

**典型场景生成**
- AI 读取本体结构 + 业务目标 + Agent 职责
- 推断代表性业务场景（正常流、异常流、边界情况）
- 每个场景包含：场景描述、触发条件、预期结果

**模拟数据生成规则**
- 字符串字段 → 根据字段名语义生成（如 `customerName` → "张三"）
- 数字字段 → 根据约束范围随机生成
- 枚举字段 → 随机选取枚举值
- 关联关系 → 生成关联对象的模拟实例
- 时间字段 → 生成合理的时间序列
- 数据粒度 → AI 根据业务场景判断每个本体对象的实例数量

**推演输出**
1. **推演报告**：各 Agent 的响应过程和结果
2. **本体缺口报告**：推演中发现本体结构不足以支撑 Agent 操作的地方

### 3.6 本体反馈回路

**缺口发现机制**
- 沙盒推演中，Agent 需要操作本体中不存在的字段/对象
- AI 记录缺口并生成报告

**反馈流程**
```
沙盒推演 → 发现本体缺口 → 生成缺口报告 → 用户确认
    ↓
用户选择：
  - 返回第一阶段修改本体 → 重新推演
  - 忽略缺口，继续方案设计
```

**约束**
- 缺口报告需用户确认后才能修改本体，避免误操作
- 修改本体后需重新推演验证

### 3.7 方案版本管理

**版本特性**
- 一个项目可以有多个方案版本
- 支持版本对比（Agent 数量、协作关系差异）
- 确认某个版本后，生成执行清单，进入第三阶段

**版本状态**
- `draft`：草稿，可编辑
- `reviewing`：审阅中，可沙盒执行
- `confirmed`：已确认，生成执行清单，锁定

### 3.8 执行清单生成

**清单结构**
```json
{
  "solutionId": "sol-xxx",
  "solutionVersion": "v1.0",
  "modelingDimension": "task",
  "businessGoal": "...",
  "agents": [
    {
      "id": "agent-001",
      "name": "订单处理 Agent",
      "type": "agent",
      "responsibility": "处理订单创建、修改、取消等操作",
      "domain": "订单管理",
      "ontologyObjects": [
        {
          "name": "Order",
          "operations": ["create", "update", "cancel"]
        },
        {
          "name": "Product",
          "operations": ["read"]
        }
      ],
      "skills": [
        {
          "id": "order-validator",
          "ontologyObjects": { "Order": ["validate"] },
          "inputContract": {
            "requires": [
              { "objectType": "Order", "fields": ["customerName", "items", "total"] }
            ]
          },
          "outputContract": {
            "produces": [
              { "objectType": "Order", "fields": ["validationStatus", "validationErrors"] }
            ]
          }
        }
      ],
      "collaborations": [
        {
          "targetAgentId": "agent-002",
          "targetAgentName": "库存 Agent",
          "type": "trigger",
          "description": "订单创建后触发库存扣减"
        }
      ]
    }
  ],
  "topology": {
    "nodes": [...],
    "edges": [...]
  }
}
```

**清单用途**
- 第三阶段手动创建 Agent 时的引导性文档
- 预填 Agent 的职责、协作关系等信息
- 用户可在创建过程中调整（增删改）

---

## 4. 用户旅程

### 4.1 完整流程

```
1. 进入解决方案窗体
   └── AI 分析本体，推荐建模维度（事/人）+ 理由

2. 方案初始化
   └── AI 生成初版 Agent 规划草稿

3. 迭代编辑
   ├── 调整 Agent 职责/领域划分
   ├── 修改协作关系
   └── 拓扑图实时同步

4. 沙盒执行（随时可触发）
   ├── 系统生成典型场景列表
   ├── 用户选择场景
   ├── AI 生成模拟数据实例（基于本体 Schema）
   ├── 临时实例化 Agent 推演
   └── 输出推演报告 + 本体缺口报告
       └── 如有缺口 → 提示用户确认 → 返回第一阶段修改本体

5. 方案确认
   └── 生成执行清单（JSON），进入第三阶段
```

### 4.2 关键决策点

**决策点 1：建模维度选择**
- 时机：方案初始化时
- 决策者：AI 推荐 + 用户确认
- 影响：决定后续 Agent 规划的方向

**决策点 2：本体缺口处理**
- 时机：沙盒推演后
- 决策者：用户
- 选项：返回第一阶段修改本体 / 忽略缺口继续

**决策点 3：方案版本确认**
- 时机：方案设计完成后
- 决策者：用户
- 影响：锁定方案，生成执行清单，进入第三阶段

---

## 5. 数据存储

### 5.1 存储位置

```
项目目录/
└── solutions/
    ├── solution-v1.0.json
    ├── solution-v1.1.json
    └── execution-manifests/
        ├── solution-v1.0-manifest.json
        └── solution-v1.1-manifest.json
```

### 5.2 文件结构

**方案文件（solution-v1.0.json）**
```json
{
  "id": "sol-xxx",
  "projectId": "proj-xxx",
  "ontologyId": "onto-xxx",
  "name": "订单管理 AI 解决方案",
  "version": "v1.0",
  "status": "confirmed",
  "modelingDimension": "task",
  "businessGoal": "...",
  "recommendation": "...",
  "agents": [...],
  "topology": {...},
  "createdAt": 1713600000000,
  "updatedAt": 1713600000000
}
```

**执行清单（solution-v1.0-manifest.json）**
- 见 3.8 节

---

## 6. 技术约束

### 6.1 沙盒隔离

- 沙盒内的 Agent 是临时实例化的，不持久化
- 模拟数据不写入真实数据库
- 推演过程和结果仅用于验证，不影响生产环境

### 6.2 本体访问

- 沙盒 Agent 可以访问本体结构（Schema）
- 不能访问真实的本体数据实例（第三阶段才有数据 setup）
- 基于本体结构自动生成模拟数据

### 6.3 Skill 规划

- 第二阶段需要为每个 Skill 定义 **I/O 契约**：
  - `inputContract`：声明 Skill 期望从本体读取哪些对象、需要哪些字段
  - `outputContract`：声明 Skill 承诺向本体写入哪些对象、会填充哪些字段
  - `sopIO`：SOP 步骤级数据流（输入来源、输出去向）
- I/O 契约用于验证步骤间数据流连通性，Agent 执行时自动路由本体工具调用
- 第二阶段不涉及 Skill 的具体配置代码，只规划数据契约

---

## 7. 与其他阶段的关系

### 7.1 第一阶段 → 第二阶段

**输入**
- 项目基本信息
- 本体结构（业务对象、流程、规则）

**依赖**
- 必须完成本体建模才能进入第二阶段

**反馈回路**
- 沙盒推演发现本体缺口 → 返回第一阶段补充本体

### 7.2 第二阶段 → 第三阶段

**输出**
- 执行清单（JSON）
- 方案文档（Markdown）

**约束**
- 执行清单约束第三阶段的详细设计
- 用户在第三阶段可以调整，但需基于清单引导

**边界**
- 第二阶段：概要设计，只规划职责和协作关系
- 第三阶段：详细设计与执行，配置 Skill，创建实际 Agent，数据 setup

---

## 8. 非功能需求

### 8.1 性能

- 方案初始化：< 10 秒
- 沙盒推演：< 30 秒（取决于场景复杂度）
- 拓扑图渲染：< 2 秒

### 8.2 可用性

- 支持方案草稿自动保存
- 支持撤销/重做操作
- 提供操作引导和帮助文档

### 8.3 可扩展性

- 支持自定义建模维度（未来扩展）
- 支持自定义场景模板（未来扩展）
- 支持方案导入/导出（未来扩展）

---

## 9. 后续规划

### 9.1 第三阶段需求

- 基于执行清单手动创建 Agent/RoleAgent
- 配置 Skill 和工具
- 数据 setup（本体实例数据初始化）
- 业务运行和监控

### 9.2 未来优化

- 方案 A/B Test 支持
- 方案效果评估和优化建议
- 跨项目方案复用
- 方案市场（分享和下载优秀方案）

---

## 10. 附录

### 10.1 术语表

- **本体（Ontology）**：业务模型的结构化表达，包含业务对象、流程、规则
- **Agent**：单一职责的智能体，按事的维度建模
- **RoleAgent**：角色化的智能体，按人的维度建模
- **Agentic Workflow**：以任务流程为中心的 Agent 协作模式
- **Agentic System**：以角色团队为中心的 Agent 协作模式
- **沙盒执行**：在隔离环境中临时实例化 Agent 进行推演验证
- **执行清单**：方案确认后生成的结构化文档，供第三阶段消费

### 10.2 参考资料

- [第一阶段：业务复刻与模型沉淀](./phase-1-business-modeling.md)（待补充）
- [第三阶段：详细设计与执行](./phase-3-implementation.md)（待补充）
- [本体设计规范](../architecture/ontology-design-spec.md)（待补充）

---

**文档结束**
