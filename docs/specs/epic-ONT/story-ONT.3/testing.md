# ONT.3 测试

| AC | 自动化用例 |
|---|---|
| 三种输入可迁移 | 分别转换旧 Ontology、OntologyModel、business model 样例并检查稳定 ID 与来源引用 |
| dry-run 无副作用 | 执行预览后断言 ontology、backup、migration 文件均不存在 |
| 备份与不覆盖 | 比较备份原始字节；已有 canonical 快照时断言拒绝且内容不变 |
| 路径安全 | data root 外路径和非法 projectId 在读取前被拒绝 |
| 安全回滚 | 未修改结果可删除并记录 rolled_back；更新时间变化后拒绝删除 |
| 只读兼容 | canonical 投影为旧 DTO，调用不写文件 |

自动化命令：定向 Vitest、core TypeScript 编译、`pnpm lint`、`pnpm lint:boundaries`、架构 self-test、`openspec validate migrate-legacy-ontology-models --strict`。

测试数据使用临时 data root 内的小型 JSON 样例，不读取用户真实项目。无法自动化项：后续 Web/Desktop 接线不属于本 Task。剩余风险：跨文件写入中断需要审计核对，不宣称事务性回滚。

## 2026-09-18 验证结果

- 定向 Vitest：2 files、13 tests 全部通过。
- Core TypeScript 编译通过。
- `pnpm lint`：0 error，仅 2983 条既有 warning。
- 架构边界：881 个生产文件 0 诊断；43 个导入用例 × 2 个 CWD 自测通过。
- OpenSpec strict validation 与 `git diff --check` 通过。
- 旧 builder 的 `domain → concept contains` 关系以带路径 warning 安全折叠到 `concept.domainId`；未知端点仍拒绝。
