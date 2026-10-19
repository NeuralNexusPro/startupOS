# 实施文档 - Story P2.9

## 实施步骤

1. 增加产出验收公共 DTO 和未发布方案策略服务。
2. 增加 Web/Electron 双通道读写入口。
3. 在解决方案设计界面增加节点级产出验收编辑器。
4. 对齐 WorkItem 的 verifier、HITL、revision 与下游门控。
5. 拆分看板状态并增加确认操作。
6. 完成自动化和 desktop:dev 验收。

## 禁止项

- 不修改生成目录。
- 不允许跳过 verifier。
- 不允许修改已发布契约。
- 不在 Web API route 中实现业务规则。
