# 需求文档 - Story OS.19

**Story:** Skill、Agent 与 RoleAgent 目录导出 ZIP
**版本:** 1.0
**最后更新:** 2026-07-26

## 需求来源

- 用户需求：三类对象支持一键导出完整目录为 ZIP，并打开 ZIP 所在目录。
- Epic OS：桌面窗体和原生系统交互能力。
- AGENTS.md：Web UI 不直接访问文件系统；运行时目录分别位于 `data/skills` 和 `data/agents`。

## 详细需求

### FR1 导出入口

- 自定义 Skill、Agent、RoleAgent 窗体头部提供统一图标按钮，tooltip 为“导出 ZIP”。
- `originos-system: true` 的系统内置 Skill 不显示导出按钮。
- 导出过程中按钮进入 loading/disabled 状态，防止同一入口重复并发导出。

### FR2 目录映射

- `skill` 映射到 `data/skills/{id}`。
- `agent` 与 `role-agent` 映射到 `data/agents/{id}`。
- 映射必须复用统一目录解析规则，不允许在 UI 或多个服务中复制业务映射。

### FR3 ZIP 生成与定位

- ZIP 放在源目录同级，命名为 `{id}.zip`。
- ZIP 必须包含源目录内全部普通文件和子目录，并保留相对层级。
- 先写临时文件，成功后原子替换目标 ZIP，失败时删除临时文件。
- 完成后调用 Electron `shell.showItemInFolder` 定位 ZIP。

### FR4 错误与安全

- 拒绝空 ID、绝对路径、`.`、`..`、路径分隔符和目录穿越。
- 源路径必须在预期数据根目录内且为目录。
- 主进程必须根据 `SKILL.md` 元数据拒绝系统内置 Skill，不能仅依赖 UI 隐藏。
- 目录不存在、压缩失败、定位失败须通过 IPC 返回稳定错误码和可读消息。

## 验收标准

### AC1 三类入口可导出

**Given** 用户打开 Skill、Agent 或 RoleAgent 窗体  
**When** 点击“导出 ZIP”  
**Then** 系统根据入口类型解析正确目录并开始异步导出。

### AC2 ZIP 内容完整

**Given** 工作目录包含根文件、嵌套目录、中文文件名和空目录  
**When** 导出完成  
**Then** ZIP 保留所有相对路径和文件内容，且不包含同级旧 ZIP。

### AC3 系统定位

**Given** ZIP 已成功创建  
**When** 导出服务完成  
**Then** 系统文件管理器打开 ZIP 所在目录并选中该文件。

### AC4 重复导出

**Given** 同名 ZIP 已存在  
**When** 再次导出  
**Then** 新 ZIP 完整替换旧 ZIP，目录中没有 `.tmp` 半成品。

### AC5 明确失败

**Given** ID 非法、源目录缺失、压缩失败或定位失败  
**When** 用户点击导出  
**Then** 不产生损坏 ZIP，UI 显示明确错误并恢复按钮可用状态。

### AC6 内置技能禁止导出

**Given** 已 materialize 到 `data/skills/{id}` 的技能在 `SKILL.md` 中声明 `originos-system: true`  
**When** 用户查看窗体或绕过 UI 调用导出 IPC  
**Then** UI 不显示导出按钮，IPC 返回 `EXPORT_NOT_ALLOWED`，且不创建 ZIP。

## 边界与异常

- 空目录允许导出，ZIP 中保留入口根目录语义或有效空归档。
- 符号链接不得用于逃逸允许的数据根目录。
- 文件正在被其他程序占用时返回导出失败，不静默成功。
- 同一按钮在导出期间忽略重复点击；不同对象可独立导出。
- Web 浏览器非 Electron 环境不显示或禁用导出能力，不调用 Web API 模拟文件系统访问。

## 依赖关系

| 依赖 | 内容 | 状态 |
|------|------|------|
| OS.11 | Skill / Agent / RoleAgent 窗体类型与入口元数据 | Existing |
| OS.14 | Agent Runtime 工作目录边界 | Complete |
| Electron preload | 安全 IPC 暴露与 `shell.showItemInFolder` | Existing |

## 非功能需求

- 压缩采用流式异步实现，不阻塞 Electron 主线程。
- TypeScript strict，禁止新增 `any`。
- IPC 参数最小化，仅接受受限入口类型和 ID。
- 核心服务分支覆盖率目标不低于 80%，IPC 集成点覆盖 100%。

## 变更历史

| 日期 | 变更内容 | 变更原因 | 变更人 |
|------|---------|---------|--------|
| 2026-07-26 | 初始版本 | 用户提出目录导出需求 | Codex |
