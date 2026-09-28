# P0 Bug Report: 首页报错

**Bug ID**: P0-BUG-001
**报告日期**: 2026-03-08
**报告人**: QA Engineer
**优先级**: P0 - Critical (阻塞主页访问)
**状态**: 已识别，待修复

---

## 问题描述

主页 (http://localhost:3000/) 无法正常加载，存在多个导入和组件使用错误。

---

## 根因分析

### 问题1: Spotlight 导入错误 ❌

**文件**: `src/app/page.tsx:27`

**错误代码**:
```typescript
import { Spotlight } from '@/components/os/spotlight';
```

**问题**: 使用命名导入，但Spotlight是默认导出

**正确代码**:
```typescript
import Spotlight from '@/components/os/spotlight';
```

**证据**: `src/components/os/spotlight/index.tsx:17`
```typescript
export default function Spotlight({ items }: SpotlightProps) {
```

---

### 问题2: Dock 导入路径大小写错误 ❌

**文件**: `src/app/page.tsx:26`

**错误代码**:
```typescript
import { Dock } from '@/components/os/Dock';
```

**问题**:
1. 路径大小写错误 (`Dock` 应为 `dock`)
2. 使用命名导入，但Dock是默认导出

**正确代码**:
```typescript
import Dock from '@/components/os/dock';
```

**证据**:
- 目录: `src/components/os/dock/` (小写)
- 导出: `src/components/os/dock/index.tsx:17` - `export default function Dock()`

---

### 问题3: Spotlight 组件 Props 不匹配 ❌

**文件**: `src/app/page.tsx:581`

**错误代码**:
```typescript
<Spotlight isOpen={isOpen} onClose={close} />
```

**问题**: Spotlight组件不接受`isOpen`和`onClose` props

**实际接口**: `src/components/os/spotlight/index.tsx:13-15`
```typescript
interface SpotlightProps {
  items: SpotlightItem[];
}
```

**正确代码**:
```typescript
<Spotlight items={spotlightItems} />
```

**说明**:
- Spotlight内部使用`useSpotlight()` hook管理状态
- `isOpen`和`close`在组件内部处理
- 只需要传入`items`数组

---

### 问题4: spotlightItems 未定义 ⚠️

**文件**: `src/app/page.tsx`

**问题**: 页面中没有定义`spotlightItems`数组

**建议**: 参考Desktop组件的实现 (`src/components/os/Desktop.tsx:39-67`)

**示例代码**:
```typescript
const spotlightItems = useMemo<SpotlightItem[]>(() => [
  {
    id: 'settings',
    type: SpotlightItemType.APP,
    title: '设置',
    subtitle: '系统设置',
    icon: '⚙️',
    action: () => console.log('Open Settings'),
    keywords: ['settings', 'preferences', '设置'],
  },
  // ... 更多项
], []);
```

---

## 影响范围

**严重程度**: P0 - Critical

**影响**:
- ✅ 主页完全无法加载
- ✅ 阻塞所有用户访问
- ✅ Epic-OS组件集成失败

**受影响页面**:
- http://localhost:3000/ (主页)

---

## 修复方案

### 修复步骤

1. **修复导入语句** (第26-27行)
```typescript
// 修改前
import { Dock } from '@/components/os/Dock';
import { Spotlight } from '@/components/os/spotlight';

// 修改后
import Dock from '@/components/os/dock';
import Spotlight from '@/components/os/spotlight';
```

2. **添加 spotlightItems 定义** (建议在第463行之后)
```typescript
export default function OSHomePage() {
  // Spotlight items
  const spotlightItems = useMemo<SpotlightItem[]>(() => [
    {
      id: 'settings',
      type: SpotlightItemType.APP,
      title: '系统设置',
      subtitle: '配置系统参数',
      icon: '⚙️',
      action: () => console.log('Open Settings'),
      keywords: ['settings', '设置'],
    },
    {
      id: 'help',
      type: SpotlightItemType.APP,
      title: '帮助文档',
      subtitle: '查看使用指南',
      icon: '❓',
      action: () => console.log('Open Help'),
      keywords: ['help', '帮助'],
    },
  ], []);

  // Spotlight
  const { isOpen, open, close } = useSpotlight();
  // ...
```

3. **修复 Spotlight 组件使用** (第581行)
```typescript
// 修改前
<Spotlight isOpen={isOpen} onClose={close} />

// 修改后
<Spotlight items={spotlightItems} />
```

4. **添加必要的类型导入** (第24行之后)
```typescript
import type { SpotlightItem } from '@/types/spotlight';
import { SpotlightItemType } from '@/types/spotlight';
```

---

## 测试验证

### 验证步骤

1. 应用修复
2. 重启开发服务器: `npm run dev`
3. 访问 http://localhost:3000/
4. 验证页面正常加载
5. 测试 Cmd+K 打开 Spotlight
6. 测试 Dock 显示和交互

### 预期结果

- ✅ 主页正常加载
- ✅ 无控制台错误
- ✅ Dock 显示在底部
- ✅ Spotlight 可通过 Cmd+K 打开

---

## 相关文件

```
src/app/page.tsx (需要修复)
src/components/os/dock/index.tsx (参考)
src/components/os/spotlight/index.tsx (参考)
src/components/os/Desktop.tsx (参考spotlightItems实现)
src/types/spotlight.ts (类型定义)
```

---

## 建议

### 立即行动
1. 分配给 developer-3 修复
2. 优先级: P0 - 立即修复
3. 预计修复时间: 15分钟

### 预防措施
1. 添加 TypeScript 严格模式检查
2. 添加 ESLint 导入检查规则
3. 在集成新组件时进行冒烟测试

---

**报告生成时间**: 2026-03-08 09:52
**QA 工程师**: QA Engineer
**下一步**: 转发给 developer-3 修复
