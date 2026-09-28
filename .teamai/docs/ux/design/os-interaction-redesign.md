# OriginOS 交互设计改进方案 - Fluent-OS 与 macOS 启发

## 问题诊断

### 当前问题
- **体验像 SaaS 应用**：当前 CUI（对话界面）缺乏原生操作系统的沉浸感
- **交互层次不明确**：对话界面作为 OS 交互的主要形式过于单一
- **缺乏系统级感**：用户感觉在使用一个"应用"而非"操作系统"

### 根本原因
1. **对话界面过于中心**：将 CUI 作为主要交互方式，忽略了 OS 应该有多层次、多模态的交互
2. **缺乏原生 OS 元素**：
   - 没有桌面/工作区的空间感
   - 没有命令/菜单系统的层级
   - 没有任务/应用的切换体验
3. **缺乏原生 OS 交互模式**：
   - 缺少类似 Spotlight 的全局搜索/命令体验
   - 缺少 Finder 的文件/资源管理感
   - 缺少 Dock/启动器的感觉

---

## Fluent-OS 设计启发

### 核心设计原则

#### 1. Acrylic 材质
- **半透明背景**：营造深度和层次感
- **模糊效果**：让界面元素更有机地融合
- **应用场景**：
  - CUI 对话框的背景
  - 悬浮面板的材质
  - 模态窗口的层次

**OriginOS 应用示例**：
```css
.cui-dialog {
  background: rgba(255, 255, 255, 0.8) backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.5);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
}
```

#### 2. Reveal 效果
- **光晕效果**：鼠标/焦点周围的光晕
- **边界高亮**：元素边界随交互变化
- **深度感知**：通过阴影和光照传达 3D 感

**OriginOS 应用示例**：
```css
.cui-message:hover {
  background: rgba(0, 120, 212, 0.1);
  box-shadow: 0 0 20px rgba(0, 120, 212, 0.3);
}
```

#### 3. Fluent 动画
- **缓动函数**：不是线性的，而是有生命的
- **微交互**：按钮悬停的反馈
- **转场**：界面切换的流畅感

**OriginOS 应用示例**：
```css
.cui-dialog {
  transition: all 0.32s cubic-bezier(0.36, 0, 0.66, -0.56);
}
```

---

## macOS HIG 设计启发

### 核心交互模式

#### 1. Spotlight 风格的全局命令
- **触发方式**：Cmd+Space 或类似快捷键
- **功能**：
  - 搜索和查找
  - 启动应用/命令
  - 快捷访问资源
- **体验特征**：
  - 快速出现/消失的动画
  - 顶部搜索框的聚焦状态
  - 结果的可选择性和键盘导航

**OriginOS 应用 - 全局命令中心**：
```
激活快捷键 → 顶部搜索框浮现 → 输入显示结果 → 选择执行
```

#### 2. Finder 风格的资源管理
- **层级导航**：面包屑 + 侧边栏
- **文件/对象**：拖拽、右键菜单
- **预览**：空格键预览（Quick Look）

**OriginOS 应用 - Project/Resource Manager**：
```
侧边栏 → Project Tree → Content Preview → Editor Panel
```

#### 3. Dock 风格的任务栏
- **可见性**：常用应用/任务的快捷访问
- **状态感知**：运行中的应用有指示灯
- **拖放操作**：文件拖到应用打开

**OriginOS 应用 - Agent/Task Dock**：
```
底部 Dock → Agent 列表 → 运行状态 → 右键菜单
```

---

## OriginOS 新交互架构

### 核心概念：OriginOS 作为"空间"

```
OriginOS Space (Workspaces)
├─ Desktop (工作区背景)
│   ├─ 可拖拽的 Agent 图标
│   ├─ 快捷方式
│   └─ 系统通知
│
├─ Spotlight (全局命令中心)
│   ├─ 搜索框
│   ├─ Agent 快速启动
│   └─ 命令快捷键
│
├─ Finder (资源管理器)
│   ├─ Project Tree
│   ├─ Agent Workspaces
│   └─ File Browser
│
└─ Dialogue Modal (CUI)
    ├─ 悬浮对话窗口（Acrylic 材质）
    ├─ 可最小化/最大化
    └─ Dock 中有图标
```

