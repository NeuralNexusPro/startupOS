# 测试文档 - Story OS.19

**Story:** Skill、Agent 与 RoleAgent 目录导出 ZIP
**版本:** 1.0
**最后更新:** 2026-07-26

## 测试目标

通过自动化测试验证三类入口的完整目录可安全导出为 ZIP，并通过 Electron 定位文件；失败时无损坏产物且用户获得明确反馈。

## 自动化测试用例

### TC-U1 入口目录映射

- 对 `skill/foo` 解析为 `<dataRoot>/skills/foo`。
- 对 `agent/foo`、`role-agent/foo` 解析为 `<dataRoot>/agents/foo`。
- 拒绝空 ID、`..`、绝对路径、正反斜杠和不支持的入口类型。

### TC-U2 ZIP 内容完整

- 准备包含根文件、嵌套文件、中文文件名和空目录的临时入口目录。
- 执行导出后读取 ZIP 条目，验证相对层级和文件内容完整。
- 验证 ZIP 不包含目标 ZIP 或临时 ZIP。

### TC-U3 重复导出与失败清理

- 目标 ZIP 已存在时再次导出，验证内容被替换。
- 模拟压缩流失败，验证旧 ZIP不被破坏且临时文件已删除。
- 源目录不存在时返回稳定 `ENTRY_NOT_FOUND` 错误。

### TC-I1 IPC 成功链路

- 通过 IPC handler 提交 `{entryType, entryId}`。
- 验证调用导出服务并返回 `{success: true, zipPath}`。
- 验证成功后 `shell.showItemInFolder(zipPath)` 恰好调用一次。

### TC-I2 IPC 失败链路

- 非法参数不得触发文件系统导出。
- 压缩失败返回结构化错误，不抛出未处理异常。
- ZIP 成功但系统定位失败时返回可区分错误和已生成的 `zipPath`。

### TC-I3 安装包运行时依赖

- Windows/macOS package verifier 检查 `entry-export-service.js` 和 `node_modules/archiver/index.js` 存在。
- 从解出的 `app.asar` 中加载 `archiver`，验证 `ZipArchive` 构造器可用。
- 缺少任一文件或运行时导出时构建验证失败。

### TC-C1 共享按钮交互

- Electron API 存在时渲染“导出 ZIP”按钮。
- 点击时传递正确 `entryType + entryId`。
- pending 时按钮 disabled 且显示 loading。
- 成功后恢复；失败时显示错误并可重试。
- 非 Electron 环境不渲染按钮。

### TC-C2 三类窗体接入

- SkillDialog 传递 `skill + skillName`。
- 普通 Agent 窗体传递 `agent + agentId`。
- RoleAgent 窗体传递 `role-agent + agentId`。
- 系统内置 Skill 的 `systemManaged=true` 或元数据未解析时不显示导出按钮。
- 自定义 Skill 的 `systemManaged=false` 时显示导出按钮。

### TC-S1 系统技能导出限制

- 在 `data/skills/system-skill/SKILL.md` 写入 `originos-system: true`。
- 调用主进程导出服务，验证返回 `EXPORT_NOT_ALLOWED`。
- 验证没有创建 `system-skill.zip`，且未调用系统文件管理器。

## 脚本化验收

1. 在 `desktop:dev` 打开一个 Skill，点击导出，确认同级生成 `{skill}.zip`，资源管理器选中该文件。
2. 解压 ZIP，确认 `SKILL.md`、附件、嵌套产物和目录层级完整。
3. 对普通 Agent 和 RoleAgent 重复验证，确认 ZIP 位于 `data/agents`。
4. 连续点击导出，确认按钮防重复，第二次完成后 ZIP 可正常解压且无临时文件。

## 验证命令

```bash
pnpm --filter @originos/desktop test -- entry-export
pnpm --filter @originos/web test -- ExportEntryButton
pnpm --filter @originos/desktop build
pnpm --filter @originos/web lint
pnpm lint
```

## 覆盖率目标

- 路径解析与导出服务分支覆盖率不低于 80%。
- IPC 成功/失败集成点 100%。
- 三类入口关键用户流程 100%。

## 测试结果

### 自动化结果（2026-07-26）

| 验证项 | 结果 |
|--------|------|
| Desktop 路径、ZIP、内置技能限制、覆盖、失败清理、IPC | 2 files / 21 tests passed |
| Core 技能系统元数据响应 | 1 file / 2 tests passed |
| Web 导出按钮与技能导出策略 | 2 files / 7 tests passed |
| Desktop TypeScript build | Passed |
| Web TypeScript check | Passed |
| Frozen lockfile（pnpm 9.15.9 / Windows） | Passed |
| Windows/macOS package verifier 脚本语法与运行时断言 | Passed；完整安装包检查待下一次打包执行 |
| Windows `dist-electron` 运行位置解析 `archiver` | Passed，`ZipArchive` 为 function |
| `pnpm lint` | Passed，0 errors；2772 条既有 warnings |
| Story 文档占位符与 `git diff --check` | Passed |
| Architecture Guard | Passed |

### 已自动覆盖

- Skill、Agent、RoleAgent 路径映射和非法 ID 拒绝。
- ZIP 中文文件名、嵌套文件、空目录和内容读取。
- 同名 ZIP 替换、压缩失败时旧 ZIP 保留、临时文件清理。
- IPC 成功、非法参数、目录缺失和系统定位失败响应。
- UI Electron 环境判断、调用参数、pending 防重和错误重试。
- 内置技能 `systemManaged` 传播、UI 隐藏和 IPC 二次拒绝。

### 发布后人工抽检

安装 `0.1.43` 后，在 Windows 中分别打开自定义 Skill、普通 Agent、RoleAgent，点击导出按钮，确认资源管理器打开并选中同级 ZIP。该系统 UI 行为无法在当前无界面环境自动确认，不阻塞已覆盖主进程调用的发布验证。

### 剩余风险

Electron `shell.showItemInFolder` 没有成功回调；若操作系统接受调用但文件管理器自身未显示，主进程无法区分。ZIP 文件创建和路径返回不受影响。
