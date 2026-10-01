# Design: refactor-agent-core（AG.10-T5）

## D1 拆分映射（行号基于拆分前 1912 行版本）

| 目标文件 | 移入内容（源行） | 预估行数 |
|---------|----------------|---------|
| `core/agent-internals.ts` | `EventEmitter<T>` 类（75–93）、`normalizeStreamProvider`（94–121）、`hashText`（122–133）、`previewText`（134–137）、`previewToolResult`（138–143）、`getMessageText`（144–168）、`getPromptText`（169–184）、`redactErrorForLogging`（185–190）、`logInfo`（191–196）+ 对应 import | ~130 |
| `core/agent-completion.ts` | 常量 `COMPLETION_JUDGE_MAX_ATTEMPTS`（198）/`COMPLETION_JUDGE_TIMEOUT_MS`（199）、`CompletionJudgeFailureCategory`（201–206）、`CompletionJudgeAttemptError`（207–219）、`SyntheticSystemMessage`（220–227）、`SyntheticUserMessage`（228–235）+ 4 个方法体提升为模块级函数：`runJudgePendingCompletion(ctx)`（源 728–911）、`runWithEmptyStopRecovery(ctx, start)`（源 912–952）、`runWithCompletionGuard(ctx, start)`（源 953–1012）、`emitCompletionFailureReport(ctx)`（源 1013–1045）+ 对应 import | ~420 |
| `core/agent-factory.ts` | `SessionData`（1745–1759）、`CreateOriginOSAgentParams`（1761–1816）、`createOriginOSAgent`（1818–1912）+ 对应 import | ~180 |
| `core/agent.ts`（保留） | imports（收敛后）、`AgentCompletionPolicy`/`AgentExecutionOptions`（236–250）、`OriginOSAgent` 类（252–1743：38 字段 + constructor + initialize + 事件路由 + 薄委托 + resetCompletionGuard/throwIfModelStreamFailed + start/handleAgentEvent/applyLoopProtection/prompt/continue + set/get API）+ 3 个新文件的 re-export + 文件头职责注释 | ~1300 |

**职责单句（FR-3，写入各文件顶部注释）：**

- `core/agent-internals.ts`：pi-agent core agent 的模块级内部工具——事件发射器、文本/模型/日志纯函数（internal，不经 index.ts 对外包出）。
- `core/agent-completion.ts`：OriginOSAgent 的 completion 判定与恢复——语义 judge、empty-stop 恢复、guard 循环与失败报告的模块级实现。
- `core/agent-factory.ts`：OriginOS Agent 工厂——`createOriginOSAgent` 模型选择/凭证装配与参数、会话数据类型。
- `core/agent.ts`：OriginOSAgent 主类——状态字段、initialize、事件路由与执行编排，completion 逻辑薄委托。

**有争议项的归属判定（依据三区使用统计，PRE=75–727 / MID=728–1045 / POST=1046–1912）：**

- `COMPLETION_JUDGE_MAX_ATTEMPTS`/`COMPLETION_JUDGE_TIMEOUT_MS`/`CompletionJudgeAttemptError`/`CompletionJudgeFailureCategory`：仅 MID 区消费（PRE/POST=0）→ **随 agent-completion.ts，不放 agent-internals.ts**。
- `SyntheticSystemMessage`：PRE 1 处（applyLoopProtection:1310）+ POST 0 + MID 0 → 类型定义随 agent-completion.ts 导出，agent.ts 导入（MID 的 runWithCompletionGuard 也构造 SyntheticUserMessage）。
- `SyntheticUserMessage`：MID 2 处（924/975）+ POST 1 处（queueFollowUp:1499）→ 随 agent-completion.ts 导出，agent.ts 导入。
- `hashText`/`previewText`/`redactErrorForLogging`/`getMessageText`：三区均有消费 → 定义在 agent-internals.ts 并导出；agent.ts 与 agent-completion.ts 导入。
- `previewToolResult`：PRE+POST 消费、MID 0 → 同上，随 agent-internals.ts（agent.ts 导入）。
- `logInfo`：全仓高频（POST 区 30+ 处）→ agent-internals.ts 导出，agent.ts / agent-completion.ts / agent-factory.ts 三方导入。
- `normalizeStreamProvider`：仅 PRE（initialize:507）→ agent-internals.ts 导出，agent.ts 导入（保持「全部 helper 集中一处」的单一职责边界，避免散落）。
- `buildEmptyStopRecoveryMessage`/`assessCompletion`/`buildCompletionFailureReport`/`buildCompletionRecoveryMessage`/`DEFAULT_COMPLETION_RECOVERY_LIMIT`/`buildCompletionJudgePrompt`/`COMPLETION_JUDGE_SYSTEM_PROMPT`/`parseCompletionJudgeDecision`/`SemanticCompletionDecision`：来自既有兄弟文件（skill-empty-stop-recovery / completion-guard / completion-judge），import 语句随消费方迁至对应新文件，不移动定义。
- `EventEmitter<T>`：定义 75–93，agent.ts 内 `new EventEmitter<AgentEvent>`（256 行）→ agent-internals.ts 导出，agent.ts 导入。

