# Epic 2: UX Design Specification

**Epic**: 基础工作空间 (Basic Workspace)
**Document Version**: 1.0
**Date**: 2026-03-24
**Author**: UX Designer (Google-Style UI Designer)

---

## 📋 Executive Summary

本文档定义了 Epic 2（基础工作空间）的用户体验设计，包括用户旅程、核心界面设计、交互流程和设计规范。

---

## 🎯 Design Goals

### 核心目标
1. **熟悉感** - 提供类似传统 IDE/文件管理器的操作体验
2. **高效性** - 支持快速文件访问、编辑、组织
3. **一致性** - 与现有 OriginOS 设计语言统一（FluentOS + Acrylic）
4. **可扩展性** - 为未来功能（文件夹层级、搜索）预留接口

### 设计原则 (Material Design 3)
- **Visual Hierarchy** - 通过 Acrylic 材质和阴影建立清晰的层次
- **Feedback** - 所有交互提供即时反馈（状态变化、操作确认）
- **Efficiency** - 减少操作步骤，支持快捷键和批处理
- **Accessibility** - WCAG 2.1 AA 级别可访问性

---

## 🧭 User Journeys

### Journey 1: 首次进入工作空间 (First-Time Workspace Entry)

```
┌─────────────────────────────────────────────────────────────┐
│                    User Journey Flow                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Step 1: Desktop Background                                 │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              OriginOS Desktop                        │   │
│  │                                                        │   │
│  │   User clicks "工作空间" icon on Dock                  │   │
│  └──────────────────────────────────────────────────────┘   │
│                           ↓                                 │
│  Step 2: Empty State Message                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │     ┌────────────────────────────────────────┐       │   │
│  │     │  📂 工作空间                              │       │   │
│  │     │                                        │       │   │
│  │     │  还没有项目。创建你的第一个项目？       │       │   │
│  │     │                                        │       │   │
│  │     │  [创建项目]  [从本体创建项目]          │       │   │
│  │     └────────────────────────────────────────┘       │   │
│  └──────────────────────────────────────────────────────┘   │
│                           ↓                                 │
│  Step 3: Project Creation Dialog                          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  ┌────────────────────────────────────────┐           │   │
│  │  │  创建新项目                            │ [X]   │   │
│  │  ├────────────────────────────────────────┤           │   │
│  │  │  项目名称 [_________________]          │           │   │
│  │  │                                        │           │   │
│  │  │  描述    [___________________________] │           │   │
│  │  │                                        │           │   │
│  │  │  图标    🚀 ▼  颜色  [■■■■■▴▴]          │           │   │
│  │  │                                        │           │   │
│  │  │          [取消]      [创建项目]       │           │   │
│  │  └────────────────────────────────────────┘           │   │
│  └──────────────────────────────────────────────────────┘   │
│                           ↓                                 │
│  Step 4: Workspace Active State                           │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  ┌──────┐  ┌─────────────────┐  ┌────────────────┐  │   │
│  │  │Files │  │  文档编辑器     │  │  Assistant     │  │   │
│  │  │Tree  │  │                 │  │                │  │   │
│  │  │      │  │  # Hello World   │  │  💬 对话...     │  │   │
│  │  │📁✗✗ │  │                 │  │                │  │   │
│  │  └──────┘  └─────────────────┘  └────────────────┘  │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  User is now ready to create, edit, and organize files.      │
└─────────────────────────────────────────────────────────────┘
```

### Journey 2: 文件创建到编辑流程 (File Creation to Editing)

