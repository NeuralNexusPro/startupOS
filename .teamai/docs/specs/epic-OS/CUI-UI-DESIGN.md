# CUI 会话模块 UI 设计规范

**文档 ID:** UX-CUI-001
**日期:** 2026-03-16
**作者:** UX Designer
**状态:** 🎨 设计中

---

## 1. 设计概述

### 1.1 设计目标

CUI (Command User Interface) 会话模块是 OriginOS 的核心交互界面，用于用户与 AI Agent 进行自然语言对话。

**核心设计原则:**
1. **一致性**: 与现有 Acrylic 材质系统和 OriginOS 视觉风格保持一致
2. **流畅性**: 支持实时消息流，思考状态可视化
3. **可用性**: 清晰的状态反馈，直观的交互方式
4. **可扩展性**: 支持未来工具调用可视化、流式响应等高级功能

### 1.2 设计范围

| 组件 | 功能 | 状态 |
|------|------|------|
| AgentDialogContent | 主对话容器 | 需设计 |
| MessageList | 消息列表 | 需设计 |
| ChatInput | 输入组件 | ✅ 已实现基础版 |
| StatusIndicator | 状态指示器 | ✅ 已实现基础版 |

---

## 2. 视觉设计规范

### 2.1 布局结构

```
┌─────────────────────────────────────────────────────────────────┐
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ Header                                                       ││
│  │ ┌──────┐  Agent Name                         ● 状态          ││
│  │ │ Icon │  Description                        思考中...       ││
│  │ └──────┘                                                     ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                                                              ││
│  │  Message List                                                ││
│  │  (滚动区域)                                                  ││
│  │                                                              ││
│  │  ┌────────────────────┐                                      ││
│  │  │ Agent 消息气泡      │                                      ││
│  │  └────────────────────┘                                      ││
│  │                                      ┌────────────────────┐  ││
│  │                                      │ User 消息气泡       │  ││
│  │                                      └────────────────────┘  ││
│  │                                                              ││
│  │  ┌────────────────────┐                                      ││
│  │  │ 工具调用状态 (可选) │                                      ││
│  │  └────────────────────┘                                      ││
│  │                                                              ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ Error Message (可选)                                         ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ ChatInput                                                    ││
│  │ ┌────────────────────────────────────────────┐ ┌──────────┐ ││
│  │ │ 输入框 (毛玻璃效果)                         │ │ 发送按钮 │ ││
│  │ └────────────────────────────────────────────┘ └──────────┘ ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 尺寸规范

| 元素 | 尺寸 | 说明 |
|------|------|------|
| 窗口宽度 | 480px - 640px | 响应式 |
| 窗口最小高度 | 400px | |
| 窗口默认高度 | 600px | |
| Header 高度 | 64px | |
| ChatInput 高度 | 64px | |
| 消息气泡最大宽度 | 80% | |
| 消息气泡内边距 | 12px 16px | |
| 消息气泡圆角 | 16px | |
| 消息间距 | 16px | |

### 2.3 颜色规范

#### 2.3.1 消息气泡颜色

**Agent 消息 (左侧):**
```css
/* 浅色模式 */
background: rgba(255, 255, 255, 0.72);
border: 1px solid rgba(255, 255, 255, 0.5);
color: #1F2937;

/* 深色模式 */
background: rgba(31, 41, 55, 0.72);
border: 1px solid rgba(255, 255, 255, 0.18);
color: #F9FAFB;
```

**User 消息 (右侧):**
```css
/* 浅色/深色模式统一 */
background: linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%);
color: #FFFFFF;
```

**系统消息:**
```css
/* 浅色模式 */
background: rgba(243, 244, 246, 0.8);
color: #6B7280;

/* 深色模式 */
background: rgba(55, 65, 81, 0.8);
color: #9CA3AF;
```

#### 2.3.2 状态颜色

| 状态 | 颜色 | 使用场景 |
|------|------|----------|
| 在线/运行中 | `#10B981` (绿色) | Agent 在线，可接收消息 |
| 思考中 | `#3B82F6` (蓝色) | Agent 正在处理消息 |
| 空闲 | `#6B7280` (灰色) | Agent 在线但无活动 |
| 错误 | `#EF4444` (红色) | Agent 出现错误 |
| 离线 | `#9CA3AF` (浅灰) | Agent 未连接 |

