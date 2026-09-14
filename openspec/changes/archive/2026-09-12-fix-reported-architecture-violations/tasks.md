## 1. AG2-T1-P0 提案与基线（串行）

负责：父代理。依赖：AG5-T1；写入：本Proposal及AG.2文档。必需检查：strict validation、文档与基线一致性审查；证据：验证输出和批准记录。

- [x] 1.1 更新AG.2六份文档及34处基线引用，完成设计/specs/tasks审查与strict validation。
- [x] 1.2 记录用户显式批准，在最新Proposal提交创建独立Task工作树；批准前不得实施。

## 2. AG2-T1-P1 通用聊天UI（可与P2并行）

负责：UI subagent。依赖：P0；写入：web/src/components内ToolExecutionFrame、直接调用方及对应组件测试，禁止修改Core或非组件启动入口。必需测试：TC09及受影响文件lint/typecheck；证据：Task提交、调用方清单、测试输出。

- [x] 2.1 将ToolExecutionFrame移至ui/chat并更新所有直接调用方，保持props和展示。
- [x] 2.2 验证工具状态、空列表和已有状态、名称与运行提示展示，提交Task分支并交付证据。

## 3. AG2-T1-P2 Core依赖修复（与P1并行，内部串行）

负责：Core运行时subagent。依赖：P0；写入：core源码/测试/导出、desktop主进程及worker和打包脚本、web非components启动适配；必要的agent/service调用方。禁止修改P1组件范围、检查器及规则。必需测试：TC04–08、TC10及相关类型检查；证据：迁移映射、启动调用链、Task提交、测试日志。

- [x] 3.1 下沉真实公共DTO、权限常量、记忆解析和配置存储，更新合法的向下导出与调用方。
- [x] 3.2 将记忆/认知业务组装上移，经最小依赖入口提供给Agent与session运行时；验证owner隔离、恢复及缺依赖失败。
- [x] 3.3 将业务工具组装上移，接通完整启动链，更新runtimeImport、导出和打包路径，验证重复注册、scope及授权。
- [x] 3.4 跑对应回归并提交Task；若需修改组件调用方，先报告，待P1集成后按串行方式处理，不重叠写入。

P2 内部进一步隔离纯契约下沉工作包，由 Core subagent 创建 contracts Task worktree：只负责 Electron IPC/用户注册 DTO、EntryType/权限常量、记忆 Markdown 解析与配置存储及其直接调用方。Core 主工作包保留 memory ownership/认知类型、运行时与业务工具，两者写入范围不重叠，contracts 合回 Core 后再整体集成。

## 4. AG2-T1-P3 集成与验证（串行）

负责：父代理集成；缺陷由对应subagent在Task中修复。依赖：P1/P2；写入：Proposal集成冲突、文档和证据。必需测试：TC01–10、strict validation；证据：完整日志和Story验证goal。

- [x] 4.1 合并Task提交，审查新增依赖链及实际源码归属；记录34处逐条修复映射。
- [x] 4.2 创建目标为“通过Story AG.2 AG2-T1中定义的测试case”的自动化验证goal，执行TC01–10；无法自动化项明确原因、人工步骤和风险。
- [x] 4.3 完成原边界检查、自测、pnpm lint、相关构建和回归、strict validation；更新implementation/testing和变更记录，未通过不勾选完成。

## 5. AG2-T1-P4 交付（串行）

负责：父代理。依赖：P3全部必需验证通过；写入：集成分支、dev和文档归档。必需检查：合并后状态与产物路径；证据：提交ID、goal完成输出和清理结果。

- [x] 5.1 合并Proposal到dev，记录可本地测试的构建产物、验证范围和剩余风险。
- [x] 5.2 按OpenSpec工作流同步spec、归档完成提案，更新Story状态与归档链接；清理已合并Task/Proposal工作树和分支。

## 6. AG2-T1-P5 用户追加通知回归（交付前完成）

负责：通知subagent，独立notification工作树；依赖：P0，和P2可并行；写入：channel-runtime/validation.ts、对应Core及Desktop流测试。必需验证：TC11先红后绿、既有渠道回归、规定lint/边界/自测；证据：提交与测试日志。来源为用户本轮追加的通知报错，纳入现有会话入口兼容性验收。

- [x] 6.1 修复中文技能/角色目录标识验证，保留传输与路径安全校验，完成TC11并合入Proposal。
