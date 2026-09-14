# SENSE.3 测试

## 自动化测试验证 Goal

目标：通过 Story SENSE.3 中定义的全部测试 case，证明邮件增量轮询具备正确性、恢复性和内容安全性。

## 测试用例

| ID | 层级 | 场景 | 预期 |
|---|---|---|---|
| S3-UT-01 | Unit | lastUid=9，返回 UID 10–12 | 三个事件，游标 12 |
| S3-UT-02 | Unit | UID 11 写入失败 | 抛错，游标停在 10 |
| S3-UT-03 | Unit | UIDVALIDITY 改变 | 采用安全基线并报告 reset |
| S3-UT-04 | Unit | 超长正文与危险字符 | 清洗、64 KiB 截断并标注 |
| S3-UT-05 | Unit | 重复/乱序 UID | 排序，跳过旧 UID，不重复事件 |
| S3-IT-01 | Integration | 新建 poller 读取旧游标再轮询 | 只处理游标之后的邮件 |
| S3-IT-02 | Integration | 邮件包含附件 | event 仅含受控引用和元数据 |
| S3-SEC-01 | Security | secret/远程 URL/绝对路径出现在输入 | secret 脱敏，危险附件引用被阻止 |

## 验证命令

```bash
pnpm --filter @originos/core test -- email-connector.test.ts
pnpm --filter @originos/core type-check
pnpm lint
```

真实邮箱 provider 的 OAuth/IMAP 联调依赖用户凭据和供应商控制台，不能在单元测试自动化；在后续 adapter Story 中以专用测试账号人工验证只读权限、断线重连和 token 刷新。本 Story 的 core 合同由 fake client 全自动覆盖。

## 通过门槛

- 上表自动化用例全部通过。
- TypeScript 严格检查无新增错误，不使用 `any`。
- 无真实 secret、附件二进制或绝对路径写入事件。