## D2 放置位置：`core/` 平铺同级文件

**决策**：3 个新文件与 `agent.ts` 平铺同放 `packages/core/src/lib/integrations/pi-agent/core/`，不建子目录。

**理由**：core/ 目录现有 8 个文件（agent / completion-guard / completion-judge / health / prompt-boundary / runtime-history / session-store / store 等）+ `__tests__/` + 3 个子目录（system / tools / hooks 已在上级），平铺是该目录既有形态；3 个新文件语义上都是「agent.ts 的组成部分」（internals/factory/completion），文件名前缀 `agent-` 已表达分组；主文件与消费方（`./core/agent` 5 处生产导入、15 处测试 vi.mock/导入、desktop 1 处 side-effect 导入）路径零变化是最高优先级。

**备选被拒**：
- `core/agent/` 子目录：主文件必须迁至 `core/agent/index.ts` 或改 import 形态，全部消费方 import 路径变化（vi.mock 路径锚失效），违反零改动硬约束。
- `core/completion/` 子目录：仅容纳 1 个文件，徒增层级。

**导入形态**：agent.ts → `./agent-internals`、`./agent-completion`、`./agent-factory`（相对同级）；agent-completion.ts → `./agent-internals` + 兄弟既有文件 `./completion-guard`、`./completion-judge`、`./skill-empty-stop-recovery`；agent-factory.ts → `./agent-internals`（logInfo）+ `./skill-empty-stop-recovery` + `../server-config`（相对路径与现 agent.ts 同级形态一致，无加深）。

## D3 变换规则：completion 四方法 ctx 变换（唯一非逐字变换）

**实测 this 依赖全集**（`awk NR 728..1045 | grep -o this\.[a-zA-Z]* | sort -u`，18 个符号）：

| 符号 | judge(728–911) | emptyStop(912–952) | guard(953–1012) | failureReport(1013–1045) | ctx 处理 |
|------|---------------|--------------------|-----------------|--------------------------|---------|
| `pendingCompletionCandidate` | 6（读+清空写） | 4（读+清空写） | — | — | **可变字段 → ctx 字段直接读写**（主类实例属性，ctx 持引用，赋值经 ctx 字段） |
| `pendingPromiseStop` | 3（读+写） | — | 5（读+写） | — | 同上 |
| `deferredAgentEndEvent` | 6（清空写+读消费） | 1（清空写） | — | — | 同上 |
| `agent` | 6（读） | 1 | 2 | 3（读写 `state.messages`） | ctx 字段（只读引用） |
| `hiddenMessages` | 5（WeakSet.add） | 2 | 1 | — | ctx 字段（方法调用，不重赋值） |
| `lastToolFailure` | 5（读+写） | 2（读+写） | 2（写） | 4（读） | 可变字段 → ctx 字段直接读写 |
| `eventEmitter` | 1（emit） | — | — | 1（emit） | ctx 字段 |
| `activeUserRequest` | 1（读） | — | — | — | ctx 字段（只读） |
| `completionToolTrace` | 1（读） | — | — | — | ctx 字段（只读） |
| `successfulToolAfterFailure` | 1（读） | — | — | — | ctx 字段（只读） |
| `throwIfModelStreamFailed` | 4（调用） | 2 | 2 | — | **方法 → ctx 回调**（主类提供箭头包装） |
| `emitCompletionFailureReport` | — | 2 | 2 | — | **方法 → ctx 回调**（指向 agent-completion 模块函数的实例闭包） |
| `judgePendingCompletion` | — | — | 2 | — | 同上（实例闭包） |
| `emitUiEvent` | 1 | — | — | — | **方法 → ctx 回调** |
| `getVisibleMessages` | — | — | — | 1 | **方法 → ctx 回调** |
| `handleAgentEvent` | — | — | — | 1 | **方法 → ctx 回调** |
| `isEmptyStopRecoveryEnabled` | — | 1 | — | — | **方法 → ctx 回调** |
| `isCompletionGuardEnabled` | — | — | 1 | — | **方法 → ctx 回调** |

