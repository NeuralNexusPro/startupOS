# SENSE.10 架构

## 架构流

```text
SenseCenter Mail form
  ├─ non-secret config → Web service/API → Core PerceptionManagementFacade
  └─ credential + test（Electron only）→ preload IPC
       → Desktop MailProvisioningService
          ├─ safeStorage credential adapter
          ├─ IMAP client adapter
          └─ MailConnectorSupervisor → Core EmailPoller → event/router
```

## 模块与依赖

- `packages/core/src/types/perception.ts`：Mail profile、test result、安全错误码。
- `packages/core/src/lib/integrations/perception/email/`：IMAP client、credential、scheduler ports，不依赖 Web/Desktop。
- `packages/core/src/modules/perception-runtime/connectors/email/`：复用 EmailPoller、cursor、health、retry。
- `packages/desktop/src/main/services/perception-mail/`：safeStorage、IMAP adapter、Supervisor 和 IPC。
- `packages/web/src/components/os/sense-center/`：Mail 表单和状态展示。
- `packages/web/src/services/`：非敏感 API 与 Electron IPC 客户端适配。
- `packages/web/src/app/api/perception/`：仅解析非敏感配置，拒绝 credential 字段。

依赖方向为 Web component→Web service→Core，以及 Desktop main→Core；Core 不反向依赖 Web/Desktop。

## 安全存储

```typescript
interface MailCredentialPort {
  bind(connectorId: string, secret: MailSecretInput): Promise<string>;
  resolve(secretRef: string): Promise<MailSecret>;
  remove(secretRef: string): Promise<void>;
}
```

Desktop adapter 使用 `safeStorage.encryptString/decryptString`。若加密不可用，绑定失败，禁止明文 fallback。磁盘只保存密文 DataFile，所有异常映射为稳定安全码。

## IMAP 与生命周期

Desktop 集成使用 `imapflow`，Core 只认识 `MailClientPort`。Supervisor 监听应用 ready/shutdown、配置启停和网络恢复；每个 Connector 独立调度、超时、退避和健康状态。首次启用前必须存在成功 test receipt，receipt 在关键配置变化后失效。

## AGENTS.md 符合性

- JSON/DataFile，无数据库；API Route 薄边界。
- TypeScript strict，无 `any`；React hooks、Tailwind、Zustand。
- 不修改 `.claude/skills` 或编译产物。
