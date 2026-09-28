# Epic DCO: 数据管理与内容运营

**Epic 编号:** DCO  
**Epic 名称:** Data & Content Operations  
**优先级:** 🔴 Critical  
**状态:** 📋 Planning  
**创建日期:** 2026-07-27  
**范围:** Alpha 阶段客户端数据上报与应用市场消费体验

---

## 📋 概述

OriginOS 当前已经具备 Skill、Agent、RoleAgent 的本地运行、导出和更新基础，但缺少隐私可控的产品事件上报和远程应用消费能力。首页“技能市场”仍是技能入口配置，不具备完整的目录浏览、可信下载、安装和升级能力。

本 Epic 建立两条相互关联的产品能力：

1. **数据上报**：以隐私优先的匿名事件模型采集客户端事件，提供同意管理、离线队列、批量上报和删除请求。
2. **应用市场消费**：提供应用目录、详情、可信下载、安装、升级、卸载和回滚，让用户可以直接下载安装市场应用。

DAU 聚合、运营看板、应用目录管理、审核发布和资源存储不属于本 Epic 的实施范围。OriginOS 仅依赖外部服务提供的版本化公共 API，不在 `startupOS` 内复制这些服务端能力，也不绑定其内部数据库或资源存储供应商。

Alpha 阶段不追求完整商业化平台，优先保证上报可靠、应用可安装、供应链可验证、失败可回滚。

---

## 🎯 Epic 目标

### 数据管理

1. 建立统一事件协议、匿名安装标识、用户同意和采集开关。
2. 支持事件白名单、幂等批次、离线重试、退避、队列上限和删除请求。
3. 上报服务端计算 DAU 所需的最小版本、平台、架构和渠道维度。
4. 确保关闭采集后停止网络上报，并允许清除本地待上报数据。
5. 确保不采集用户对话、提示词、文件内容、文件名、API Key 或本地业务数据。

### 应用市场

1. 实现 Skill、Agent、RoleAgent 市场包与清单协议的客户端解析和校验。
2. 支持市场目录浏览、搜索、分类、详情和版本兼容提示。
3. 支持用户在客户端直接下载、校验并安装市场应用。
4. 支持已安装应用的升级、卸载、冲突处理和失败回滚。
5. 支持发布者签名、包哈希、兼容性判断和异常安装上报。

---

## 👥 目标用户

| 用户 | 核心诉求 |
|------|---------|
| OriginOS 用户 | 发现可信应用，一键安装并在桌面直接使用 |
| 隐私敏感用户 | 明确控制是否上报匿名产品事件，并可删除本地队列 |
| 安全与发布负责人 | 验证包来源、校验结果、安装失败和撤回响应 |

---

## 📊 核心指标口径

### DAU

**定义：** 在 `Asia/Shanghai` 自然日内至少产生一次合格活跃事件的去重匿名安装实例数。

**合格活跃事件：**

- 客户端启动并进入可交互状态。
- 用户主动打开一个应用、Skill、Agent、RoleAgent 或项目。
- 用户主动发起一次会话消息。

自动更新检查、后台定时任务、重试请求、崩溃恢复探测和纯后台心跳不单独计入 DAU。

**去重键：** `anonymous_installation_id + metric_date`。匿名安装标识首次启动生成并本地保存，不使用设备序列号、用户名、邮箱、IP 哈希或硬件指纹。

**首批维度：**

- 客户端版本
- 操作系统与架构
- 发布渠道
- 国家/地区粗粒度信息（仅在合法合规且用户同意时）
- 新安装 / 已有安装

### 市场上报事件

- 市场访问 UV
- 应用详情查看 UV
- 下载开始 / 下载成功
- 安装成功 / 安装失败
- 升级成功 / 回滚
- 应用维度安装量和活跃安装数
- 浏览 → 下载 → 安装 → 首次打开转化率

指标不包含应用内用户内容，也不得通过自由文本事件属性绕过白名单。

---

## 📦 应用市场范围

### 支持的应用类型

| 类型 | 安装目录 | 核心入口文件 |
|------|---------|-------------|
| Skill | `data/skills/{id}/` | `SKILL.md` |
| Agent | `data/agents/{id}/` | `Agent.md` |
| RoleAgent | `data/agents/{id}/` | `Agent.md` + `Role.md` |

系统内置应用仍由安装包管理，市场安装项属于用户内容，不覆盖系统模板目录。

### 市场包

市场包采用 ZIP，根目录必须包含受控清单：