**ctx 接口（`AgentCompletionContext`，定义于 agent-completion.ts，internal）**：

```typescript
interface AgentCompletionContext {
	// 可变状态字段（直接读写实例属性）
	pendingCompletionCandidate: OriginOSAgent["pendingCompletionCandidate 语义类型"]; // 主类私有字段类型，经结构化类型声明
	pendingPromiseStop: boolean;
	deferredAgentEndEvent: AgentEvent | null;
	lastToolFailure: ToolFailureSummary | null;
	hiddenMessages: WeakSet<object>;
	// 只读引用
	agent: { state: OriginOSAgent["agent"] extends null ? never : NonNullable<OriginOSAgent["agent"]>["state"] } | null; // 以实际类型为准，实现时从主类字段类型推导
	eventEmitter: EventEmitter<AgentEvent>;
	activeUserRequest: string;
	completionToolTrace: string[];
	successfulToolAfterFailure: boolean;
	// 主类方法回调（保持行为：调用点逐字，仅 this.X() → ctx.X()）
	throwIfModelStreamFailed: () => void;
	emitUiEvent: (event: AgentEvent) => void;
	getVisibleMessages: () => AgentMessage[];
	handleAgentEvent: (event: AgentEvent) => void;
	isEmptyStopRecoveryEnabled: () => boolean;
	isCompletionGuardEnabled: () => boolean;
	emitCompletionFailureReport: () => void;
	judgePendingCompletion: () => Promise<void>;
}
```

**实现要点（实现时以逐字等价为准，接口字段名可微调）：**

1. 主类新增私有方法 `createCompletionCtx(): AgentCompletionContext`，一次性组装全部 ctx 字段与回调。**关键约束**：`pendingCompletionCandidate` / `pendingPromiseStop` / `deferredAgentEndEvent` / `lastToolFailure` 这 4 个可变字段 ctx 持有主类实例属性引用——TS 对象属性按引用共享（无 getter 需求，与 T3 的 `bumpContinuationGeneration` 访问器模式不同：T3 那两处是「整体替换引用」字段，本任务 4 个字段均为「原地读写」，属性引用共享即语义等价）。
2. `emitCompletionFailureReport` / `judgePendingCompletion` 的 ctx 回调：`emitCompletionFailureReport: () => emitCompletionFailureReport(this.createCompletionCtx())` 形式的实例闭包在主类定义（指向模块级函数，避免递归 ctx 组装）；`judgePendingCompletion` 回调同理指向主类薄委托方法。
3. 4 个模块级函数签名：`runJudgePendingCompletion(ctx: AgentCompletionContext): Promise<void>`；`runWithEmptyStopRecovery(ctx: AgentCompletionContext, start: () => Promise<void>): Promise<void>`；`runWithCompletionGuard(ctx: AgentCompletionContext, start: () => Promise<void>): Promise<void>`；`emitCompletionFailureReport(ctx: AgentCompletionContext): void`。
4. **变换仅限**：`this.X` → `ctx.X`（字段与回调统一）；方法声明行→模块函数声明行；**函数体逐字**（含错误消息、日志格式、`AbortSignal.timeout`、事件对象、`as unknown as` 断言）。
5. **主类薄委托**（可见性不变，签名不变）：
   - `protected async judgePendingCompletion(): Promise<void> { return runJudgePendingCompletion(this.createCompletionCtx()); }` —— `vi.spyOn(agent as any, "judgePendingCompletion")`（agent.test.ts:181 spy 锚）与 5 处 `(agent as any).judgePendingCompletion()` 直调不受影响（方法在原型上，spy/direct-call 都命中薄委托 → ctx → 模块函数）。
   - `private async runWithEmptyStopRecovery(start: () => Promise<void>): Promise<void> { return runWithEmptyStopRecovery(this.createCompletionCtx(), start); }`
   - `private async runWithCompletionGuard(start: () => Promise<void>): Promise<void> { return runWithCompletionGuard(this.createCompletionCtx(), start); }`
   - `private emitCompletionFailureReport(): void { return emitCompletionFailureReport(this.createCompletionCtx()); }` —— agent.test.ts:710 `(agent as any).emitCompletionFailureReport()` 直调锚不受影响。
