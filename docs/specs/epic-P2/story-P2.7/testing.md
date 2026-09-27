# P2.7 实施与验收证据（2026-09-27）

状态：Task 实施完成，等待父 Proposal 串行集成与 P2.6 回归。未进行应用打包或人工桌面验收。

## 功能映射

- AC1/AC2：`solution-topology.ts` 生成独立角色/技能节点与调用、输出、协作边；共享技能在团队兼容视图合并，工作流兼容视图按角色展开调用。显式 topologyViews 按所选视图的节点和边渲染。dagre 以边布局而非数组排列；边标签可见。
- AC3：`SolutionDesign.tsx` 两个图谱入口保留 manifest.topologyViews 与原始能力 contract，图谱包含工作流/团队切换，不写入或修改发布状态。
- AC4：缓存两种图的投影与布局。50 个角色共享技能的真实渲染/切换在 Vitest jsdom 中校验 < 5 秒；提供缩放、过渡与 reduced-motion 支持。真实机器动画流畅度未人工验证。
- AC5：节点可键盘聚焦并点击；契约详情按输入/输出、完整本体版本引用、Action、权限分组，原始引用可展开；不完整草稿契约给出提示而不崩溃。
- AC6：旧 manifest 兼容展示，明确不是已发布契约；缺失引用、重复 ID、坏节点类型及坏拓扑结构可见，不静默删除问题。
- AC7：图谱只读，不复制 ONT 的语义校验。DAG/FactType 连通性及发布门控继续由 P2.6/P2.8 的公共业务边界负责，串行集成时回归。

## 用例

`TopologyGraph.test.tsx`：键盘切换、共享节点及完整契约、显式工作流、孤立技能、缺失引用、旧字段详情、50 角色性能、跨类型同名 ID、重复节点、坏拓扑、code-only 去重、dagre 拓扑顺序、不完整草稿。

`SolutionDesign.test.tsx`：使用真实图组件，从实际 getSolution 归一化入口加载显式拓扑与 canonical contract，并切换团队视图，验证发布状态未改变。

联合回归还包含 `SolutionDesignPublishing.integration.test.tsx`、`SolutionContractPublishingAcceptance.test.tsx`。

## 边界

不修改 core/types、模板、API 或运行时。规范语义仍由 canonical validator 决定；展示层只做避免草稿崩溃所需的 shape 检查。该工作不代表构建发布已完成。

## 执行结果

- 2026-09-27：上述 4 个测试文件共 17 个用例通过。
- lint：0 errors（存量 warning 仍保留）；架构扫描 945 文件 0 诊断；自测 43 用例 × 2 CWD 通过。
- worktree Web tsc 被依赖链接同时解析主仓库/worktree 的私有类型与全局声明阻断；新增图谱文件无诊断。完整输出 `/tmp/p27-types-final.log`，需主仓集成后重新跑类型检查，不代表全仓基线错误。
- 未打包、未运行发布、未修改发布状态或运行数据。

## 主仓集成验收

2026-09-27：Task → Proposal → 本地 `0.4.x` 串行集成；4 文件、17 测试通过。主仓 Web 严格全量类型检查通过，P2.6 的 7 处严格类型问题已修正。Core 全量类型检查通过。最终 lint、架构扫描、自测与 OpenSpec strict 校验通过。

本轮未进行打包、远端推送或人工桌面体验验收；原有 standalone 打包修复现场保持不变。
