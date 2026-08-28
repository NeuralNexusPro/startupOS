## 1. Epic / Story specification

- [x] 1.1 Create Epic SENSE overview, boundaries, data layout, roadmap and acceptance gates
- [x] 1.2 Initialize SENSE.1–SENSE.8 Story six-document templates before each implementation slice
- [x] 1.3 Add platform-specific capability matrices using current official documentation

## 2. Perception foundation

- [x] 2.1 Define PerceptionEventV1, Connector Contract and capability types
- [x] 2.2 Implement DataFile inbox/event/lease/audit stores with atomic writes and recovery
- [x] 2.3 Add payload size limits, content defense, dedupe and replay-window tests

## 3. Connector boundaries

- [x] 3.1 Implement thin Webhook Gateway and callback handshake contract
- [x] 3.2 Implement Email incremental polling, cursor and attachment references
- [x] 3.3 Implement WeCom connector and signature/encryption fixtures
- [x] 3.4 Implement Feishu connector and event fixtures
- [x] 3.5 Implement DingTalk connector and event fixtures

## 4. Trigger routing

- [x] 4.1 Implement declarative Trigger Rule validation and matching
- [x] 4.2 Implement target authorization and idempotent execution lease
- [x] 4.3 Route to existing Project, RoleAgent and Skill session/task entry points
- [x] 4.4 Enforce standalone/inherited Skill ownership semantics

## 5. Operations and verification

- [x] 5.1 Implement retry, backoff, dead-letter and connector health
- [x] 5.2 Implement redacted audit trail and connector/rule management facade
- [x] 5.3 Run unit, connector contract, integration, replay, security and failure-isolation tests
- [x] 5.4 Run `pnpm lint` and document any manual vendor-console verification

## 6. Product entry

- [x] 6.1 Register Sense Center as a top-level capability peer to apps/projects/roles/skills and open it through AppWindowManager
- [x] 6.2 Implement source, rule, event and health management views
- [x] 6.3 Add write-only secret forms, rule wizard and dead-letter replay confirmation
- [x] 6.4 Run component, API integration, scripted user-flow, accessibility and render-performance tests; document unavailable browser E2E
