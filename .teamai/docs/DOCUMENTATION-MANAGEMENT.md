# 文档协作管理规范

**版本：** 1.0.0
**日期：** 2026-03-02
**状态：** 强制执行

---

## 📋 文档目的

本文档定义 OriginOS 项目的文档协作管理机制，确保所有需求、设计和开发文档以 Story 为单位进行组织和管理。

---

## 📁 文档目录结构

### 核心原则

**以 Story 为单位组织所有文档**，每个 Story 拥有独立的 spec 目录。

### 目录结构

```
docs/
├── specs/                          # Story 规格文档目录
│   ├── epic-1/                     # Epic 1: 项目快速启动
│   │   ├── story-1.1/              # Story 1.1: 项目访谈流程启动
│   │   │   ├── README.md           # Story 概览和状态
│   │   │   ├── requirements.md     # 需求文档
│   │   │   ├── interaction.md      # 交互设计文档
│   │   │   ├── architecture.md     # 架构设计文档
│   │   │   ├── implementation.md   # 开发文档
│   │   │   ├── testing.md          # 测试文档
│   │   │   └── assets/             # 相关资源（图片、原型等）
│   │   │       ├── wireframes/
│   │   │       ├── mockups/
│   │   │       └── diagrams/
│   │   │
│   │   ├── story-1.2/              # Story 1.2: 结构化访谈问题收集
│   │   │   ├── README.md
│   │   │   ├── requirements.md
│   │   │   ├── interaction.md
│   │   │   ├── architecture.md
│   │   │   ├── implementation.md
│   │   │   ├── testing.md
│   │   │   └── assets/
│   │   │
│   │   └── story-1.3/              # Story 1.3: 初始本体结构生成
│   │       └── ...
│   │
│   ├── epic-2/                     # Epic 2: 基础工作空间
│   │   ├── story-2.1/
│   │   ├── story-2.2/
│   │   └── ...
│   │
│   ├── epic-3/                     # Epic 3: 自然对话交互
│   ├── epic-4/                     # Epic 4: 本体手动构建
│   ├── epic-5/                     # Epic 5: 智能本体辅助
│   └── epic-6/                     # Epic 6: 本体可视化探索
│
├── templates/                      # 文档模板
│   ├── story-spec-template/        # Story 规格模板
│   │   ├── README.md
│   │   ├── requirements.md
│   │   ├── interaction.md
│   │   ├── architecture.md
│   │   ├── implementation.md
│   │   └── testing.md
│   │
│   └── epic-overview-template.md  # Epic 概览模板
│
├── guides/                         # 指南文档
│   ├── documentation-workflow.md   # 文档协作流程
│   ├── spec-writing-guide.md      # 规格文档编写指南
│   └── review-checklist.md        # 文档审查清单
│
└── index.md                        # 文档索引
```

---

## 📝 文档类型说明

### 1. README.md（Story 概览）

**目的：** Story 的入口文档，提供快速概览和状态跟踪。

**必须包含：**
- Story 标题和编号
- Story 描述（用户故事格式）
- 当前状态（Planning / In Progress / Review / Done）
- 负责人和协作者
- 关键里程碑和时间线
- 相关链接（PRD、Epic、相关 Story）
- 快速导航（指向其他文档）

**模板：** `templates/story-spec-template/README.md`

### 2. requirements.md（需求文档）

**目的：** 详细的功能需求和验收标准。

**必须包含：**
- 功能需求（从 PRD 提取）
- 验收标准（Given/When/Then）
- 边界条件和异常处理
- 依赖的其他 Story
- 非功能需求（性能、安全等）
- 需求变更历史

### 3. interaction.md（交互设计文档）

**目的：** 用户交互流程和界面设计。

**必须包含：**
- 用户流程图
- 界面线框图/原型
- 交互状态定义
- 错误处理和提示
- 可访问性要求
- 响应式设计说明
- 参考 UX 设计规范的相关章节

### 4. architecture.md（架构设计文档）

**目的：** 技术实现的架构设计。

**必须包含：**
- 技术栈选择（必须符合 AGENTS.md）
- 模块设计和职责划分
- 数据结构定义
- API 接口设计
- 状态管理方案
- 依赖关系图
- 性能优化策略
- 安全考虑
- 符合 AGENTS.md 规约的证明