```
┌─────────────────────────────────────────────────────────────┐
│                    File Creation Flow                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Action 1: Click "New File" Button                          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  [📄 新建文件]  [+ 新建项目]                          │   │
│  └──────────────────────────────────────────────────────┘   │
│                           ↓                                 │
│  Action 2: File Creation Dialog                            │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  ┌────────────────────────────────────────┐           │   │
│  │  │  创建新文件                            │ [X]   │   │
│  │  ├────────────────────────────────────────┤           │   │
│  │  │  文件名  [document.md___________]      │           │   │
│  │  │                                        │           │   │
│  │  │  类型    [Markdown ▼]                  │           │   │
│  │  │                                        │           │   │
│  │  │  位置    [🚀 OriginOS 开发项目 ▼]    │           │   │
│  │  │                                        │           │   │
│  │  │          [取消]      [创建]           │           │   │
│  │  └────────────────────────────────────────┘           │   │
│  └──────────────────────────────────────────────────────┘   │
│                           ↓                                 │
│  Action 3: File Opens in Editor                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  ┌──────┐  ┌─────────────────┐  ┌────────────────┐  │   │
│  │  │Files │  │  文档编辑器     │  │                │  │   │
│  │  │Tree  │  │                 │  │                │  │   │
│  │  │      │  │  # document.md   │  │                │  │   │
│  │  │📁📄  │  │                 │  │                │  │   │
│  │  │      │  │  [编辑中...]    │  │                │  │   │
│  │  │doc📍 │  │                 │  │                │  │   │
│  │  └──────┘  └─────────────────┘  └────────────────┘  │   │
│  │                                              Auto-save |   │
│  └──────────────────────────────────────────────────────┘   │
│                           ↓                                 │
│  Action 4: User Edits and Saves                           │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  ┌──────┐  ┌─────────────────┐                      │   │
│  │  │Files │  │  文档编辑器     │                      │   │
│  │  │Tree  │  │                 │                      │   │
│  │  │      │  │  # document.md   │                      │   │
│  │  │📁📄  │  │                 │                      │   │
│  │  │      │  │  这是我的文档... │                      │   │
│  │  │doc📍 │  │  [Ctrl+S] ✓ 已保存│                      │   │
│  │  │      │  │                 │                      │   │
│  │  │      │  │  💭 Ask Agent   │                      │   │
│  │  └──────┘  └─────────────────┘                      │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Journey 3: 版本历史查看与恢复 (Version History and Restore)

```
┌─────────────────────────────────────────────────────────────┐
│                  Version History Flow                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Action 1: Click "History" in Toolbar                        │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  [← 回退] [📋 历史] [🔍 搜索] ... [✓ 保存]        │   │
│  └──────────────────────────────────────────────────────┘   │
│                           ↓                                 │
│  Action 2: Version History Panel/Dialog                     │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  ┌────────────────────────────────────────┐           │   │
│  │  │  📜 版本历史 - document.md         │  [X]   │   │
│  │  ├────────────────────────────────────────┤           │   │
│  │  │  v3 - 2026-03-24 14:30  [当前] 📍    │           │   │
│  │  │  "添加了新的章节，修复了bug..."           │           │   │
│  │  ├────────────────────────────────────────┤           │   │
│  │  │  v2 - 2026-03-24 11:15                │           │   │
│  │  │  "初始草稿"                           │           │   │
│  │  ├────────────────────────────────────────┤           │   │
│  │  │  v1 - 2026-03-24 09:00  [固定] 📌    │           │   │
│  │  │  "第一版"                             │           │   │
│  │  │                       [查看]  [恢复]  │           │   │
│  │  └────────────────────────────────────────┘           │   │
│  │                                    [关闭]               │   │
│  └──────────────────────────────────────────────────────┘   │
│                           ↓                                 │
│  Action 3: Restore Confirmation                            │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  ┌────────────────────────────────────────┐           │   │
│  │  │  确认恢复到版本 v2?                    │           │   │
│  │  │                                        │           │   │
│  │  │  当前未保存的更改将会丢失。           │           │   │
│  │  │                                        │           │   │
│  │  │          [取消]      [确认恢复]       │           │   │
│  │  └────────────────────────────────────────┘           │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎨 Interface Design

### 1. Workspace Layout (工作空间布局)

**Layout Structure:**
```
┌────────────────────────────────────────────────────────────────────────┐
│  Window Title: 工作空间 - OriginOS                                   │
├───────────┬─────────────────────────────┬───────────────────────────────┤
│           │                             │                               │
│ Files     │  File Editor / Preview      │  Agent Assistant Panel       │
│ Sidebar   │                             │                               │
│           │  ┌─────────────────────┐   │  ┌───────────────────────┐   │
│ 📁 ✗ ✗   │  │ Toolbar             │   │  │ 💬 Conversation      │   │
│ 📁项目名  │  ├─────────────────────┤   │  ├───────────────────────┤   │
│ 📷 docs   │  │                     │   │  │ Assistant: "I can     │   │
│ ├── README │  │  Markdown Content    │   │  │ help you..."         │   │
│ ├── design │  │                     │   │  │                     │   │
│ └── specs  │  │  [Editor Mode]      │   │  │ User: Please analyze │   │
│           │  │                     │   │  │ this file...        │   │
│ 📄 plan.md│  │  # My Document      │   │  │                     │   │
│ 📄 notes.md│  │                     │   │  │ [Input Box]          │   │
│ 📄... (10)│  │  Content here...    │   │  │                     │   │
│           │  │                     │   │  └───────────────────────┘   │
│ [+ 新文件] │  │                     │   │  [Ask Agent Button]         │
│ [+ 新项目] │  │                     │   │                               │
│           │  └─────────────────────┘   │                               │
│           │  [Preview] [Source]       │                               │
│           │                             │                               │
└───────────┴─────────────────────────────┴───────────────────────────────┘
   250px          650px                       300px
```

