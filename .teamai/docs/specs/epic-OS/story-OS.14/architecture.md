# 架构设计 - Story OS.14

**Story:** Agent Runtime 工作目录与输出目录边界收敛
**Epic:** OS — Phase 0 OS 交互基础
**最后更新:** 2026-07-20

---

## 目标架构

### 工具层

- 只理解一个语义：`workingDirectory`
- 所有相对路径都基于当前注入的 `workingDirectory`
- 不知道 `outputDir`、`skillOutputDir`、项目根、solutions 或 Agent 目录

### Agent / Runtime 层

- 持有 `workingDirectory` 与 `outputDir`
- 根据当前任务阶段决定调用工具时的 `workingDirectory`
- 在 system prompt 中可呈现输出目录信息，指导 Agent 使用相对路径写入产物目录
- 不把 `outputDir` 下推进通用工具上下文

---

## 模块设计

### ToolExecutionContext 收敛

**变更前：**

```typescript
interface ToolExecutionContext {
  sessionId: string;
  workingDirectory: string;
  skillOutputDir?: string;  // ❌ 移除
  // ... 其他字段
}
```

**变更后：**

```typescript
interface ToolExecutionContext {
  sessionId: string;
  workingDirectory: string;  // ✅ 唯一路径基准
}
```

### 工具实现去耦

#### file-tools.ts

```typescript
// ❌ 变更前
const fullPath = toolContext.skillOutputDir 
  ? path.join(toolContext.skillOutputDir, filePath)
  : path.join(toolContext.workingDirectory, filePath);

// ✅ 变更后
const fullPath = path.resolve(toolContext.workingDirectory, filePath);
```

#### document-tools.ts

```typescript
// ❌ 变更前
const basePath = toolContext.skillOutputDir || toolContext.workingDirectory;

// ✅ 变更后
const basePath = toolContext.workingDirectory;
```

#### url-tools.ts

```typescript
// ❌ 变更前
const outputPath = toolContext.skillOutputDir || toolContext.workingDirectory;

// ✅ 变更后
const outputPath = toolContext.workingDirectory;
```

#### bash-tools.ts

```typescript
// ❌ 变更前
env: {
  SKILL_OUTPUT_DIR: toolContext.skillOutputDir,
  WORKING_DIRECTORY: toolContext.workingDirectory,
}

// ✅ 变更后
env: {
  WORKING_DIRECTORY: toolContext.workingDirectory,
}
```

#### skill-tools.ts

```typescript
// ❌ 变更前
toolContext.skillOutputDir = outputDir;  // 修改全局 context

// ✅ 变更后
// 不再修改 toolContext，输出目录信息通过 system prompt 传递
```

### AgentManager 收敛

```typescript
// ❌ 变更前
const toolContext: ToolExecutionContext = {
  sessionId,
  workingDirectory,
  skillOutputDir: outputDir,  // ❌ 注入输出目录
};

// ✅ 变更后
const toolContext: ToolExecutionContext = {
  sessionId,
  workingDirectory,  // ✅ 只注入工作目录
};
```

### Runtime / Prompt 层保留输出目录

```typescript
// SkillLauncher 或 SkillDialog
const systemPrompt = `
你是一个技能执行助手。

工作目录: ${workingDirectory}
输出目录: ${outputDir}  // ✅ 在 system prompt 中说明

所有文件操作默认在工作目录中进行。
如果需要写入产物，请使用相对路径写入输出目录。
`;
```

---

## 代码变更

### 修改文件

| 操作 | 文件路径 | 说明 |
|------|---------|------|
| MODIFY | `packages/core/src/lib/integrations/pi-agent/tools/context.ts` | 收敛工具上下文类型，移除 `skillOutputDir` |
| MODIFY | `packages/core/src/lib/integrations/pi-agent/agent-manager.ts` | 停止向工具上下文注入 `outputDir` |
| MODIFY | `packages/core/src/lib/integrations/pi-agent/tools/file-tools.ts` | 文件工具只认 `workingDirectory` |
| MODIFY | `packages/core/src/lib/integrations/pi-agent/tools/document-tools.ts` | 文档工具只认 `workingDirectory` |
| MODIFY | `packages/core/src/lib/integrations/pi-agent/tools/url-tools.ts` | URL 工具路径基准收敛 |
| MODIFY | `packages/core/src/lib/integrations/pi-agent/tools/bash-tools.ts` | 移除 tool context 输出目录环境注入 |
| MODIFY | `packages/core/src/lib/integrations/pi-agent/tools/skill-tools.ts` | Skill 元工具不再修改工具上下文 |
| MODIFY | `packages/core/src/lib/integrations/pi-agent/tools/__tests__/working-directory.test.ts` | 更新架构契约测试 |

---

## 路径解析规则

### 优先级

工具层路径解析只遵循一个规则：

```
相对路径 + workingDirectory = 绝对路径
```

### 示例场景

#### 场景 1: AI 解决方案窗体

```
workingDirectory: /project/root
outputDir: /project/root/solutions

Agent 调用 read_file("data.json")
  → 解析为 /project/root/data.json

Agent 调用 write_file("solution.md", "...")
  → system prompt 指导使用相对路径 "solutions/solution.md"
  → 解析为 /project/root/solutions/solution.md
```

#### 场景 2: 技能执行

```
workingDirectory: /data/web/skills/my-skill
outputDir: /data/web/skills/my-skill/output

Agent 调用 execute_command("ls")
  → 在 /data/web/skills/my-skill 执行

Agent 调用 write_file("result.txt", "...")
  → system prompt 指导使用 "output/result.txt"
  → 解析为 /data/web/skills/my-skill/output/result.txt
```

#### 场景 3: 项目 Agent

```
workingDirectory: /project/my-project
outputDir: /project/my-project/artifacts

Agent 调用 read_file("src/main.ts")
  → 解析为 /project/my-project/src/main.ts

Agent 调用 write_file("analysis.md", "...")
  → system prompt 指导使用 "artifacts/analysis.md"
  → 解析为 /project/my-project/artifacts/analysis.md
```

---

## 相关文档

- [需求规格](./requirements.md)
- [测试策略](./testing.md)
- [Story OS.14 README](./README.md)
