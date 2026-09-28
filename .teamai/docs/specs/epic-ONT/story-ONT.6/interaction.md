# ONT.6 交互设计

ONT6-T1 无 UI。P2 后续在发布前把节点契约、语义边和外部输入传入 Validator。合法结果为 `{ valid: true, issues: [] }`；失败 issues 通过 path 定位 contract、node、edge 或 required input，P2 可据此生成 DesignGap。
