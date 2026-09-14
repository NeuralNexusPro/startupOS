# OS.21 测试计划

## 自动化验证 Goal

通过 OS.21 定义的统一 Scheduler Runtime 测试 case，验证用户任务兼容、系统任务隔离、邮箱轮询迁移、防重、退避和 Desktop 生命周期。

## 单元测试

| ID | 场景 | 预期 |
|---|---|---|
| UT-01 | 注册 user/internal 两类任务 | owner 和 visibility 正确，默认值兼容旧任务 |
| UT-02 | 多任务到期 | 按到期顺序触发，tick 不等待业务完成 |
| UT-03 | 同任务仍在运行 | 下一触发点按 overlap=skip 处理，不发生并发 |
| UT-04 | 相同 fire key 重入 | 只执行一次并记录跳过原因 |
| UT-05 | 单任务连续失败 | 仅该任务退避，退避有上限且 jitter 可注入测试 |
| UT-06 | 时钟回拨/前跳 | 不重复执行；missed-run 按策略跳过或只补一次 |
| UT-07 | stop | timer/listener 释放，停止后不再派发 |
| UT-08 | 调度日志脱敏 | 不含 secret、邮件正文或原始异常 |

## 集成测试

| ID | 场景 | 预期 |
|---|---|---|
| IT-01 | Desktop ready 恢复用户任务与邮箱 owner | 两类任务进入同一 Runtime，邮箱 internal |
| IT-02 | Email connector 启用/停用/改间隔 | 幂等注册、注销、原子重排，无重复 ID |
| IT-03 | 一个邮箱超时 | 其他邮箱与用户任务继续执行 |
| IT-04 | suspend/resume | 不形成并发或补偿风暴，nextRunAt 正确 |
| IT-05 | 旧 tasks.json 启动 | 数据可读且用户行为、run log 保持一致 |
| IT-06 | API/UI 列表 | 默认只显示 user，显式内部诊断为只读 |

## 关键失败与边界

- owner 不存在、执行器抛错、间隔非法、任务被执行中删除。
- 100 个任务同时注册、多个任务同毫秒到期。
- quit 发生在任务执行中；resume 发生在长时间睡眠后。
- connector 配置频繁切换时无 listener、timer 或任务泄漏。

## 性能测试

- 使用 fake clock 注册 100 个任务，单 tick 调度逻辑小于 50ms。
- 连续推进 10,000 个触发点，内存与防重索引保持有界。
- Electron 主线程无同步长任务；业务 owner 异步执行。

## 覆盖率与命令

- Core scheduler 核心逻辑覆盖率 ≥80%，Desktop owner/lifecycle 集成点 100%。
- 执行相关 Vitest、Core/Desktop/Web typecheck、`pnpm lint` 和 `git diff --check`。
- 实施完成后必须创建自动化测试验证 Goal，目标原文使用本文件“自动化验证 Goal”。

## 人工验收

1. 同时启用用户分钟任务与两个邮箱连接器，确认均按期运行。
2. 定时任务界面不显示邮箱内部任务；感知中心仍显示各邮箱健康状态。
3. 断开一个邮箱网络，确认该邮箱退避，而用户任务和另一邮箱不受影响。
4. Windows 睡眠后恢复，确认不重复拉取邮件或重复触发规则。

## 测试结果

尚未实施，待开发完成后记录自动化结果、人工验证步骤和剩余风险。