### 2.4 字体规范

| 元素 | 字体 | 大小 | 字重 |
|------|------|------|------|
| Header 标题 | Inter / 思源黑体 | 18px | 600 |
| Header 描述 | Inter / 思源黑体 | 12px | 400 |
| 消息内容 | Inter / 思源黑体 | 14px | 400 |
| 消息时间戳 | Inter | 10px | 400 |
| 输入框 | Inter / 思源黑体 | 14px | 400 |
| 输入框占位符 | Inter / 思源黑体 | 14px | 400 |
| 状态文本 | Inter | 12px | 500 |
| 工具名称 | Inter | 12px | 500 |

---

## 3. 组件详细设计

### 3.1 AgentDialogContent

**职责:** 主对话容器，整合所有子组件，管理 Agent 状态

**布局结构:**
```tsx
<div className="flex flex-col h-full text-gray-800 dark:text-gray-200">
  {/* Header */}
  <div className="p-4 border-b border-white/20 dark:border-white/10">
    {/* Agent 信息 + 状态 */}
  </div>

  {/* Message List */}
  <MessageList messages={messages} isLoading={isThinking} />

  {/* Error Message */}
  {errorMessage && (
    <div className="px-4 py-2 text-sm text-red-500 bg-red-50 dark:bg-red-900/20">
      {errorMessage}
    </div>
  )}

  {/* Input */}
  <ChatInput onSend={handleSend} disabled={!isInitialized || isRunning} />
</div>
```

**Header 详细设计:**
```
┌─────────────────────────────────────────────────────────────┐
│  ┌──────────┐                                               │
│  │   Icon   │  Agent Name                                   │
│  │  (32px)  │  Description                                  │
│  │  渐变背景 │  ● 在线                                       │
│  └──────────┘                                               │
└─────────────────────────────────────────────────────────────┘
```

**样式:**
```css
.header {
  padding: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  gap: 12px;
}

.agent-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  background: linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%);
}

.agent-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.agent-name {
  font-size: 16px;
  font-weight: 600;
  color: #111827;
}

.dark .agent-name {
  color: #F9FAFB;
}

.agent-status {
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
}
```

### 3.2 MessageList

**职责:** 显示对话历史，自动滚动，显示加载状态

**布局结构:**
```tsx
<div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-4">
  {/* 空状态 */}
  {messages.length === 0 && !isLoading && (
    <div className="text-center text-gray-500 dark:text-gray-400 text-sm">
      开始对话...
    </div>
  )}

  {/* 消息列表 */}
  {messages.map((msg) => (
    <MessageBubble key={msg.id} message={msg} />
  ))}

  {/* 加载指示器 */}
  {isLoading && <ThinkingIndicator />}
</div>
```

**消息气泡设计:**

```
Agent 消息:
┌────────────────────────────┐
│  消息内容                   │
│  多行文本支持               │
│  自动换行                   │
└────────────────────────────┘

User 消息:
            ┌────────────────────────────┐
            │  消息内容                   │
            │  多行文本支持               │
            │  自动换行                   │
            └────────────────────────────┘

系统消息:
┌─────────────────────────────────────────────────────────┐
│  系统通知消息 (居中，灰色背景)                            │
└─────────────────────────────────────────────────────────┘
```

**ThinkingIndicator 设计:**
```
┌──────────────────────────────┐
│  ● ● ●  思考中...             │
│  (三个点依次脉冲动画)          │
└──────────────────────────────┘
```

**样式:**
```css
.message-list {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.message-bubble {
  max-width: 80%;
  border-radius: 16px;
  padding: 12px 16px;
  line-height: 1.5;
  word-wrap: break-word;
}

.message-bubble.agent {
  align-self: flex-start;
  border-bottom-left-radius: 4px; /* 左下角切角 */
}

.message-bubble.user {
  align-self: flex-end;
  border-bottom-right-radius: 4px; /* 右下角切角 */
}

.thinking-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.72);
  border-radius: 16px;
  border-bottom-left-radius: 4px;
}

.thinking-dots {
  display: flex;
  gap: 4px;
}

.thinking-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #3B82F6;
  animation: pulse 1.5s ease-in-out infinite;
}

.thinking-dot:nth-child(2) {
  animation-delay: 0.2s;
}

.thinking-dot:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes pulse {
  0%, 100% { opacity: 0.3; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1); }
}
```

