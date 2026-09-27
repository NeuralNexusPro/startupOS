# 可发布 SOP 契约样本

这是 project-1 / orders-solution / v1.0 的完整黄金样本。manifest.json、agents.json、skills.json 保存到 projects/project-1/solutions/v1.0/；ontology.json 是对应 canonical ontology。SKILL.example.txt 是 project-skill-creator 的创建结果，contract 以单行 JSON 保存。

顺序：prepare Agent 消费显式 external input order-raw，产生 order-ready，经同 FactType 边传给 publisher Skill。所有 ID、版本、权限和 verifier 必须来自目标项目；样本不能作为自动填充默认值。

回归测试 sop-contract-authoring.integration.test.ts 实际读取本目录 JSON、通过真实技能加载器读取复制为 SKILL.md 的样本，再调用 ProjectSolutionDesignSource 和 SolutionExecutionContractPublishingService.publish。缺引用、旧格式、断流、版本不一致及依赖环必须拒绝且不落已发布契约。