**Component Breakdown:**

| Component | Purpose | Interaction |
|-----------|---------|-------------|
| **Files Sidebar** | File tree navigation | Click to open file, expand/collapse folders |
| **Toolbar** | File operations (save, format, history) | Quick actions, keyboard shortcuts |
| **Editor Area** | Markdown editing | Text input, live preview |
| **Agent Panel** | AI assistant integration | Chat interface, context awareness |

### 2. File List Component (文件列表组件)

**Design:**
```
┌─────────────────────────────┐
│ 📂 OriginOS 开发项目  📌 [+│ ← Project Header
├─────────────────────────────┤
│ 📷 docs/                    │ ← Folder (expandable)
│ ├── README.md          📍   │ ← File (selected)
│ ├── design.md              │
│ └── specs/                 │ ← Subfolder
│     └── api-spec.md        │
│                             │
│ 📄 plan.md                 │ ← File in project root
│ 📄 notes.md                │
│                             │
│ [+ 新建文件]  [+ 新建项目] │ ← Actions
└─────────────────────────────┘
```

**States:**
- **Default**: All folders expanded, show files sorted by name
- **Search**: Show matching files with highlight
- **Empty**: Show "No files" message with CTA

### 3. File Editor Component (文件编辑器组件)

**Split View Design:**
```
┌─────────────────────────────────────────────────────────────────┐
│ [Editor ▼] [# H1 bold] [↔] [预览] [✓] [📜] [🔍] [🌙]          │
├───────────────────────┬───────────────────────────────────────────┤
│                       │                                           │
│ # Project Plan        │  Project Plan                             │
│                       │  ============                             │
│ ## Overview           │                                           │
│                       |  **Overview**                             │
│ This is the project   │  This is the project                      │
| plan for OriginOS.    │  plan for OriginOS.                       │
│                       │                                           │
| ## Objectives         |  ### Objectives                          │
│                       |  1. Complete Epic 1                       │
│ 1. Complete Epic 1    │  2. Start Epic 2                          │
│ 2. Start Epic 2       │  3. Launch Beta                           │
| 3. Launch Beta        │                                           │
│                       │  **Timeline**                             │
│ ## Timeline           |  - Week 1: Epic 1 QA                    │
│                       |  - Week 2-3: Epic 2 Development           │
│ - Week 1: Epic 1 QA   │                                           │
│ - Week 2-3: Epic 2... |                                           │
│                       │                                           │
│ [Line 42, Col 15]      │                                           │
│                       │                                           │
│ Markdown Mode         │  Preview Mode                             │
│                       │                                           │
└───────────────────────┴───────────────────────────────────────────┘
     50%                     50%
```

**Toolbar Options:**
| Button | Shortcut | Action |
|--------|----------|--------|
| Editor ▼ | Ctrl/Cmd + / | Editor mode (source, preview, split) |
| # H1 | Ctrl/Cmd + 1 | Heading 1 |
| Bold | Ctrl/Cmd + B | Bold text |
| ← ↔ → | - | Split view toggle |
| 预览 | Ctrl/Cmd + P | Preview mode |
| ✓ | Ctrl/Cmd + S | Save file |
| 📜 | Ctrl/Cmd + H | Version history |
| 🔍 | Ctrl/Cmd + F | Search |
| 🌙 | Ctrl/Cmd + Shift + L | Toggle light/dark |

### 4. Version History Component (版本历史组件)