### 3.3 ChatInput (已实现，需增强)

**当前实现:** 基础版本已实现
**需要增强:**
- 多行输入支持
- 字符计数
- 发送状态动画

**增强设计:**
```
┌─────────────────────────────────────────────────────────────┐
│  ┌────────────────────────────────────────────────┐ ┌────┐  │
│  │  输入你的消息...                                │ │ 发送│  │
│  │  (支持多行，Enter 发送，Shift+Enter 换行)       │ └────┘  │
│  │                                                 │         │
│  └────────────────────────────────────────────────┘         │
│  按 Enter 发送 · Shift+Enter 换行 · 0/2000                   │
└─────────────────────────────────────────────────────────────┘
```

**发送按钮状态:**
```css
/* 默认状态 */
.send-button {
  background: linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%);
  color: white;
  transition: all 0.2s ease;
}

/* 悬停状态 */
.send-button:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
}

/* 禁用状态 */
.send-button:disabled {
  background: #9CA3AF;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

/* 发送中状态 */
.send-button.sending {
  background: #6B7280;
  position: relative;
}

.send-button.sending::after {
  content: '';
  position: absolute;
  width: 12px;
  height: 12px;
  border: 2px solid white;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
```

### 3.4 StatusIndicator (已实现)

**当前实现:** 基础版本已实现
**状态显示:** ✅ 在线 / ○ 空闲 / ⚠ 错误 / ○ 离线 / 思考中...

---

## 4. 交互设计

### 4.1 消息发送流程

```
用户输入 → 按下 Enter/点击发送 → 输入框清空 → 消息添加到列表
    ↓
User 消息气泡显示 → 禁用输入框 → 显示 "思考中..." 状态
    ↓
Agent 开始处理 → 思考指示器动画 → 流式响应开始 (未来)
    ↓
Agent 响应完成 → 添加 Agent 消息气泡 → 恢复输入框 → 状态恢复为 "在线"
```

### 4.2 错误处理

```
Agent 错误 → 显示错误消息条 (红色背景)
    ↓
错误消息条包含:
  - 错误图标
  - 错误文本
  - "重试" 按钮 (可选)
    ↓
用户点击 "重试" → 重新发送最后一条消息
```

**错误消息条设计:**
```css
.error-message {
  padding: 8px 16px;
  background: rgba(239, 68, 68, 0.1);
  border-top: 1px solid rgba(239, 68, 68, 0.2);
  color: #EF4444;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}

.dark .error-message {
  background: rgba(239, 68, 68, 0.2);
}
```

### 4.3 键盘快捷键

| 快捷键 | 功能 |
|--------|------|
| Enter | 发送消息 |
| Shift + Enter | 换行 |
| Escape | 关闭窗口 |
| Cmd/Ctrl + K | 聚焦输入框 |

### 4.4 无障碍设计

**ARIA 标签:**
```html
<div role="dialog" aria-label="Agent 对话">
  <div role="log" aria-live="polite" aria-label="对话消息">
    <!-- 消息列表 -->
  </div>
  <input
    type="text"
    aria-label="输入消息"
    placeholder="输入你的消息..."
  />
  <button aria-label="发送消息">发送</button>
</div>
```

**焦点管理:**
- 窗口打开时自动聚焦输入框
- Tab 键循环: 输入框 → 发送按钮 → (如果有) 重试按钮 → 输入框
- Escape 键关闭窗口

---

## 5. 动画规范

### 5.1 消息气泡动画

```css
/* 消息出现动画 */
@keyframes message-enter {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.message-bubble {
  animation: message-enter 0.2s ease-out;
}
```

### 5.2 思考指示器动画

