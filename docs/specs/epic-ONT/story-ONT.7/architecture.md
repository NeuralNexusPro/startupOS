# ONT.7 架构

## 模块落点

```text
packages/core/src/lib/features/ontology/
├── types.ts                         # 公共 request/result DTO
├── canonical-ontology-store.ts      # 复用既有 projection/fact JSONL 原语，不修改
├── ontology-osdk.ts                 # append/query/resolver 公共实现
├── index.ts                         # 复用既有星号导出，不修改
└── __tests__/ontology-osdk.test.ts  # OSDK 回归
```

## 数据所有权

- ontology/facts：ONT 所有。
- contract：P2 已发布契约所有。
- run/work item/attempt：collaboration-runtime 所有。
- snapshot/projection：可重建引用视图，不拥有上述事实。

## ONT7-T2 公共接口

```ts
interface CanonicalContextProjectionAppendRequest {
  projectId: string;
  projection: CanonicalContextProjectionRecord;
}

interface CanonicalContextProjectionQuery {
  projectId: string;
  contextInstanceId: string;
  attemptId: string;
  kind?: CanonicalContextProjectionKind;
  revision?: number;
}

type CanonicalContextProjectionAppendResult =
  | { ok: true; projection: CanonicalContextProjectionRecord }
  | { ok: false; issues: CanonicalValidationIssue[] };

type CanonicalContextProjectionQueryResult =
  | { ok: true; projections: CanonicalContextProjectionRecord[] }
  | { ok: false; issues: CanonicalValidationIssue[] };

interface CanonicalResolvedContextProjection {
  projection: CanonicalContextProjectionRecord;
  facts: CanonicalFactRecord[];
}

type CanonicalContextProjectionResolveResult =
  | { ok: true; projections: CanonicalResolvedContextProjection[] }
  | { ok: false; issues: CanonicalValidationIssue[] };
```

`CanonicalOntologyOSDK` 增加三个方法：

- `appendContextProjection(request)`
- `queryContextProjections(query)`
- `resolveContextProjections(query)`

不新增 service、interface 或 factory。

## 数据流与不变量

```text
runtime --已校验活跃 attempt/lease--> appendContextProjection
  --> 校验当前 canonical ontology 与完整引用
  --> 同 OSDK 实例内串行查重
  --> CanonicalOntologyStore.appendProjection

consumer --> queryContextProjections --> readProjections --> 精确过滤
         --> resolveContextProjections --> query + 单次 readFacts --> 完整 fact ref 等值匹配
```

- append 要求 `request.projectId === projection.context.projectId`，context ontology 必须是项目当前 ontology；fact/decision ref 必须与 context ontology 完整一致，fact ref 还必须精确存在于 `facts.jsonl`。decision/source 无权威仓库，只校验 decision 的 ontology/version 绑定，不校验存在性。
- projection `id` 在单个 project 内唯一。规范化复用现有 `stableValue`：Date 转 ISO、对象键排序、忽略值为 `undefined` 的对象字段、数组保持顺序，并比较包括 `createdAt` 在内的完整记录。同 id 同记录返回既有记录；同 id 不同记录返回 `PROJECTION_CONFLICT`。
- query 必填 project/context/attempt，`kind` 和 `revision` 仅做精确匹配；历史读取不绑定当前 ontology。
- resolver 一次读取 facts，并按每条 projection 的 `factRefs` 顺序完整等值匹配；append 拒绝重复 fact ref。缺失引用一次聚合为 issues。resolver 不解释 decision/source、不生成替代值、不回写任何记录，也不代表允许运行时恢复。
- context/attempt ID 是非空不透明过滤键；ONT 不判断当前 attempt，也不推断跨记录 context identity。project 路径格式继续由 store 的既有 `TypeError` 前置条件保护，OSDK 的结构化 project 错误只表示 request/context/ontology 不一致。
- 错误码：`ONTOLOGY_NOT_FOUND`、`PROJECT_ID_MISMATCH`、`ONTOLOGY_ID_MISMATCH`、`ONTOLOGY_VERSION_MISMATCH`、`INVALID_CONTEXT_IDENTITY`、`INVALID_REVISION`、`REFERENCE_VERSION_MISMATCH`、`REFERENCE_NOT_FOUND`、`DUPLICATE_REFERENCE`、`PROJECTION_CONFLICT`。

## 依赖

新增 DTO 和实现只复用同一 ontology feature 的既有类型、validator、OSDK 与 JSONL store。不得导入 Web、Desktop、collaboration-runtime、memory-core 或其他 feature 私有实现，符合 AGENTS.md 单向依赖规则。

## 恢复边界

checkpoint reference 只定位 cursor/revision/attempt/lease epoch。ONT 无法判断活跃 attempt 或 lease 新鲜度；runtime 必须在 append 前完成 checkpoint context/attempt/revision/leaseEpoch 门控。query/resolver 只读历史记录，本 Task 不声称实现恢复。

## 兼容与并发

- DTO 和 OSDK 方法均为加法兼容；旧 DTO、低层 store API 和 JSONL 数据形状不变。
- 在 OSDK 增加独立 projection tail，包住完整 read/dedupe/append 事务；store 的单次文件操作队列不足以保证该组合原子。MVP 不承诺跨进程原子唯一。
- 若未来确认存在多个写进程，再以 operation receipt 或文件锁升级，不在本 Story 预建协调层。