**Modal/Side Panel Design:**
```
┌─────────────────────────────────────────────────────────────────┐
│ 📜 版本历史 - project-plan.md                            [×]  │
├─────────────────────────────────────────────────────────────────┤
│ Current File: project-plan.md                                  │
│ Total Versions: 7  |  Fixed: 2                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ v7 - 2026-03-24 14:30  [当前]  🔒  📌                         │
│ "添加了新章节 'Next Steps'"                                     │
│ ─────────────────────────────────────────────────────────────  │
│                                                                 │
│ v6 - 2026-03-24 12:15  [编辑]  📌                             │
│ "更新了时间线"                                                 │
│ ─────────────────────────────────────────────────────────────  │
│                                                                 │
│ v5 - 2026-03-24 09:30                                          │
│ "初步完成内容"                                                 │
│ ─────────────────────────────────────────────────────────────  │
│                                                                 │
│ ... (hidden older versions)  [加载更多]                        │
│                                                                 │
│ v1 - 2026-03-23 16:00  [初始]  📌                             │
│ "项目计划的第一个版本"                                          │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ [查看差异]  [恢复此版本]           [关闭]                        │
└─────────────────────────────────────────────────────────────────┘
```

**Icons Legend:**
- 📍 = Current version
- 🔒 = Cannot delete (within limit)
- 📌 = Pinned (never deleted)
- [编辑] = Edit action performed
- [初始] = Initial version

### 5. Agent Assistant Panel (智能助手面板)

**Chat Interface Design:**
```
┌───────────────────────────────────────┐
│ 💬 OriginOS Assistant      [⊕] [⚙] │
├───────────────────────────────────────┤
│                                       │
│ 🤖 Assistant:                      │
│ "你好！我是你的 AI 助手。我可以帮你  │
│   编辑文档、总结内容、生成代码..." │
│                                       │
│ ─────────────────────────────────    │
│                                       │
│ 👤 You:                            │
│ "请帮我生成项目时间线"              │
│                                       │
│ ─────────────────────────────────    │
│                                       │
│ 🤖 Assistant:                      │
│ "好的，这是项目时间线建议...        │
│   [View Full Message]               │
│                                       │
│ ─────────────────────────────────    │
│                                       │
│ [输入你的问题...]   [发送 ▶]         │
│                                       │
│ 💡 Suggestion: Ask me to analyze    │
│ this file's structure                │
│                                       │
└───────────────────────────────────────┘
```

**Features:**
- Context-aware (knows current file/project)
- Markdown rendering for responses
- Quick actions menu
- Suggestion chips for common tasks

---

## 🎭 Interaction Flows

### Create File Flow

```
1. User clicks [+ 新建文件] button
   ↓
2. Create File Modal appears
   - Input: File name (validated)
   - Select: File type (markdown, text, json, yaml)
   - Select: Project (dropdown)
   ↓
3. User fills form and clicks [创建]
   ↓
4. Validation:
   - Name not empty ✓
   - No duplicate name in project ✓
   - Extension matches type ✓
   ↓
5. File created:
   - Add to file list
   - Open in editor
   - Show success toast: "✓ 已创建 document.md"
   ↓
6. Focus on editor (ready to type)
```

### Save File Flow (Explicit Save)

```
1. User clicks [✓ 保存] or presses Ctrl/Cmd + S
   ↓
2. Check if file is dirty (has unsaved changes)
   ├─ No → Show toast: "✓ 已保存最新版本"
   └─ Yes → Continue
       ↓
3. Save to API: PUT /api/files/:id
       ↓
4. API Response:
   ├─ Success → Update local state, show success toast
   └─ Error → Show error toast with retry option
       ↓
5. Update version number (if changed)
```

### Auto-Save Flow

```
1. User types in editor
   ↓
2. Set dirty flag = true
   ↓
3. Watchdog timer (30s interval)
   ├─ If dirty → Trigger save
   ├─ If not dirty → No action
   ↓
4. Auto-save process:
   - Save silently (no toast)
   - Update "Last saved: 30s ago" indicator
   - Keep dirty flag (so user can still undo)
   ↓
5. User explicitly saves:
   - Clear dirty flag
   - Show success toast
```

### Delete File Flow

```
1. User clicks file in list (select)
   → Shows context menu with [删除] option
   OR
   User clicks [📄 文件操作] → [删除]
   ↓
2. Delete Confirmation Modal appears
   - Shows file name and metadata
   - Warning: "此操作无法撤销"
   - [取消] [确认删除]
   ↓
3. User confirms deletion
   ↓
4. API Call: DELETE /api/files/:id
   ↓
5. Response handling:
   ├─ Success → Remove from list, close editor if open
   └─ Error → Show error message
```

