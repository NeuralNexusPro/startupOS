# Story OS.7: Agent 托管服务 - 测试计划

**版本**: v1.0
**日期**: 2026-03-12
**状态**: 待执行
**QA Engineer**: QA Engineer

---

## 1. 测试概述

### 1.1 测试范围

本测试计划覆盖 OS.7 Agent 托管服务的全面验证。

| 测试类型 | 优先级 | 状态 |
|---------|--------|------|
| 功能测试 | P0 | 部分完成 |
| 集成测试 | P0 | 待执行 |
| 性能测试 | P1 | 待执行 |
| 错误处理测试 | P1 | 待执行 |

### 1.2 已验证功能

基于之前的 Epic OS Agent 对话功能验证：

| 功能 | 状态 | 备注 |
|------|------|------|
| Dock Agent 图标点击 | ✅ 通过 | 5/5 个图标正常 |
| Agent 对话窗口渲染 | ✅ 通过 | 所有 UI 元素正常 |
| 多 Agent 同时运行 | ✅ 通过 | 修复后验证通过 |
| 发送按钮功能 | ✅ 通过 | 修复后验证通过 |
| Escape 键关闭 | ✅ 通过 | 功能正常 |

---

## 2. 实现状态

### 2.1 已实现组件

| 组件 | 文件路径 | 状态 |
|------|---------|------|
| AgentIcon | `src/components/os/agent-host/AgentIcon.tsx` | ✅ 已实现 |
| AgentDialog | `src/components/os/agent-host/AgentDialog.tsx` | ✅ 已实现 |
| MessageList | `src/components/os/agent-host/MessageList.tsx` | ✅ 已实现 |
| MessageInput | `src/components/os/agent-host/MessageInput.tsx` | ✅ 已实现 |
| AgentInitializer | `src/components/os/AgentInitializer.tsx` | ✅ 已实现 |
| useAgentLauncher | `src/hooks/useAgentLauncher.ts` | ✅ 已实现 |
| useAgentLifecycle | `src/hooks/useAgentLifecycle.ts` | ✅ 已实现 |
| agentLauncherStore | `src/store/agentLauncherStore.ts` | ✅ 已实现 |
| agentRegistry | `src/store/agentRegistry.ts` | ✅ 已实现 |

---

## 3. 功能测试用例

### 3.1 Agent 渲染测试

#### TC-FUNC-001: Agent 初始化

**前置条件:** Desktop 页面加载完成

**测试步骤:**
1. 访问 /desktop
2. 检查控制台日志
3. 验证 5 个默认 Agent 初始化

**预期结果:**
- ✅ 控制台显示 "Agent Registry initialized with 5 default agents"
- ✅ 默认 Agent: 产品经理、架构师、UX 设计师、开发者、QA 工程师

#### TC-FUNC-002: Agent 图标渲染

**测试步骤:**
1. 检查 Dock 区域
2. 验证 5 个 Agent 图标正确渲染
3. 验证图标 emoji 正确

**预期结果:**
- ✅ 📋 产品经理
- ✅ 🏗️ 架构师
- ✅ 🎨 UX 设计师
- ✅ 💻 开发者
- ✅ 🧪 QA 工程师

### 3.2 点击启动测试

#### TC-FUNC-003: 单击启动 Agent

**测试步骤:**
1. 点击 Agent 图标
2. 验证对话框打开
3. 验证欢迎消息显示
4. 验证状态指示器

**预期结果:**
- ✅ 对话框正确打开
- ✅ 显示 "你好！我是 {Agent名称}。有什么我可以帮助你的吗？"
- ✅ 状态显示 "● 已连接 · {Agent名称}"

#### TC-FUNC-004: 再次点击关闭 Agent

**测试步骤:**
1. 在 Agent 已打开状态
2. 再次点击 Dock 图标
3. 验证对话框关闭

**预期结果:**
- ✅ 对话框正确关闭
- ✅ 图标状态重置

### 3.3 状态同步测试

#### TC-FUNC-005: Agent 状态指示器

**测试步骤:**
1. 打开 Agent 对话框
2. 检查状态指示器
3. 验证 RUNNING 状态

**预期结果:**
- ✅ 状态显示 "● 已连接"
- ✅ 颜色为绿色

#### TC-FUNC-006: Dock 图标状态

**测试步骤:**
1. 打开 Agent 对话框
2. 检查 Dock 图标
3. 验证 active 状态
4. 关闭对话框
5. 验证状态重置

**预期结果:**
- ✅ 打开时图标显示 active
- ✅ 关闭时图标状态正确重置

### 3.4 多 Agent 测试

#### TC-FUNC-007: 同时打开多个 Agent

**测试步骤:**
1. 打开产品经理对话框
2. 打开架构师对话框
3. 验证两个对话框同时显示
4. 验证各自独立操作

**预期结果:**
- ✅ 两个对话框同时显示
- ✅ 各自独立发送消息
- ✅ 互不干扰

#### TC-FUNC-008: 多 Agent 状态管理

**测试步骤:**
1. 打开多个 Agent
2. 关闭其中一个
3. 验证其他 Agent 状态不变