### 交互流程重构

#### 1. Onboarding 流程
```
之前：
→ 打开 OriginOS
→ 对话界面 (CUI) 立即出现
→ 开始对话

现在是：
→ 打开 OriginOS (桌面 + 系统图标)
→ CUI 对话框从 Dock/Spotlight 触发（Acrylic 材质）
→ 对话开始
→ 完成后对话框自动收起，Agent 图标出现在 Dock
```

#### 2. 日常使用流程
```
之前：
→ 在对话界面中输入
→ 等待响应

现在是：
→ 在 Desktop 空间中，从 Spotlight 启动 Agent
→ 或者从 Dock 中打开对话
→ 对话窗口悬浮（Acrylic 悬浮质感）
→ 可最小化到 Dock
```

---

## 具体实现方案

### 1. 空间组件

#### Desktop 空间
```typescript
// components/os/Desktop.tsx
export function Desktop() {
  return (
    <div className="desktop-space">
      <SystemIcons />
      <BackgroundParticles />
      <FloatingAgents />
      <NotificationCenter />
    </div>
  );
}
```

#### Spotlight 风格全局命令
```typescript
// components/os/Spotlight.tsx
export function Spotlight() {
  return (
    <div className="spotlight">
      <AcrylicDialog>
        <SearchField />
        <ResultsList />
      </AcrylicDialog>
    </div>
  );
}
```

### 2. 材质系统

#### Acrylic 样式
```css
/* 玻璃态/Glassmorphism */
.glass {
  background: rgba(255, 255, 255, 0.72) backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
}

/* 浮动面板 */
.floating-panel {
  background: rgba(255, 255, 255, 0.85) backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.6);
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
}
```

#### Reveal 效果
```css
/* 光晕效果 */
.hover-glow::before {
  content: "";
  position: absolute;
  inset: -2px;
  border-radius: inherit;
  background: radial-gradient(
    circle at var(--mouse-x) var(--mouse-y),
    rgba(0, 120, 212, 0.2),
    transparent 60%
  );
  z-index: -1;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.hover-glow:hover::before {
  opacity: 1;
}
```

### 3. 交互模式

#### Spotlight 快捷键
```typescript
// hooks/useSpotlightShortcuts.ts
export function useSpotlightShortcuts() {
  useEffect(() => {
    const handleShortcut = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        openSpotlight();
      }
    };

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);
}
```

#### Dock 风格任务栏
```typescript
// components/os/Dock.tsx
export function Dock() {
  const [agents] = useState([
    { id: 'architect', icon: '/icons/architect.png', running: false },
    { id: 'developer', icon: '/icons/developer.png', running: true },
    { id: 'qa', icon: '/icons/qa.png', running: false },
  ]);

  return (
    <div className="dock">
      {agents.map(agent => (
        <DockIcon
          key={agent.id}
          icon={agent.icon}
          running={agent.running}
          onClick={() => openAgent(agent.id)}
        />
      ))}
    </div>
  );
}
```

---

## 迁移路径

### Phase 1: 基础框架

**Week 1-2:**
1. 创建 Desktop 空间组件
2. 实现基础 Acrylic 样式
3. 实现基础 Dock 组件（视觉）

### Phase 2: 交互完善

**Week 3-4:**
1. 实现 Spotlight 全局命令（简化版，无实际逻辑）
2. 实现 Dock 交互（拖拽、右键菜单）
3. 实现对话窗口的悬浮和最小化

### Phase 3: 功能集成

**Week 5-6:**
1. 集成 Agent 到 Dock
2. 集成对话窗口到 Spotlight
3. 实现 Project Finder (简化版)

---

## 参考

- [Fluent Design System](https://fluent2.microsoft.design/)
- [macOS Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/macos)
- [Fluent-OS 原型参考](https://www.figma.com/file/iLBP9yD2QqKq7yS6VxS0M4/Fluent-OS)

---

## 下一步行动

1. 选择核心设计原则（2-3 个优先实现）
2. 设计新的交互原型（Figma）
3. 实现 Phase 1 基础框架
4. 验证用户体验（用户测试）
