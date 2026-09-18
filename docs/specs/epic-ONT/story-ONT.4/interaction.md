# ONT.4 交互设计

ONT4-T1 无 UI。调用方先校验 ontology，再用明确的 ontology/version/action/concept/state/permissions 请求 Action Gate。合法请求返回 `{ valid: true, issues: [] }`；业务拒绝返回结构化 issues，不通过异常或模糊文本控制流程。
