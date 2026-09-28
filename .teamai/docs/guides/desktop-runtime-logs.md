# 桌面端运行时日志

## 日志位置

| 日志文件 | 路径 | 内容 |
|---------|------|------|
| **LLM 日志** | `~/Library/Logs/@originos/desktop/llm.log` | 模型调用、工具执行、IPC 调用、路径解析 |
| **主进程日志** | `~/Library/Logs/@originos/desktop/main.log` | Electron 启动、自动更新、崩溃报告 |

## 常用查看命令

```bash
# 实时跟踪 LLM 日志
tail -f ~/Library/Logs/@originos/desktop/llm.log

# 只看 IPC 调用
tail -f ~/Library/Logs/@originos/desktop/llm.log | grep "\[IPC\]"

# 只看路径解析
tail -f ~/Library/Logs/@originos/desktop/llm.log | grep "setup-data-root\|DATA_ROOT\|MONOREPO_ROOT"

# 只看工具执行
tail -f ~/Library/Logs/@originos/desktop/llm.log | grep "\[Tool:"

# 只看 Agent 事件
tail -f ~/Library/Logs/@originos/desktop/llm.log | grep "\[LLM Event\]"

# 只看错误
tail -f ~/Library/Logs/@originos/desktop/llm.log | grep -i "error\|fail\|exception"

# 查看最近 100 行
tail -100 ~/Library/Logs/@originos/desktop/llm.log
```

## 日志前缀说明

| 前缀 | 来源 | 说明 |
|------|------|------|
| `[IPC]` | IPC 调用 | Electron 主进程与渲染进程通信 |
| `[LLM]` | LLM 调用 | 模型请求和响应 |
| `[LLM Event]` | Agent 事件 | 消息开始/结束、工具调用 |
| `[LLM Turn Detail]` | Turn 详情 | 工具调用参数、thinking 内容 |
| `[anthropic stream]` | 流式响应 | Anthropic API 流式调用 |
| `[AgentLoop]` | Agent 循环 | 消息发送、工具数量 |
| `[createRuntimeModel]` | 模型创建 | 模型配置、凭证信息 |
| `[OriginOSAgent]` | Agent 初始化 | 模型信息、凭证模式 |
| `[streamFn]` | Stream 函数 | 凭证注入、bearer 模式 |
| `[setup-data-root]` | 路径初始化 | 数据目录、资源目录 |
| `[AgentManager]` | Agent 管理 | 会话创建、工具上下文 |
| `[Tool:*]` | 工具执行 | 工具开始/结束/错误 |
| `[WorkspaceService]` | 工作区 | 文件列表、路径解析 |
| `[PersistentAgent]` | 持久化 Agent | Agent 初始化、工具配置 |

## 路径架构

### 打包模式

```
getMonorepoRoot() → {Resources}/ (只读，技能定义)
getDataRoot()     → ~/Library/Application Support/@originos/desktop/data (可写，用户数据)
```

### 开发模式

```
getMonorepoRoot() → /Users/.../originos
getDataRoot()     → /Users/.../originos/data
```

## 数据目录结构

```
~/Library/Application Support/@originos/desktop/data/
├── agents/          # Agent 定义（可写）
├── skills/          # 技能工作区（可写）
├── projects/        # 项目数据（可写）
├── sessions/        # 会话数据（可写）
├── notifications/   # 通知（可写）
└── tmp/             # 临时文件（可写）
```

## 故障排查

### 1. 文件写入失败（只读文件系统）

**症状**：`Error: EROFS: read-only file system`

**原因**：工具回退路径指向了只读的 Resources 目录

**检查**：
```bash
tail -50 ~/Library/Logs/@originos/desktop/llm.log | grep "setup-data-root"
```

**预期输出**：
```
[setup-data-root] Packaged mode → DATA_ROOT: /Users/.../data MONOREPO_ROOT: /Applications/.../Resources
```

### 2. 技能加载失败

**症状**：首页没有技能显示

**检查**：
```bash
# 检查技能目录
ls ~/Library/Application\ Support/@originos/desktop/data/skills/

# 检查 API 响应
curl -s http://localhost:3000/api/user-skills | head -100
```

### 3. 工作区无法打开

**症状**：点击技能的工作区按钮没有内容

**检查**：
```bash
tail -50 ~/Library/Logs/@originos/desktop/llm.log | grep "WorkspaceService\|FS_LIST"
```

**预期**：`baseDir` 应该指向 `~/Library/Application Support/.../data/skills/`
