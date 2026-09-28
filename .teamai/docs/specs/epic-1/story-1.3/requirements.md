# 需求文档 - Story 1.3

**Story:** 1.3 - 初始本体结构生成
**版本:** 1.0
**最后更新:** 2026-03-02

---

## 📋 功能需求

### FR1: 本体生成动画

**描述：**
当访谈完成后，显示本体生成进度，并以动画形式呈现生成的本体结构。

**验收标准：**
- [ ] 显示生成进度消息和进度条
- [ ] 生成完成后显示本体预览界面
- [ ] Wow Moment：节点生长动画（中心节点 → 连接线 → 子节点）

### FR2: 本体预览

**描述：**
以树形层级结构展示生成的本体，支持展开/折叠。

**验收标准：**
- [ ] 展示领域层、概念对象、关系层级
- [ ] 每个节点显示：图标、名称、类型、描述
- [ ] 支持点击展开/折叠子节点
- [ ] 节点悬停时显示详细信息 Tooltip
- [ ] 节点呼吸动画效果（高亮当前节点）

### FR3: 本体编辑

**描述：**
用户可以对生成的本体进行简单编辑。

**验收标准：**
- [ ] 重命名：双击节点或点击编辑图标
- [ ] 删除：右键菜单或删除按钮，带确认对话框
- [ ] 添加概念：点击"添加概念"按钮

### FR4: 本体确认

**描述：**
用户确认使用当前本体后，进入主界面。

**验收标准：**
- [ ] 点击"确认使用此本体"按钮
- [ ] 显示成功提示（包含动画）
- [ ] 本体数据保存到本地存储
- [ ] 跳转到主界面

### FR5: 动画效果

**描述：**
定义所有动画效果的具体规格。

**验收标准：**
- [ ] 节点生长动画：500ms，cubic-bezier(0.4, 0, 0.2, 1)
- [ ] 辐射连接动画：400ms，ease-out
- [ ] 呼吸效果：2000ms，ease-in-out，循环
- [ ] 流体连接动画：300ms，ease-in-out
- [ ] 成功提示动画：400ms，ease-out
- [ ] 节点展开/折叠：250ms，ease-out

---

## 🎨 非功能需求

### NFR1: 性能

- [ ] 动画帧率 ≥ 60fps
- [ ] 节点渲染延迟 < 100ms（100个节点以内）
- [ ] 窗体打开时间 < 500ms

### NFR2: 可访问性

- [ ] 支持键盘导航（Tab, Enter, Escape）
- [ ] 支持屏幕阅读器（ARIA 标签）
- [ ] 高对比度模式支持

### NFR3: 响应式

- [ ] 支持桌面端（最小 1280×720）
- [ ] 支持平板端（768×1024）
- [ ] 移动端可选（支持基本预览）

---

## 📊 数据结构

```typescript
interface OntologyNode {
  id: string;
  name: string;
  type: 'domain' | 'entity' | 'class' | 'property' | 'relationship';
  description?: string;
  children?: OntologyNode[];
  icon?: string;
}

interface OntologyModel {
  id: string;
  name: string;
  description: string;
  nodes: OntologyNode[];
  createdAt: number;
  updatedAt: number;
}
```

---

## 🔄 数据流

```
Interview Answers
    ↓
Ontology Generation API
    ↓
    ├─ Domain Layer Extraction
    ├─ Concept Object Extraction
    └─ Relationship Extraction
    ↓
Ontology Model
    ↓
Tree Visualization
    ↓
User Actions (Edit/Confirm)
    ↓
Persistence (JSON)
```

---

## ⚠️ 约束条件

- 本体编辑仅限于 MVP 阶段的基本操作
- 本体生成使用模拟数据（MVP）
- 本体存储使用本地 JSON 文件

---

## 🚧 未来扩展

### Phase 2
- [ ] 拖拽重排节点
- [ ] 批量操作（多选删除）
- [ ] 本体版本管理

### Phase 3
- [ ] 本体导入/导出
- [ ] 本体模板库
- [ ] 智能推荐（基于 AI）

---

## 📝 变更历史

| 日期 | 变更内容 | 变更人 |
|------|---------|--------|
| 2026-03-02 | 初始版本 | product-designer |