6. `SyntheticSystemMessage`/`SyntheticUserMessage` 类型从 agent.ts 移出后，主类 `applyLoopProtection`（1310）与 `queueFollowUp`（1499）的引用改为从 `./agent-completion` 导入；MID 区构造点（924/975）在模块函数内直接可用。

**保持不变的行为要点（subagent 验收时逐条对照）：**

- judge 循环语义：`COMPLETION_JUDGE_MAX_ATTEMPTS=2` 重试、`COMPLETION_JUDGE_TIMEOUT_MS=15_000` AbortSignal、`piAi.completeSimple` 请求构造（systemPrompt/messages/baseOptions/bearer-oauth 分支的 judgeModel spread）、`parseCompletionJudgeDecision` 解析、fallback `assessCompletion`、`pendingPromiseStop = decision.status === "incomplete"` 赋值、`completion_accepted` 事件 emit、deferred agent_end 消费（读→清空→`emitUiEvent`）——逐字。
- guard 恢复循环：`DEFAULT_COMPLETION_RECOVERY_LIMIT` 上限、`buildCompletionRecoveryMessage("", lastToolFailure, attempt)` 参数序、`hiddenMessages.add` 顺序、`agent-recovery` 失败分支赋值与提前 return——逐字。
- empty-stop 恢复：`buildEmptyStopRecoveryMessage(1)`、`attempt=1/1` 日志、recovery 二次为空的 `empty-stop-recovery` 失败赋值——逐字。
- 失败报告：`buildCompletionFailureReport`、合成 assistant 消息（`completionFailure: true`）、4 事件数组 `message_start/message_end/turn_end/agent_end`、`handleAgentEvent` + `eventEmitter.emit` 双发顺序、console.error 格式——逐字。
- `throwIfModelStreamFailed` 保留主类（lastModelError 主类私有字段，不外移）。

## D4 循环依赖预防

依赖方向单向：`agent.ts` → `agent-completion.ts` / `agent-factory.ts` / `agent-internals.ts`；`agent-completion.ts` → `agent-internals.ts` + 既有兄弟文件（completion-guard / completion-judge / skill-empty-stop-recovery）；`agent-factory.ts` → `agent-internals.ts` + `../server-config` + `./skill-empty-stop-recovery` + `../types`（类型）。**agent-factory.ts 与 agent-completion.ts 互不导入**；agent.ts 对 3 个新文件的 re-export 仅为公共符号（`SessionData`/`CreateOriginOSAgentParams`/`createOriginOSAgent`），不回流。移动完成后 `npx madge --circular packages/core/src --extensions ts,tsx` 验证 ≤ 基线 12，且 `core/` 新增 3 文件无环。

**实施修订（实测后落地为传参注入，非原案 type-only 反向引用）：** `agent-factory.ts` 对 `agent.ts` 的任何 import（含 `import type`）都会被 madge 8 计为依赖边（其 TypeScript 解析不跳过 type-only import），实测形成第 13 条环，触碰 TC-4 ≤ 12 硬门禁。最终方案：`createOriginOSAgent` 改为泛型签名 `<T>(params: CreateOriginOSAgentParams, ctor: new (config: OriginOSAgentConfig, healthMonitor?: HealthMonitor) => T): T`，构造器由调用方注入；agent.ts 尾部提供同名薄包装 `export function createOriginOSAgent(params) { return createOriginOSAgentBase(params, OriginOSAgent); }` 并 re-export `CreateOriginOSAgentParams`/`SessionData` 类型——对全部消费方（`./core/agent` 导入、vi.mock 锚、desktop side-effect 导入）符号与路径零变化。factory 对 agent.ts 零 import（含 type-only），madge 全仓环数回到基线 12。