### Version Restore Flow

```
1. User clicks [📜 历史] button
   ↓
2. Version History Panel appears
   - Lists versions (newest first)
   - Shows each version's metadata
   ↓
3. User hovers over a version:
   - Shows [查看] and [恢复] buttons
   ↓
4. User clicks [恢复] for version v2
   ↓
5. Confirmation Modal:
   - "恢复到版本 v2?"
   - "当前未保存的更改将会丢失"
   - [取消] [确认恢复]
   ↓
6. If user confirmed:
   - Load version v2 content into editor
   - Mark file as dirty
   - Show toast: "✓ 已恢复到版本 v2 (草稿)"
   ↓
7. User needs to save to make permanent
   - Show [有未保存的更改] indicator
```

---

## 🎨 Design System & Components

### Material Design 3 Tokens

#### Colors (Dark Mode)

```css
:root {
  /* Primary */
  --md-sys-color-primary: #3B82F6;
  --md-sys-color-on-primary: #FFFFFF;

  /* Surface */
  --md-sys-color-surface: #1F2937;
  --md-sys-color-on-surface: #F3F4F6;
  --md-sys-color-surface-variant: #111827;

  /* Acrylic */
  --acrylic-bg-standard: rgba(31, 41, 55, 0.72);
  --acrylic-border: rgba(255, 255, 255, 0.18);
  --acrylic-shadow: 0 8px 32px rgba(0, 0, 0, 0.32);

  /* Typography */
  --md-sys-typescale-label-large: 500 14px/20px 'Inter';
  --md-sys-typescale-body-large: 400 16px/24px 'Inter';
  --md-sys-typescale-body-medium: 400 14px/20px 'Inter';
}
```

#### Spacing

| Token | Value | Use Case |
|-------|-------|----------|
| `spacing-xs` | 4px | Icon padding, tight spacing |
| `spacing-sm` | 8px | Button padding, list items |
| `spacing-md` | 16px | Section padding, card padding |
| `spacing-lg` | 24px | Section margins |
| `spacing-xl` | 32px | Page margins |

#### Elevation

```
elevation-1: 0 1px 3px rgba(0,0,0,0.12)
elevation-2: 0 4px 6px rgba(0,0,0,0.15)
elevation-3: 0 8px 12px rgba(0,0,0,0.20)  (dialogs)
elevation-4: 0 12px 24px rgba(0,0,0,0.25) (modals)
```

#### Typography

```css
/* Display */
.display-large { font: 400 57px/64px 'Inter'; letter-spacing: -0.25px; }
.display-medium { font: 400 45px/52px 'Inter'; letter-spacing: 0; }
.display-small { font: 400 36px/44px 'Inter'; letter-spacing: 0; }

/* Heading */
.headline-large { font: 400 32px/40px 'Inter'; letter-spacing: 0; }
.headline-medium { font: 400 28px/36px 'Inter'; letter-spacing: 0; }
.headline-small { font: 400 24px/32px 'Inter'; letter-spacing: 0; }

/* Title */
.title-large { font: 500 22px/28px 'Inter'; letter-spacing: 0; }
.title-medium { font: 500 16px/24px 'Inter'; letter-spacing: 0.15px; }
.title-small { font: 500 14px/20px 'Inter'; letter-spacing: 0.1px; }

/* Label */
.label-large { font: 500 14px/20px 'Inter'; letter-spacing: 0.1px; }
.label-medium { font: 500 12px/16px 'Inter'; letter-spacing: 0.5px; }

/* Body */
.body-large { font: 400 16px/24px 'Inter'; letter-spacing: 0.5px; }
.body-medium { font: 400 14px/20px 'Inter'; letter-spacing: 0.25px; }
.body-small { font: 400 12px/16px 'Inter'; letter-spacing: 0.4px; }
```

### Component Specifications

#### FileListItem

**HTML Structure:**
```tsx
<div className="file-list-item">
  <div className="file-icon">📄</div>
  <span className="file-name">document.md</span>
  <span className="file-meta">2 KB • 2h ago</span>
  {isDirty && <span className="dirty-indicator">●</span>}
</div>
```

**States:**
```
Default:
  - Gray-400 color for name
  - Hover: Gray-300 + background gray-800
  - Active: Blue-400 + background gray-700

Dirty:
  - Yellow-500 dot indicator
  - Name: Yellow-400
```

#### FileToolbar

