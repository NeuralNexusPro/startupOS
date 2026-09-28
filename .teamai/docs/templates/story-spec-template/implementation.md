# 开发文档 - Story {N}.{M}

**Story:** {Story Title}
**版本:** 1.0
**最后更新:** {Date}

---

## 🎯 开发目标

{简要描述本 Story 的开发目标}

---

## 📋 实施步骤

### 步骤 1: 环境准备

**任务：**
- [ ] 确认开发环境符合要求
- [ ] 安装必要的依赖
- [ ] 配置 IDE 和 Lint 工具

**命令：**
```bash
# 安装依赖
npm install

# 运行 Lint 检查
npm run validate
```

### 步骤 2: 创建文件结构

**任务：**
- [ ] 创建必要的目录
- [ ] 创建文件骨架
- [ ] 设置导出

**命令：**
```bash
# 创建目录
mkdir -p src/lib/features/{feature-name}
mkdir -p src/components/organisms

# 创建文件
touch src/lib/features/{feature-name}/index.ts
touch src/lib/features/{feature-name}/types.ts
touch src/lib/features/{feature-name}/{module}.ts
```

### 步骤 3: 定义类型

**任务：**
- [ ] 在 `types.ts` 中定义接口
- [ ] 确保符合 AGENTS.md 规约
- [ ] 添加 JSDoc 注释

**代码示例：**
```typescript
// src/lib/features/{feature-name}/types.ts

/**
 * {类型描述}
 */
export interface TypeName {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### 步骤 4: 实现核心逻辑

**任务：**
- [ ] 实现业务逻辑
- [ ] 添加错误处理
- [ ] 添加性能约束注释

**代码示例：**
```typescript
// src/lib/features/{feature-name}/{module}.ts

// Performance: Must complete in < {X}s
export async function coreFunction(param: ParamType): Promise<ReturnType> {
  try {
    // 实现逻辑
    return result;
  } catch (error) {
    throw new FeatureError('Error message', 'ERROR_CODE');
  }
}
```

### 步骤 5: 实现状态管理

**任务：**
- [ ] 创建 Zustand Store
- [ ] 定义状态和操作
- [ ] 添加测试

**代码示例：**
```typescript
// src/lib/features/{feature-name}/{feature}-store.ts

import { create } from 'zustand';

export const useFeatureStore = create<FeatureState>((set) => ({
  // 状态和操作
}));
```

### 步骤 6: 实现 UI 组件

**任务：**
- [ ] 创建组件文件
- [ ] 实现组件逻辑
- [ ] 添加样式（Tailwind CSS）
- [ ] 确保可访问性

**代码示例：**
```typescript
// src/components/organisms/ComponentName.tsx

export const ComponentName: React.FC<Props> = ({ prop1, prop2 }) => {
  return (
    <div className="flex flex-col gap-4">
      {/* 组件内容 */}
    </div>
  );
};
```

### 步骤 7: 集成和测试

**任务：**
- [ ] 集成各模块
- [ ] 运行单元测试
- [ ] 运行集成测试
- [ ] 手动测试

### 步骤 8: 文档和审查

**任务：**
- [ ] 更新 implementation.md
- [ ] 添加代码注释
- [ ] 运行 Lint 检查
- [ ] 提交代码审查

---

## 💻 关键代码片段

### 代码片段 1: {功能描述}

```typescript
// {文件路径}

/**
 * {功能描述}
 */
export function functionName(param: ParamType): ReturnType {
  // 实现
}
```

**说明：**
- {说明 1}
- {说明 2}

### 代码片段 2: {功能描述}

```typescript
// {文件路径}

// 代码示例
```

**说明：**
- {说明}

---

## 📦 第三方库使用

### 库 1: {库名称}

**用途:** {用途描述}

**安装：**
```bash
npm install {package-name}
```

**使用示例：**
```typescript
import { something } from '{package-name}';

// 使用示例
```

**注意事项：**
- {注意事项 1}
- {注意事项 2}

---

## ⚙️ 环境配置

### 开发环境

**Node.js:** >= 18.x
**npm:** >= 9.x

### 环境变量

```bash
# .env.local

NEXT_PUBLIC_API_URL=http://localhost:3000
# 其他环境变量
```

### IDE 配置

**VSCode 推荐插件：**
- ESLint
- Prettier
- TypeScript
- Tailwind CSS IntelliSense

**VSCode 设置：**
```json
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  }
}
```

---

## ⚠️ 开发注意事项

### 必须遵守的规约

1. **AGENTS.md 规约**
   - ✅ 技术栈约束
   - ✅ 目录结构规约
   - ✅ 单向按序依赖
   - ✅ 性能约束

2. **代码规范**
   - ✅ TypeScript 严格模式
   - ✅ 禁止 `any` 类型
   - ✅ ESLint 规则
   - ✅ Prettier 格式化

3. **性能要求**
   - ✅ 关键路径添加性能注释
   - ✅ 满足性能约束
   - ✅ 避免不必要的重渲染

### 常见陷阱

#### 陷阱 1: {陷阱描述}

**问题：**
```typescript
// ❌ 错误示例
```

**解决：**
```typescript
// ✅ 正确示例
```

#### 陷阱 2: {陷阱描述}

**问题：** {问题描述}

**解决：** {解决方案}

---

## 🐛 已知问题

### 问题 1: {问题标题}

**描述:** {问题描述}

**影响范围:** {影响范围}

**临时解决方案:** {解决方案}

**计划修复:** {修复计划}

### 问题 2: {问题标题}

**描述:** {问题描述}

**解决方案:** {解决方案}

---

## 🔍 代码审查要点

### 审查清单

#### 架构和设计
- [ ] 符合 AGENTS.md 规约
- [ ] 模块依赖符合单向原则
- [ ] 文件结构正确
- [ ] 类型定义完整

#### 代码质量
- [ ] TypeScript 严格模式
- [ ] 无 `any` 类型
- [ ] 错误处理完善
- [ ] 性能约束满足

#### 测试
- [ ] 单元测试覆盖率 > {X}%
- [ ] 集成测试通过
- [ ] 手动测试通过

#### 文档
- [ ] 代码注释完整
- [ ] JSDoc 注释准确
- [ ] README 更新

#### Lint 检查
- [ ] `npm run type-check` 通过
- [ ] `npm run lint` 通过
- [ ] `npm run format:check` 通过
- [ ] `npm run agents:check` 通过

---

## 📝 开发日志

### {Date}

**完成：**
- {完成的任务}

**问题：**
- {遇到的问题}

**解决：**
- {解决方案}

### {Date}

**完成：**
- {完成的任务}

---

## 🚀 部署说明

### 本地开发

```bash
npm run dev
```

访问: http://localhost:3000

### 构建

```bash
npm run build
```

### 生产部署

```bash
npm run start
```

---

## 📌 相关文档

- [Story README](./README.md)
- [需求文档](./requirements.md)
- [交互设计](./interaction.md)
- [架构设计](./architecture.md)
- [测试文档](./testing.md)
- [AGENTS.md](../../../AGENTS.md)
- [LINT.md](../../../LINT.md)