## D5 实施边界（subagent work packages）

单一写入范围（`packages/core/src/lib/integrations/pi-agent/core/` 下 agent.ts + 3 个新文件），设置 1 个 subagent Task worktree 串行实施：

- **WP-1（唯一实施包）**：按 D1 清单移动（internals 逐字 / factory 逐字 / completion ctx 变换）+ 主类收敛 + re-export；写入范围 `core/agent.ts` + `core/agent-internals.ts` + `core/agent-completion.ts` + `core/agent-factory.ts`（后三新建）。验收命令：TC-1 符号 diff、TC-2 双端 build、TC-3 测试基线、TC-4 madge、TC-6 行数。

## D6 风险

| 风险 | 缓解 |
|------|------|
| ctx 变换遗漏 `this.` → 编译失败或引用错对象 | TC-2 tsc 全量 + TC-3 88 用例 agent.test（含 judge spy / 直调 / 事件序断言）兜底；TC-1 token 级对比 |
| ctx 变换后可变字段写回丢失（ctx 对象快照不回写主类） | 4 个可变字段（pendingCompletionCandidate/pendingPromiseStop/deferredAgentEndEvent/lastToolFailure）ctx 侧以 **getter/setter 闭包绑定 `self = this`（主类实例）** 实现——模块函数内赋值经 setter 直写主类字段（实测初版「对象属性快照」曾致 judge 写回丢失、3 个用例新增失败，改闭包后失败集回到基线） |
| 薄委托后 `vi.spyOn(agent, "judgePendingCompletion")` 失效 | spy 命中主类原型方法（薄委托），模块函数经 ctx 回调调用委托链路不变；agent.test.ts:181 spy 断言 `toHaveBeenCalledTimes(1)` 直接验证 |
| `Synthetic*Message` 类型外移后主类 2 处构造点缺 import | TC-2 tsc 编译兜底（1310/1499 两处显式核对） |
| agent-factory type-only 反向 import 成环 | D4 预案：madge 实测；type-only 擦除后无运行时环，必要时改传参注入；TC-4 环数 ≤ 12 硬门禁 |
| re-export 遗漏符号 → 消费方编译失败 | TC-1 符号清单 diff 为空（6 公共符号）+ store.test 5 处 vi.mock 锚 + desktop side-effect 导入兜底 |
| judge 时序语义（deferred agent_end 消费）偏差 | TC-3 agent.test 事件序断言（`receivedEvents` 序列）+ token 级对比 |
| 移动时顺手改逻辑 | subagent 指令「逐字移动 + 仅 this→ctx」；验收用 token 级对比（canon: `this.`→`ctx.`）+ 测试基线兜底 |
| 新文件超 600 行 | D1 预估最大 agent-completion ~420；TC-6 wc -l 验证 |

## D7 偏差记录（initialize 不外移）

Story architecture.md T5 方案列「拆出：模型装配、流式事件处理、completion guard」三项。本 Proposal 实际拆出两项 + 部分：

- **模型装配** → `agent-factory.ts`（C2，完整）✅
- **completion guard** → `agent-completion.ts`（C3，完整：judge + guard + empty-stop + failure report）✅
- **流式事件处理** → **不外移**（偏差）：`initialize`（341–601，262 行）的 streamFn 包装/凭证装配与 14 个 this 字段（config×11、agent×4、turnContextCache×3、sessionContext、healthMonitor、lastModelError 等）深度交织，事件路由 `routeAgentEvent`/`handleAgentEvent` 直写 `state.uiState`/`completionToolTrace`/`pendingCompletionCandidate` 等主类状态。外移需大幅 ctx 改写（T3 模式的访问器化），改写面 > 移动收益，且 88 用例中事件路由断言密集。主类因此收敛到 ~1300 行（> FR-4 编排类 1200 目标，< 1600 备用上限）——记为已知偏差，由 T6/T7 之后如再有治理需求另行立项。

主类留存的「流式事件处理」仅为事件路由直写主类状态的部分；judge/guard 侧的事件消费已全部外移。