**Layout:**
```tsx
<div className="file-toolbar">
  <div className="toolbar-left">
    <Button variant="icon" icon="editor" />
    <Button variant="icon" icon="bold" />
    <Button variant="icon" icon="italic" />
  </div>
  <div className="toolbar-center">
    <Toggle value="split" options={["edit", "split", "preview"]} />
  </div>
  <div className="toolbar-right">
    <Button variant="ghost" icon="history" />
    <Button variant="primary" icon="save" />
  </div>
</div>
```

#### MarkdownEditor

**Layout (Split View):**
```tsx
<div className="markdown-editor">
  <div className="editor-pane">
    <textarea
      className="editor-input"
      placeholder="Start typing..."
    />
  </div>
  <div className="preview-pane">
    <MarkdownRenderer content={content} />
  </div>
  <div className="resizer" />
</div>
```

**Editor Features:**
- Syntax highlighting (monaco-editor-like)
- Line numbers
- Word wrap
- Auto-indent
- Bracket matching

**Preview Features:**
- Markdown rendering
- Code syntax highlighting
- Table rendering
- Link preview
- Image preview

---

## ♿ Accessibility Considerations

### Keyboard Navigation

| Action | Keyboard Shortcut |
|--------|-------------------|
| Navigate file list | ↑ / ↓ arrows |
| Expand folder collapse | → / ← arrows |
| Open file | Enter |
| Save file | Ctrl/Cmd + S |
| New file | Ctrl/Cmd + N |
| Delete file | Delete |
| Undo | Ctrl/Cmd + Z |
| Redo | Ctrl/Cmd + Shift + Z |
| Find | Ctrl/Cmd + F |
| Close file | Ctrl/Cmd + W |

### Screen Reader Support

**ARIA Labels:**
```tsx
<button
  aria-label="Save document"
  aria-describedby="save-status"
>
  ✓
</button>
<span id="save-status" className="sr-only">
  Last saved 30 seconds ago
</span>
```

**Landmarks:**
```tsx
<nav aria-label="File sidebar">
  <FileTree />
</nav>

<main aria-label="Document editor">
  <FileEditor />
</main>

<aside aria-label="AI assistant">
  <AgentChat />
</aside>
```

### Color Contrast

All text meets WCAG 2.1 AA (4.5:1) or higher contrast:

| Element | Foreground | Background | Contrast |
|---------|-----------|------------|----------|
| Primary text | #F3F4F6 | #1F2937 | 12.6:1 ✓ |
| Secondary text | #9CA3AF | #1F2937 | 5.8:1 ✓ |
| Link text | #60A5FA | #1F2937 | 7.2:1 ✓ |
| Error text | #F87171 | #1F2937 | 4.8:1 ✓ |

---

## 📱 Responsive Design

### Breakpoints

| Breakpoint | Width | Layout |
|------------|-------|--------|
| Mobile | < 768px | Single column, drawer for files |
| Tablet | 768px - 1024px | Collapsible file sidebar |
| Desktop | > 1024px | Full three-column layout |

### Mobile Adaptation

```
Mobile (< 768px):
┌─────────────────────────────┐
│ [☰] work-space       [⋮]   │
├─────────────────────────────┤
│ # document.md               │
│ ─────────────────────────   │
│ Content...                  │
│                             │
│ [💬 Assistant ▼]            │
└─────────────────────────────┘

- Files in drawer (tap ☰ to open)
- Agent in bottom sheet
- Full-screen editor
```

---

## 🎭 Micro-interactions

### File Selection Animation
```css
.file-list-item {
  transition: all 200ms var(--md-sys-motion-easing-standard);
}

.file-list-item:hover {
  background: var(--md-sys-color-surface-variant);
  transform: translateX(4px);
}

.file-list-item.selected {
  background: rgba(59, 130, 246, 0.1);
  border-left: 3px solid var(--md-sys-color-primary);
}
```

### Save Success Animation
```
[✓ 保存] → Click →
  1. Button rotates loading spinner
  2. API completes
  3. Button shows ✓
  4. Toast fades in from bottom
  5. Toast fades out after 2s
```

### Editor Focus
```
On focus:
  - Border glows (blue ring)
  - Toolbar highlights active file
  - File list selected item pulses
```

---

## 📏 Component Measurements

### Workspace Window
- **Minimum**: 800px × 600px
- **Recommended**: 1200px × 700px
- **Resizable**: Yes (min/max bounds)

