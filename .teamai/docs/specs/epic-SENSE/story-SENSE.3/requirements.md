# SENSE.3 需求

## 需求来源

- Epic SENSE：外部感知层触发器。
- OpenSpec change：`add-perception-layer-triggers`，任务 3.2。
- 架构围栏：文件存储、secret reference、Connector 与 Runtime 分离。

## 详细需求

1. `EmailClientPort.listSince` 必须按 UID 升序返回有界批次，并保持邮箱只读。
2. 游标 DataFile 必须保存 connectorId、mailbox、UIDVALIDITY、lastUid、updatedAt。
3. UIDVALIDITY 变化必须显式重置到客户端提供的安全基线，不得沿用失效 UID。
4. 优先处理 `text/plain` 或已清洗文本；正文最大 64 KiB，不加载远程 HTML 资源。
5. 附件只记录名称、MIME、大小和 `contentRef`；不在事件中内嵌二进制。
6. core 只接收 `secretRef` 或已注入客户端，不持有密码、OAuth token 等真实凭据。
7. 单封邮件失败时立即停止该批次；游标不得越过失败邮件，以便下一次重试。

## Given / When / Then

### AC1 增量成功

**Given** 游标 lastUid=9 且客户端返回 UID 10–12  
**When** 执行一次 poll  
**Then** 依次持久化三个 `mail.received` 事件，游标最终为 12。

### AC2 失败恢复

**Given** UID 11 持久化失败  
**When** 批次处理 UID 10–12  
**Then** UID 10 可提交，游标不超过 10，UID 11 与 12 留待后续轮询。

### AC3 去重与标识

**Given** 同一 Message-ID 或同一 UIDVALIDITY/UID 被再次拉取  
**When** 写入事件存储  
**Then** 被识别为同一 source event，不产生第二个标准事件。

### AC4 内容防御

**Given** 超长正文、HTML 跟踪资源或附件  
**When** 归一化邮件  
**Then** 正文清洗并截断且标注，附件只产生引用元数据。

## 边界与异常

- 空批次不修改 lastUid。
- UID 无序或重复时排序并跳过不大于当前游标的记录。
- UIDVALIDITY 缺失、UID 非正整数、mailbox 不匹配视为无效输入。
- 客户端、inbox 或 event store 抛错时不吞错，游标保持最后成功位置。
- 超过单批 50 封由后续轮询处理，避免长时间占用 supervisor。

## 依赖与非功能需求

- 依赖 SENSE.1 的事件、inbox、event store 与内容防御。
- 由 Desktop/Service supervisor 提供真实邮件客户端与 secret resolution；scheduler 只负责触发时序。
- 默认单批上限 50；单封归一化 p95 目标小于 20ms（不含网络与磁盘 I/O）。
- 不引入数据库、网络 SDK或新的执行器。