```css
/* 点脉冲动画 */
@keyframes pulse {
  0%, 100% { opacity: 0.3; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1); }
}

.thinking-dot {
  animation: pulse 1.5s ease-in-out infinite;
}

.thinking-dot:nth-child(1) { animation-delay: 0s; }
.thinking-dot:nth-child(2) { animation-delay: 0.2s; }
.thinking-dot:nth-child(3) { animation-delay: 0.4s; }
```

### 5.3 发送按钮动画

```css
/* 发送中旋转动画 */
@keyframes spin {
  to { transform: rotate(360deg); }
}

.send-button.sending::after {
  animation: spin 0.8s linear infinite;
}
```

### 5.4 自动滚动

```typescript
// 平滑滚动到底部
const scrollToBottom = () => {
  listRef.current?.scrollTo({
    top: listRef.current.scrollHeight,
    behavior: 'smooth',
  });
};
```

---

## 6. 响应式设计

### 6.1 窗口尺寸

| 断点 | 宽度 | 布局调整 |
|------|------|----------|
| 小型 | 320px - 480px | 消息气泡最大宽度 90% |
| 中型 | 480px - 640px | 消息气泡最大宽度 80% |
| 大型 | 640px+ | 消息气泡最大宽度 70% |

### 6.2 输入框自适应

```css
/* 小屏幕 - 单行输入 */
.chat-input input {
  height: 40px;
}

/* 大屏幕 - 多行输入 */
@media (min-width: 640px) {
  .chat-input textarea {
    min-height: 40px;
    max-height: 120px;
    resize: none;
  }
}
```

---

## 7. 未来扩展设计

### 7.1 工具调用可视化

**设计稿:**
```
┌─────────────────────────────────────────────────────────┐
│  🔧 正在使用工具...                                       │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │ read_file                                         │    │
│  │ 参数: { path: "/src/components/..." }            │    │
│  │ 状态: ✓ 完成                                      │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │ search_web                                        │    │
│  │ 参数: { query: "OriginOS 架构设计" }             │    │
│  │ 状态: ⟳ 进行中...                                 │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 7.2 流式响应

**设计:**
```
Agent 消息气泡中逐字显示:
┌──────────────────────────────────────────────┐
│  这是一段正在生成的消息...█                    │
│  (光标闪烁动画)                               │
└──────────────────────────────────────────────┘
```

### 7.3 Markdown 渲染

**支持:**
- 标题 (H1-H6)
- 代码块 (带语法高亮)
- 列表 (有序/无序)
- 链接
- 加粗/斜体
- 引用块

---

## 8. 组件文件结构

```
src/components/os/agent-dialog/
├── AgentDialogContent.tsx    # 主组件
├── MessageList.tsx           # 消息列表
├── MessageBubble.tsx         # 消息气泡 (新增)
├── ThinkingIndicator.tsx     # 思考指示器 (新增)
├── ToolCallDisplay.tsx       # 工具调用显示 (未来)
├── ChatInput.tsx             # 输入组件 (已实现，需增强)
├── StatusIndicator.tsx       # 状态指示器 (已实现)
├── ErrorMessage.tsx          # 错误消息 (新增)
└── index.ts                  # 导出
```

---

## 9. 验收标准

### 9.1 功能验收

- [ ] 点击 Dock 图标打开 Agent 对话窗口
- [ ] 对话窗口使用真实 pi-agent 核心
- [ ] 可以发送消息并收到回复
- [ ] 显示 Agent 思考状态
- [ ] 显示错误状态
- [ ] 窗口可关闭、最小化、聚焦
- [ ] 多 Agent 可同时运行

### 9.2 UI 验收

- [ ] 消息气泡样式符合设计规范
- [ ] 状态指示器颜色正确
- [ ] 动画流畅 (60fps)
- [ ] 深色模式正确显示
- [ ] 毛玻璃效果正确应用
- [ ] 响应式布局正确

### 9.3 交互验收

- [ ] Enter 发送消息
- [ ] Shift+Enter 换行 (增强后)
- [ ] Escape 关闭窗口
- [ ] 自动滚动到最新消息
- [ ] 输入框自动聚焦

---

## 10. 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1.0.0 | 2026-03-16 | 初始设计 |

---

**下一步:** 传递给 Developer 进行实现