### File Sidebar
- **Width**: 250px (expandable to 350px)
- **Min width**: 200px
- **Content padding**: 16px

### Editor Pane
- **Min width**: 400px
- **Recommended line length**: 60-80 characters
- **Font size**: 14px (base code font)

### Agent Panel
- **Width**: 300px
- **Min width**: 250px
- **Max width**: 400px

---

## 🧪 Edge Cases and Empty States

### Empty File List
```
┌─────────────────────────────────┐
│ 📂 项目文件                     │
├─────────────────────────────────┤
│                                 │
│     📄                          │
│                                 │
│  此项目还没有文件                │
│                                 │
│  [+ 添加第一个文件]              │
│                                 │
└─────────────────────────────────┘
```

### Saving Conflict
```
┌──────────────────────────────────────────┐
│ ⚠️ 保存冲突                              │
├──────────────────────────────────────────┤
│                                          │
│  文件 version.docx 已被其他人修改。       │
│                                          │
│  服务器版本: 5分钟前更新                 │
│  你的版本: 基于前一个版本                │
│                                          │
│  [覆盖服务器版本] [放弃并重新加载]        │
│                                          │
└──────────────────────────────────────────┘
```

### Network Error
```
┌──────────────────────────────────────────┐
│ 🌐 连接失败                              │
├──────────────────────────────────────────┤
│                                          │
│  无法连接到服务器。请检查网络连接。      │
│                                          │
│  [重试] [离线模式]                        │
│                                          │
└──────────────────────────────────────────┘
```

---

## 🔄 Transitions and Animations

### Window Open Animation
```css
@keyframes windowOpen {
  0% {
    opacity: 0;
    transform: scale(0.9) translateY(20px);
  }
  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.workspace-window {
  animation: windowOpen 300ms var(--md-sys-motion-easing-emphasized);
}
```

### File Open Animation
```
File in tree → Click →
  1. Selection bar slides in (150ms)
  2. Preview fades in (200ms)
  3. Editor gains focus
```

### Split View Transition
```
Toggle split →
  1. Resizer emerges (100ms)
  2. Preview pane expands (300ms)
  3. Editor adjusts width (smooth)
```

---

## 🎨 Visual Design Assets

### Icons (Google Material Symbols)

| Icon | Unicode | Usage |
|------|---------|-------|
| folder | 📂 | Folder |
| description | 📄 | File |
| description | 📄 | Markdown file |
| code | 💻 | Code file |
| history | 📜 | Version history |
| save | ✓ | Save |
| undo | ↩ | Undo |
| redo | ↪ | Redo |
| search | 🔍 | Search |
| settings | ⚙️ | Settings |
| chat | 💬 | Agent chat |
| add | + | Add new |
| delete | 🗑️ | Delete |

### Color Palette (Project Colors)

For user-selectable project colors:
- #3B82F6 (Blue) - Default
- #10B981 (Green)
- #F59E0B (Amber/Orange)
- #EF4444 (Red)
- #8B5CF6 (Purple)
- #EC4899 (Pink)

---

## 📦 Deliverables

### Ready for Development
- ✅ Component specifications (FileList, FileEditor, Toolbar, etc.)
- ✅ User journey flows (create, edit, save, delete, version history)
- ✅ Interaction patterns (drag/drop, keyboard shortcuts)
- ✅ Responsive break points
- ✅ Accessibility guidelines

### Design Assets Ready
- ⏳ Figma design files (to follow)
- ⏳ High-fidelity mocks (to follow)
- ⏳ Interaction prototype (to follow)

---

## 📈 Success Metrics

After Epic 2 launch, measure:

| Metric | Target | Measurement |
|--------|--------|--------------|
| Time to first file creation | < 30s | User study |
| Task completion rate (file operations) | > 95% | Analytics |
| User satisfaction (SUS score) | > 80 | Survey |
| Accessibility compliance | WCAG AA | Lighthouse |
| Mobile usage (responsive) | > 10% | Analytics |

---

## 🚀 Next Steps

1. **Review Phase**: PM and Architect review this UX specification
2. **Figma Phase**: Create high-fidelity designs in Figma
3. **Prototype Phase**: Build interactive prototype for usability testing
4. **Implementation Phase**: Developer builds based on specifications

---

**Document Status**: Draft
**Version**: 1.0
**Last Updated**: 2026-03-24
**Owner**: UX Designer