### 5. implementation.md（开发文档）

**目的：** 实施细节和开发指南。

**必须包含：**
- 实施步骤（分解为子任务）
- 关键代码片段和示例
- 第三方库使用说明
- 环境配置要求
- 开发注意事项
- 已知问题和解决方案
- 代码审查要点

### 6. testing.md（测试文档）

**目的：** 测试策略和测试用例。

**必须包含：**
- 测试策略（单元测试、集成测试、E2E 测试）
- 测试用例列表
- 测试数据准备
- 性能测试计划
- 测试覆盖率目标
- 测试结果记录

---

## 🔄 文档协作流程

### 阶段 1：Story 启动

**负责人：** Product Owner / Tech Lead

**步骤：**

1. **创建 Story 目录**
   ```bash
   mkdir -p docs/specs/epic-X/story-X.Y
   cd docs/specs/epic-X/story-X.Y
   ```

2. **从模板初始化文档**
   ```bash
   cp -r ../../templates/story-spec-template/* .
   ```

3. **填写 README.md**
   - Story 基本信息
   - 设置状态为 `Planning`
   - 指定负责人

4. **提交初始化**
   ```bash
   git add .
   git commit -m "docs: initialize spec for story X.Y"
   git push
   ```

### 阶段 2：需求分析

**负责人：** Product Owner

**步骤：**

1. **编写 requirements.md**
   - 从 PRD 和 Epics 文档提取需求
   - 细化验收标准
   - 识别依赖关系

2. **团队评审**
   - 召开需求评审会议
   - 记录反馈和变更

3. **更新 README.md**
   - 更新状态为 `Requirements Review`

### 阶段 3：交互设计

**负责人：** UX Designer

**步骤：**

1. **编写 interaction.md**
   - 绘制用户流程图
   - 创建线框图/原型
   - 定义交互状态

2. **上传设计资源**
   ```bash
   # 将设计文件放入 assets/ 目录
   docs/specs/epic-X/story-X.Y/assets/wireframes/
   docs/specs/epic-X/story-X.Y/assets/mockups/
   ```

3. **设计评审**
   - 与 Product Owner 和开发团队评审
   - 记录反馈和调整

### 阶段 4：架构设计

**负责人：** Tech Lead / Architect

**步骤：**

1. **编写 architecture.md**
   - 设计技术方案
   - 绘制架构图
   - 定义数据结构和 API

2. **AGENTS.md 规约检查**
   - 确认技术栈符合规约
   - 确认模块依赖符合单向原则
   - 确认性能约束

3. **架构评审**
   - 技术团队评审
   - 记录技术债务和风险

4. **更新 README.md**
   - 更新状态为 `Design Complete`

### 阶段 5：开发实施

**负责人：** Developer

**步骤：**

1. **编写 implementation.md**
   - 分解实施步骤
   - 记录关键代码片段
   - 记录开发注意事项

2. **更新 README.md**
   - 更新状态为 `In Progress`
   - 记录进度

3. **开发过程中持续更新**
   - 记录遇到的问题和解决方案
   - 更新架构设计（如有变更）

### 阶段 6：测试

**负责人：** QA / Developer

**步骤：**

1. **编写 testing.md**
   - 编写测试用例
   - 执行测试
   - 记录测试结果

2. **更新 README.md**
   - 更新状态为 `Testing`

### 阶段 7：完成

**负责人：** Tech Lead

**步骤：**

1. **最终文档审查**
   - 确认所有文档完整
   - 确认文档与实际代码一致

2. **更新 README.md**
   - 更新状态为 `Done`
   - 记录完成日期

3. **归档**
   - 文档进入维护模式
   - 后续变更需要走变更流程

---

## 👥 角色和职责

### Product Owner
- 负责 requirements.md
- 参与所有评审
- 最终验收

### UX Designer
- 负责 interaction.md
- 创建设计资源
- 参与需求和开发评审

### Tech Lead / Architect
- 负责 architecture.md
- 确保符合 AGENTS.md 规约
- 参与所有技术评审

### Developer
- 负责 implementation.md
- 参与架构设计
- 实施开发

### QA
- 负责 testing.md
- 执行测试
- 记录缺陷

