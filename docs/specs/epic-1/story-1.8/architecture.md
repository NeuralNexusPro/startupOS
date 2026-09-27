# Story 1.8 架构

详细决策、数据结构、API、恢复和替代方案见 [OpenSpec Design](../../../../openspec/changes/author-interview-behavior-contracts/design.md)。

```text
Web / Desktop 传输边界
  → core project / agent 访谈编排
    → core ontology 公共 authoring / validator
      → 文件存储
权威快照 → 纯投影 → Zustand / React UI
```

ontology 拥有 canonical 唯一写入权；project 拥有访谈未确认草稿；记忆只是可重建投影。公共 DTO 经 Web API/Desktop IPC 传递，route 与主进程不复制规则。core 不依赖 Web/Desktop；下层 integrations 通过注入接收业务上下文。

使用现有 TypeScript、React、Tailwind/shadcn、Zustand 和 JSON/JSONL；无新第三方依赖。跨 feature 只走公共入口，浏览器从纯类型/投影入口引用，禁止服务端 Node 模块进入客户端包。

性能、安全、并发、迁移与回滚约束按 Design；Story 验收必须检查无静默 legacy 写入及无未经确认的旧数据重分类。
