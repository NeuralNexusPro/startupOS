# 测试文档 - Story PERF.1

**Story:** 桌面日志按日期滚动  
**版本:** 1.0  
**最后更新:** 2026-07-27

## 测试目标

通过自动化测试证明 desktop 与 LLM 日志按本地自然日可靠分文件，跨日无需重启，同日安全追加，旧日志不受影响，写入失败不会中断应用或触发递归。

## 自动化测试用例

### TC-U1 本地日期文件名

- 注入 `2026-07-27 12:00:00` 本地时间。
- desktop 路径以 `desktop-2026-07-27.log` 结尾。
- LLM 路径以 `llm-2026-07-27.log` 结尾。
- 文件名不包含冒号、斜杠、空格或时区名称。

### TC-U2 时区边界

- 构造本地日期与 UTC 日期不同的时间。
- 验证文件名使用本地年月日，不使用 UTC 日期。
- 在不修改进程全局时区的情况下通过注入 Date 完成测试。

### TC-U3 同日追加与重启

- 第一个 writer 写入两行后销毁。
- 第二个 writer 使用相同目录和日期再写一行。
- 验证三行顺序完整，文件未被截断。

### TC-U4 不重启跨日

- 同一 writer 的时钟从 27 日 23:59:59 切换到 28 日 00:00:00。
- 验证两条日志分别位于两个日期文件。
- 验证 28 日写入未修改 27 日文件。

### TC-U5 系统时钟回拨

- 时钟从 28 日回拨到 27 日。
- 验证新日志追加到既有 27 日文件，不覆盖原内容。

### TC-U6 旧日志兼容

- 预先创建 `desktop.log` 和 `llm.log`。
- 产生新日志后验证旧文件字节完全不变。
- 验证新内容只存在于带日期文件。

### TC-U7 文件系统失败隔离

- 注入会抛错的 mkdir 或 append 操作。
- 验证 writer 不抛出到 console 调用方。
- 验证失败路径不调用全局 console。
- 后续恢复可写后可以继续记录。

### TC-I1 desktop capture

- 分别调用代理后的 `console.log/info/warn/error`。
- 验证 desktop 文件保留级别、ISO 时间戳和序列化内容。
- 验证原 console 方法每次仍调用一次。

### TC-I2 LLM capture

- 命中 LLM 前缀的日志进入当日 LLM 文件。
- 未命中前缀的日志不进入 LLM 文件。
- 跨日后命中日志进入新日期 LLM 文件。
- 保留现有 desktop 全量捕获行为，不产生额外重复行。

### TC-I3 进程异常

- 模拟 `uncaughtException` 和 `unhandledRejection` 处理函数。
- 验证错误写入当日 desktop 文件且应用级处理函数不因日志失败再次抛错。

### TC-I4 跨平台路径

- 使用 `path.win32` 和 `path.posix` 验证目录拼接。
- 两种路径都产生相同的受控文件名。
- 日志路径始终位于注入的 logs 目录内。

## 脚本化验收

1. 启动 `pnpm desktop:dev`，产生普通日志和一次 Agent 会话日志。
2. 打开 Electron logs 目录，确认存在当日 `desktop-YYYY-MM-DD.log` 和 `llm-YYYY-MM-DD.log`。
3. 重启应用后再次操作，确认当日文件追加且旧内容仍在。
4. 使用测试时钟执行跨日集成测试，确认无需等待真实午夜。
5. 在旧 `desktop.log`、`llm.log` 存在时启动，确认旧文件未变化。

## 验证命令

```bash
pnpm --filter @originos/desktop test -- daily-log-writer log-capture
pnpm --filter @originos/desktop build
pnpm lint
```

## 覆盖率目标

- 日期、路径和写入器核心逻辑分支覆盖率不低于 80%。
- desktop/LLM capture 成功与失败集成点覆盖率 100%。
- 跨日、同日重启、旧文件兼容和写入失败场景 100%。

## 发布验证

- Windows 安装包运行后检查 `%APPDATA%` 对应 Electron logs 目录。
- macOS 安装包运行后检查 Electron logs 目录。
- 两个平台均验证当日文件可追加、应用重启不覆盖。

## 测试结果

2026-07-27 自动化验证结果：

- Desktop 全量测试：5 个测试文件、40 个测试通过。
- `daily-log-writer.test.ts`：8 个测试通过，覆盖本地日期、重启追加、跨日、时钟回拨、旧文件、空行、失败隔离和跨平台路径。
- Desktop TypeScript build：通过。
- `desktop:dev` 冒烟：主进程启动成功，实际创建并写入 `desktop-2026-07-27.log` 与 `llm-2026-07-27.log`。
- 全仓库 lint：0 errors，2774 个既有 warnings。
- `git diff --check`：通过。

剩余人工验证：

- Windows 与 macOS 安装包运行后检查真实 Electron logs 目录。
- 重启安装包并确认当日日志继续追加。