```json
{
  "schemaVersion": "originos.app/v1",
  "id": "candidate-evaluator",
  "type": "skill",
  "name": "候选人评估",
  "version": "1.2.0",
  "publisher": "publisher-id",
  "minimumOriginOSVersion": "0.1.43",
  "entry": "SKILL.md",
  "sha256": "package-sha256",
  "signature": "publisher-signature"
}
```

Alpha 阶段市场包不得包含原生可执行文件、安装脚本或绕过 OriginOS 工具权限的任意代码。ZIP 解压必须防止路径穿越、符号链接逃逸、压缩炸弹和超限文件。

### 安装事务

```text
选择安装
  → 下载到 data/tmp/marketplace/
  → 校验大小、SHA-256、签名、清单和客户端版本
  → 扫描 ZIP 路径与文件类型
  → 解压到 staging 目录
  → 检查 ID 冲突和升级策略
  → 原子替换目标目录
  → 刷新 Skill / Agent 索引
  → 首次打开或返回市场详情
```

失败时必须保留原版本并清理临时目录。升级前创建可回滚快照，卸载默认保留用户产物与记忆，除非用户明确选择彻底删除。

---

## 🏗️ 架构边界

### 本仓职责

| 范围 | `startupOS` 职责 |
|------|------------------|
| 数据采集 | 用户同意、匿名安装 ID、事件白名单、本地离线队列、批量上报、删除请求 |
| 市场消费 | 公共目录 API 适配、目录与详情 UI、兼容性提示、下载状态 |
| 本地安装 | 哈希与签名校验、ZIP 安全检查、原子安装、索引刷新、升级、卸载与回滚 |
| 可观测性 | 结构化记录上报与安装结果，不记录用户内容、令牌或文件名 |

### 外部依赖

本 Epic 依赖一个符合版本化契约的 OriginOS 公共服务，提供安装实例注册、事件接收、市场目录和资源包解析接口。服务端如何聚合 DAU、建设运营后台、审核应用、存储元数据或保存资源包，均不属于本仓 Story，也不得成为客户端实现的隐式依赖。

### startupOS 规划模块

| 层级 | 规划职责 |
|------|----------|
| `packages/core/src/modules/product-analytics/` | 客户端事件类型、属性白名单、匿名标识契约和批处理纯逻辑 |
| `packages/core/src/modules/app-marketplace/` | 市场 API 契约、版本兼容、安装计划和校验结果领域模型 |
| `packages/desktop/src/main/services/` | 上报队列调度、下载安装、签名校验、ZIP 安全检查、原子安装、回滚和卸载 |
| `packages/web/src/components/marketplace/` | 市场目录、搜索、详情、安装状态和已安装应用 UI |
| `packages/web/src/services/` | OriginOS 服务端 API 适配，不承载服务端聚合或运营逻辑 |

### 数据边界

- OriginOS 客户端本地仅持久化匿名安装标识、待上报事件队列和上报游标，继续遵守 `startupOS` 的文件存储规约。
- 客户端不得引入数据库保存运营数据，不得访问外部服务的内部数据库或对象存储。
- 客户端只消费 HTTPS API 返回的版本化 DTO 和受信资源 URL。
- 服务端数据保留、聚合和存储策略不进入客户端实现。

### 依赖方向

```text
OriginOS Marketplace UI
  → Electron preload IPC
  → Desktop main install service
  → OriginOS public API /api/originos/v1/market/*
  → Core package validation
  → data/skills 或 data/agents

OriginOS Analytics Queue
  → Desktop main HTTPS client
  → OriginOS public API /api/originos/v1/analytics/events
```

不允许 core 反向依赖 Web 或 Electron；不允许渲染进程直接写安装目录；不允许 OriginOS 客户端持有运营管理凭据、存储供应商凭据或访问服务端内部存储。

---

## 📝 Stories 列表

| Story | 标题 | 交付仓库 | 优先级 | 阶段 | 状态 |
|-------|------|----------|--------|------|------|
| **DCO.1** | 匿名数据协议、采集同意与本地事件队列 | `startupOS` | 🔴 Critical | Phase 1 | 📋 Planning |
| **DCO.2** | 匿名安装注册、批量上报与失败恢复 | `startupOS` | 🔴 Critical | Phase 1 | 📋 Planning |
| **DCO.3** | 市场应用包协议解析与客户端安全校验 | `startupOS` | 🔴 Critical | Phase 1 | 📋 Planning |
| **DCO.4** | 应用市场目录、搜索、分类与详情 | `startupOS` | 🟠 High | Phase 2 | 📋 Planning |
| **DCO.5** | 客户端安全下载与原子安装 | `startupOS` | 🔴 Critical | Phase 2 | 📋 Planning |
| **DCO.6** | 应用升级、卸载、冲突处理与回滚 | `startupOS` | 🟠 High | Phase 3 | 📋 Planning |
| **DCO.7** | 客户端数据质量、供应链安全与可观测性 | `startupOS` | 🟠 High | Phase 4 | 📋 Planning |

