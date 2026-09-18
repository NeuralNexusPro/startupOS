# 测试文档 - Story M.14

**Story:** 渐进式 Agent 上下文、KV Cache 与 Token 统计
**版本:** 1.0
**最后更新:** 2026-09-18

## 测试策略

用小型确定性单元测试验证目录、预算和前缀边界，用三条运行时集成链路验证 prefetch、ownership、恢复和 Pi cache 参数。缓存收益以 provider 返回的 usage 为证据，不用时间波动推断命中。

## 自动化测试 Case

| ID | 类型 | 场景 | 预期 |
|---|---|---|---|
| M14-UT-01 | 单元 | 大型 Patterns/Knowledge 输入目录渲染 | 输出确定、有界，不含正文 |
| M14-UT-02 | 单元 | 空文件或无标题文件 | 不注入空 section，提供最小按需说明 |
| M14-UT-03 | 单元 | 相同稳定输入重复组装 | stable system prompt 字节及 hash 一致 |
| M14-UT-04 | 单元 | phase / Memory / working directory 变化 | stable system prompt hash 不变，会话上下文变化 |
| M14-UT-05 | 单元 | Agent.md / 安全策略 / Tool 协议变化 | stable system prompt hash 变化 |
| M14-UT-06 | 单元 | 多 Provider 结果超预算 | 稳定排序并在边界内截断 |
| M14-SEC-01 | 安全 | 召回内容包含伪 system 指令 | 内容保持在 reference 边界，不能进入 stable system 区 |
| M14-SEC-02 | 安全 | 不同 owner 有相似 Pattern | 只返回当前 owner 可见内容 |
| M14-IT-01 | 集成 | 普通 Agent turn | 不注入全文，相关 prefetch 进入当前 turn |
| M14-IT-02 | 集成 | RoleAgent phase 切换 | 回复正常，stable system prompt hash 不变 |
| M14-IT-03 | 集成 | Project Agent | 现有惰性加载行为保持，改用统一目录 |
| M14-IT-04 | 集成 | 协作 supervisor/worker | 每个 worker 按自身 owner/task 召回，无跨 Agent 泄漏 |
| M14-IT-05 | 集成 | 历史会话恢复 | session id 稳定，召回与 ownership 保持 |
| M14-IT-06 | 集成 | prefetch 抛错 | Agent 继续回复，错误日志无内容 |
| M14-IT-07 | 集成 | 支持缓存的 provider 连续两轮 | usage 可观察 `cacheRead/cacheWrite`；session id 相同 |
| M14-COMPAT-01 | 兼容 | 不支持缓存的 provider | 正常回复，cache usage 为零或缺省 |
| M14-UT-07 | 单元 | 多条 assistant usage 聚合 | 各字段逐项求和，可选字段不被伪造 |
| M14-UT-08 | 单元 | 上下文分区估算 | 复用 chars/3 规则，结果标记 estimated |
| M14-IT-08 | 集成 | Desktop/Web message_end | usage 随最终消息保存且仅累计一次 |
| M14-IT-09 | 集成 | 历史会话恢复 | 新会话统计保持；旧会话显示 unavailable 而非零 |
| M14-IT-10 | 集成 | Agent/Skill 会话 UI | 消息完成后更新汇总，delta 不触发统计更新 |
| M14-IT-11 | 集成 | collaboration worker | CostController/Metrics 收到真实 input/output/cache usage |

## 性能验证

准备包含长 `Patterns.md` 和 `Knowledge.md` 的真实匿名样本，对四条 Agent 链路记录：

- 修改前后 system prompt 字符数和估算 token 数。
- stable system prompt 长度与连续 turn hash。
- turn recall 长度、Provider 查询耗时。
- provider 返回的 input、cacheRead、cacheWrite usage。
- output、可选 reasoning、provider cost 与会话聚合结果。
- UI 展示值与 session JSON 中逐消息 usage 的一致性。

验收以全文不再进入 prompt、预算生效和稳定前缀确定性为硬条件；缓存命中率只作为各 provider 的观测结果。

## 验证命令

```bash
pnpm --filter @originos/core test
pnpm --filter @originos/core build
pnpm lint
pnpm lint:boundaries
node scripts/check-architecture-boundaries.cjs --self-test
```

## 人工检查

- 打开同一 Agent 历史会话连续发送两个不同任务，确认回复不被无关 Pattern 带偏。
- 在 RoleAgent 阶段切换后继续对话，确认上下文和工具正常。
- 运行一个 supervisor + worker 协作任务，确认相关经验可用且各 worker 不读取其他 owner 内容。
