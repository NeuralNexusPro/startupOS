# 架构设计文档 - Story PERF.1

**Story:** 桌面日志按日期滚动  
**版本:** 1.0  
**最后更新:** 2026-07-27

## 设计目标

将日期文件解析和日志追加从 `main.ts` 的固定路径变量中抽离，形成桌面主进程私有、可测试的每日日志写入器。每次写入依据当前本地日期选择文件，从而支持不重启跨日滚动。

## 影响模块

| 模块 | 变更 |
|------|------|
| `packages/desktop/src/main/main.ts` | 使用日志写入器，保留 console capture、异常监听和 LLM 过滤职责 |
| `packages/desktop/src/main/services/daily-log-writer.ts` | 新增文件名解析、目录初始化和追加写入 |
| `packages/desktop/src/main/services/__tests__/daily-log-writer.test.ts` | 覆盖日期、跨日、追加、兼容和失败路径 |
| `packages/desktop/src/main/__tests__/log-capture.test.ts` | 验证 desktop/LLM 路由与原 console 调用 |

## 模块职责

```typescript
type LogChannel = 'desktop' | 'llm';

interface DailyLogWriterOptions {
  logsDir: string;
  now?: () => Date;
  append?: (filePath: string, content: string) => void;
}

interface DailyLogWriter {
  append(channel: LogChannel, line: string): void;
  resolvePath(channel: LogChannel, at?: Date): string;
}
```

- `resolvePath` 使用本地 `getFullYear/getMonth/getDate` 生成 `YYYY-MM-DD`，禁止截取 UTC ISO 日期作为本地日期。
- `append` 在写入时解析路径并以追加模式写入。
- writer 不调用全局 console，防止 console 代理递归。
- `main.ts` 负责时间戳、级别、序列化和 LLM 过滤，不把领域外逻辑塞入 writer。

## 数据流

```text
Electron console / process error
  → main.ts capture and serialize
  → DailyLogWriter.append(channel, line)
  → app.getPath('logs')/{channel}-{local-date}.log
```

## 依赖方向

```text
packages/desktop/src/main/main.ts
  → packages/desktop/src/main/services/daily-log-writer.ts
  → Node.js fs/path
```

该服务不依赖 Web、Core feature 或构建产物，不引入反向依赖和循环依赖。

## 兼容策略

- 不迁移、删除或重命名旧 `desktop.log`、`llm.log`。
- 新版本启动后立即写带日期文件。
- 保持日志行格式和 LLM 前缀规则，因此现有人工诊断方式仍可使用。
- PERF.2 可以基于统一文件名安全实现保留和压缩，不回改本 Story 契约。

## 性能考虑

- 文件路径解析为 O(1)，不读取或扫描目录。
- 本 Story保留当前追加写入可靠性语义；异步批量写入和背压属于 PERF.3。
- 每条日志只允许一次目标文件写入，避免因 desktop/LLM 分流重构产生重复。

## 安全与可靠性

- 文件名由受控 channel 和数字日期组成，不接受用户路径。
- 写入错误被隔离，不影响 Electron 主流程。
- 不改变日志内容采集范围，不新增敏感数据。
- 测试注入的 `logsDir` 必须使用临时目录。

## AGENTS.md 符合性

- 仅修改 `packages/desktop/src/main/` 源码，不修改 `dist-electron/`。
- Electron 主进程只依赖同层服务和 Node API。
- 不在 `packages/web/src/app/` 放置业务逻辑。
- 不引入数据库、后端框架、UI 状态库或新第三方依赖。
- 测试覆盖成功、失败、跨日、兼容和跨平台路径。