---

## 🗺️ 实施顺序

### Phase 1：协议与可信基础

- DCO.1 定义数据采集、隐私和离线队列。
- DCO.2 完成注册、批量上报、幂等和失败恢复。
- DCO.3 完成市场清单、签名、哈希和 ZIP 安全校验。

### Phase 2：用户可用闭环

- DCO.4 提供市场浏览、搜索和详情。
- DCO.5 完成下载、校验、安装与首次打开。

### Phase 3：运营与生命周期

- DCO.6 完成升级、卸载、冲突和回滚。

### Phase 4：治理

- DCO.7 建立客户端数据质量、包撤回响应、安全日志和故障诊断。

---

## ✅ Epic 验收标准

- [ ] 合格活跃事件、排除事件、匿名标识和时区字段契约具备自动化测试。
- [ ] 用户可查看并关闭数据采集，关闭后不再产生网络上报。
- [ ] 离线事件可批量重试且具备幂等键，不重复计数。
- [ ] 市场支持 Skill、Agent、RoleAgent 的目录、搜索和详情展示。
- [ ] 用户可一键下载并安装兼容应用，安装后无需重启即可发现。
- [ ] 哈希、签名、ZIP 安全或兼容性校验失败时不得修改现有目录。
- [ ] 升级失败可回滚；卸载不会默认删除用户产物和记忆。
- [ ] 撤回的恶意或损坏版本不会继续向新用户提供下载。
- [ ] 关键接口适配、事件队列和安装链路符合 AGENTS.md 测试覆盖要求。

---

## 🚫 非目标

- Alpha 阶段不实现付费、订阅、分成、优惠券或结算。
- 不实现评论、社区动态、私信或社交关系。
- 不做基于用户内容的个性化推荐。
- 不收集对话正文、文件内容、文件名或 Agent 记忆用于运营分析。
- 不允许市场包安装任意原生程序、浏览器扩展或系统服务。
- 不用数据库替代项目约定的 JSON / 文件存储。

---

## 🔗 依赖关系

| 依赖 | 用途 | 状态 |
|------|------|------|
| Epic OS | 窗体、首页入口、Skill/Agent 运行目录与 IPC | Existing |
| Story OS.19 | Skill、Agent、RoleAgent ZIP 导出能力 | Complete |
| Core Skills 多源加载 | 安装后发现和系统/用户应用区分 | Existing |
| Desktop 自动更新与发布链路 | 版本、签名、校验和 CDN 经验复用 | Existing |
| OriginOS 公共 API 契约 | 安装注册、事件接收、市场目录和资源包解析 | External / Proposed |

---

## ⚠️ 风险与决策门禁

1. **隐私与合规**：DCO.1 实施前必须评审采集告知、退出机制、数据保留和删除请求。
2. **发布者信任**：DCO.3 必须确定受信签名根、密钥轮换和撤销策略后才能接受市场资源包。
3. **供应链风险**：DCO.5 未通过路径穿越、压缩炸弹、签名篡改和降级攻击测试前不得上线。
4. **离线队列容量**：DCO.1 必须限制事件条数和磁盘占用，采用有界淘汰策略且不得阻塞客户端启动。
5. **卸载语义**：DCO.6 必须分离应用定义与用户产物，避免升级或卸载删除用户数据。
6. **接口契约漂移**：公共 API 必须版本化；本仓维护消费端 JSON Schema fixture 和兼容性测试。

---

## 📈 当前进度

| 项目 | 状态 |
|------|------|
| Epic 范围与目标 | ✅ Complete |
| Story 拆分 | ✅ Complete |
| Story 详细规格 | ⬜ Pending |
| 架构评审 | ⬜ Pending |
| 实施 | ⬜ Pending |

---

## 📚 相关文档

- [OriginOS 架构规约](../../../AGENTS.md)
- [文档协作管理规范](../../DOCUMENTATION-MANAGEMENT.md)
- [Epic OS：OS 交互基础](../epic-OS/README.md)
- [Story OS.19：目录导出 ZIP](../epic-OS/story-OS.19/README.md)
- [Release API 集成](../../api/release-api-integration.md)

---

## 🔄 变更历史

| 日期 | 变更内容 | 变更人 |
|------|----------|--------|
| 2026-07-27 | 创建 Epic DCO，规划 DAU 数据管理、应用市场和内容运营能力 | Codex |
| 2026-07-27 | 将服务端与运营管理能力移出本 Epic，重构为 7 个纯客户端 Story | Codex |
