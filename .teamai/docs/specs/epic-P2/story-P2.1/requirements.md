# 需求 - Story P2.1

**Story:** 解决方案窗体入口与 AI 初始化
**Epic:** P2 - AI 解决方案设计
**最后更新:** 2026-04-22

---

## 用户故事

作为项目成员，
我想在项目窗体内点击「AI 解决方案」入口，让 AI 自动读取本体并推荐建模维度，
以便快速启动解决方案设计流程。

---

## 验收标准

- [ ] AC1: 项目窗体内有「AI 解决方案」入口按钮
- [ ] AC2: 前置检查：项目必须有本体（`ontologyId` 不为空），无本体则提示引导
- [ ] AC3: 点击入口后打开解决方案窗体，触发 Skill 初始化
- [ ] AC4: Skill 自动读取 `output/business-model.json`，分析业务特征
- [ ] AC5: AI 向用户呈现建模维度推荐（事的维度 / 人的维度）+ 推荐理由
- [ ] AC6: 初始化过程中展示加载状态（< 10 秒）
- [ ] AC7: 已有进行中的方案可恢复（不重复初始化）

---

## 依赖关系

### 已实现

| 文件 | 状态 | 说明 |
|------|------|------|
| `src/app/api/projects/[id]/solution/initialize/route.ts` | ✅ | 复制 Skill、创建 solutions/ 目录、launch pi-agent |
| `src/components/solution/SolutionDesign.tsx` | ✅ | 初始化流程、sessionStorage 防重复、加载状态 |
| `skills/solution-design/SKILL.md` | ✅ | 前置条件检查 + 阶段一本体分析 |

### 缺失部分

| 缺失点 | 说明 | 优先级 |
|--------|------|--------|
| 入口按钮 | 项目窗体中尚未确认「AI 解决方案」按钮的位置和集成点 | Critical |
| 前置条件检查 UI | 无本体时的引导提示 UI | High |
| ViewRenderer 集成 | `solution` 窗体类型是否已注册到 AppWindow 系统 | Critical |

### 需要确认的集成点

```typescript
// src/components/os/window/ViewRenderer.tsx
// 需确认是否已注册 'solution' view type
```

---

## 相关文档

- [Epic P2 README](../README.md)
- [PRD 3.1 入口与窗体](../../../product/phase-2-ai-solution-design.md#31-入口与窗体)
- [PRD 3.2 方案初始化](../../../product/phase-2-ai-solution-design.md#32-方案初始化)
- [solution/initialize API](../../../../src/app/api/projects/[id]/solution/initialize/route.ts)
- [SolutionDesign 组件](../../../../src/components/solution/SolutionDesign.tsx)
