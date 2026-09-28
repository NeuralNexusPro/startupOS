# 需求文档 - Story C.3

**Story:** 知识来源 Ingest
**Epic:** Epic C
**最后更新:** 2026-07-20

## 目标

实现知识摄入管道，从用户上传的文件和外部信息中提取知识并写入知识库。

## 设计要点

- 监听 Agent 消息中的文件上传事件
- 自动将上传文件复制到 `knowledge/sources/uploaded/`
- LLM 分析文件内容 → 提取实体、概念、关系 → 写入知识库
- 支持外部信息摘要（URL fetch、搜索结果）写入 `knowledge/sources/external/`
- business-model.json 作为知识源，启动时自动载入
- 参考 LLM Wiki 的 ingest 模式：读源 → 提取 → 更新 wiki → 更新 index → 追加 log

## 验收标准

- [ ] 文件上传自动触发 ingest
- [ ] 源文件不可变（只读）
- [ ] 从文件内容中提取的知识写入正确的 wiki 页面
- [ ] index.md 和 log.md 自动更新