---

## 📋 文档审查清单

### Requirements Review

- [ ] 需求来源明确（PRD、Epic）
- [ ] 验收标准清晰可测试
- [ ] 依赖关系已识别
- [ ] 边界条件已定义
- [ ] 非功能需求已考虑

### Design Review

- [ ] 用户流程完整
- [ ] 交互状态定义清晰
- [ ] 错误处理已设计
- [ ] 可访问性已考虑
- [ ] 响应式设计已规划

### Architecture Review

- [ ] 技术栈符合 AGENTS.md
- [ ] 模块依赖符合单向原则
- [ ] 数据结构设计合理
- [ ] API 接口设计完整
- [ ] 性能约束已考虑
- [ ] 安全风险已评估

### Implementation Review

- [ ] 实施步骤清晰
- [ ] 代码示例准确
- [ ] 开发注意事项完整
- [ ] 已知问题已记录

### Testing Review

- [ ] 测试策略完整
- [ ] 测试用例覆盖验收标准
- [ ] 测试数据已准备
- [ ] 测试结果已记录

---

## 🔍 文档搜索和导航

### 文档索引

**主索引：** `docs/index.md`

包含：
- 所有 Epic 和 Story 的链接
- 文档状态概览
- 快速搜索指南

### 命名规范

**目录命名：**
- Epic: `epic-{N}` (例如：epic-1, epic-2)
- Story: `story-{N}.{M}` (例如：story-1.1, story-2.3)

**文件命名：**
- 使用小写字母和连字符
- 描述性命名（例如：`user-flow-diagram.png`）

### 快速查找

```bash
# 查找特定 Story 的文档
cd docs/specs/epic-1/story-1.1

# 搜索关键词
grep -r "关键词" docs/specs/

# 查看所有 In Progress 的 Story
grep -r "状态.*In Progress" docs/specs/*/*/README.md
```

---

## 🔄 文档变更管理

### 变更流程

1. **识别变更需求**
   - 需求变更
   - 设计调整
   - 技术方案变更

2. **创建变更分支**
   ```bash
   git checkout -b docs/story-X.Y-update
   ```

3. **更新相关文档**
   - 更新受影响的文档
   - 在文档中记录变更历史

4. **变更评审**
   - 相关角色评审变更
   - 评估影响范围

5. **合并变更**
   ```bash
   git commit -m "docs: update story X.Y spec - [变更说明]"
   git push
   # 创建 PR 并合并
   ```

### 变更历史记录

在每个文档末尾添加变更历史：

```markdown
## 变更历史

| 日期 | 变更人 | 变更说明 |
|------|--------|---------|
| 2026-03-02 | Archersado | 初始版本 |
| 2026-03-05 | Archersado | 更新验收标准 |
```

---

## 📊 文档质量指标

### 完整性指标

- ✅ 所有必需文档已创建
- ✅ 所有章节已填写
- ✅ 所有图表已上传

### 一致性指标

- ✅ 需求与 PRD 一致
- ✅ 设计与 UX 规范一致
- ✅ 架构与 AGENTS.md 一致
- ✅ 实施与架构设计一致

### 及时性指标

- ✅ 文档与代码同步更新
- ✅ 变更及时记录
- ✅ 评审及时完成

---

## 🛠️ 工具和自动化

### 文档生成脚本

```bash
# 创建新 Story 规格目录
npm run docs:create-spec -- --epic 1 --story 1

# 生成文档索引
npm run docs:generate-index

# 检查文档完整性
npm run docs:validate
```

### Git Hooks

在 `.husky/pre-commit` 中添加文档检查：

```bash
# 检查文档完整性
if [ -d "docs/specs" ]; then
  npm run docs:validate
fi
```

---

## 📚 参考资源

- [AGENTS.md](../AGENTS.md) - 架构规约
- [PRD](_bmad-output/planning-artifacts/prd.md) - 产品需求文档
- [Epics & Stories](_bmad-output/planning-artifacts/epics.md) - 实施计划
- [UX 设计规范](_bmad-output/planning-artifacts/ux-design-specification.md) - 用户体验设计

---

**记住：文档是团队协作的基础，保持文档的完整性和及时性至关重要。**