**预期结果:**
- ✅ 关闭单个不影响其他
- ✅ 状态正确同步

### 3.5 消息功能测试

#### TC-FUNC-009: 发送消息 (Enter 键)

**测试步骤:**
1. 打开 Agent 对话框
2. 输入消息
3. 按 Enter 键
4. 验证消息发送

**预期结果:**
- ✅ 控制台显示消息日志
- ✅ 对话框保持打开

#### TC-FUNC-010: 发送消息 (发送按钮)

**测试步骤:**
1. 打开 Agent 对话框
2. 输入消息
3. 点击发送按钮
4. 验证消息发送

**预期结果:**
- ✅ 控制台显示消息日志
- ✅ 对话框保持打开 (不关闭)

---

## 4. 集成测试用例

### 4.1 Dock 集成测试

#### TC-INT-001: Dock 图标点击集成

**测试步骤:**
1. 点击 Dock Agent 图标
2. 验证 agentLauncherStore 更新
3. 验证 agentRegistryStore 状态更新
4. 验证对话框渲染

**预期结果:**
- ✅ Store 状态正确更新
- ✅ UI 正确响应

### 4.2 Acrylic 材质集成测试

#### TC-INT-002: AcrylicDialog 样式

**测试步骤:**
1. 打开 Agent 对话框
2. 检查对话框样式
3. 验证毛玻璃效果
4. 验证动画效果

**预期结果:**
- ✅ 毛玻璃效果正确
- ✅ 进入/退出动画流畅

### 4.3 Agent Registry 集成测试

#### TC-INT-003: Agent Registry 初始化

**测试步骤:**
1. 检查 AgentInitializer 组件
2. 验证默认 Agent 注册
3. 验证 Store 状态

**预期结果:**
- ✅ 5 个默认 Agent 正确注册
- ✅ Store 包含完整 Agent 信息

---

## 5. 性能测试用例

### 5.1 启动性能

#### TC-PERF-001: Agent 启动时间

**测试步骤:**
1. 记录点击时间
2. 测量对话框渲染时间
3. 记录 10 次平均值

**预期结果:**
- ✅ 启动时间 < 200ms
- ✅ 无明显延迟

### 5.2 多 Agent 性能

#### TC-PERF-002: 5 个 Agent 同时运行

**测试步骤:**
1. 打开 5 个 Agent 对话框
2. 测量内存占用
3. 测量 CPU 占用
4. 测量响应时间

**预期结果:**
- ✅ 内存增量 < 50MB
- ✅ CPU 占用 < 10%
- ✅ 响应流畅

---

## 6. 错误处理测试

### 6.1 边界条件

#### TC-ERR-001: 空消息发送

**测试步骤:**
1. 输入框为空
2. 尝试发送消息
3. 验证行为

**预期结果:**
- ✅ 不发送空消息
- ✅ 无错误

#### TC-ERR-002: 长消息处理

**测试步骤:**
1. 输入超长消息 (>2000 字符)
2. 发送消息
3. 验证处理

**预期结果:**
- ✅ 正确处理或截断
- ✅ 无崩溃

---

## 7. 可访问性测试

### 7.1 键盘导航

#### TC-A11Y-001: 键盘操作

**测试步骤:**
1. Tab 导航到 Agent 图标
2. Enter 打开对话框
3. Tab 导航到输入框
4. Escape 关闭对话框

**预期结果:**
- ✅ 所有操作可通过键盘完成
- ✅ 焦点顺序正确

### 7.2 ARIA 支持

#### TC-A11Y-002: ARIA 标签

**测试步骤:**
1. 检查关闭按钮 aria-label
2. 检查输入框 placeholder
3. 检查状态区域

**预期结果:**
- ✅ aria-label="Close" 存在
- ✅ 语义化标签正确

---

## 8. 已完成的回归测试

基于 Epic OS Agent 对话功能验证报告：

| 测试用例 | 状态 | 备注 |
|---------|------|------|
| TC-REG-001: 多 Agent 同时运行 | ✅ 通过 | 两个对话框同时显示 |
| TC-REG-002: 发送按钮功能 | ✅ 通过 | 消息发送成功，对话框保持 |
| TC-REG-003: 图标状态重置 | ✅ 通过 | 关闭后状态正确 |

---

## 9. 测试执行计划

### 9.1 执行顺序

```
Phase 1: 功能测试 (P0) → 30 分钟
Phase 2: 集成测试 (P0) → 20 分钟
Phase 3: 性能测试 (P1) → 15 分钟
Phase 4: 错误处理测试 (P1) → 10 分钟
Phase 5: 可访问性测试 (P2) → 10 分钟
```

---

## 10. 验收标准

- [ ] 所有功能测试通过
- [ ] 集成测试通过
- [ ] 多 Agent 并发正常
- [ ] 启动时间 < 200ms
- [ ] 无内存泄漏
- [ ] 键盘导航完整

---

**创建时间**: 2026-03-12
**文档版本**: v1.0
**参考文档**:
- `docs/QA/epic-os-agent-dialog-verification.md`
- `docs/specs/epic-OS/story-OS.7/ADD.md`
