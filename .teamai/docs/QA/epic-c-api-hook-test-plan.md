# Epic C API 和 Hook 测试计划

**任务 ID:** #18
**优先级:** P1-P2
**创建日期:** 2026-03-12
**QA Engineer:** QA Engineer

---

## 1. 测试范围

### 1.1 API 端点测试 (P1)

| 端点 | 方法 | 描述 | 优先级 |
|------|------|------|--------|
| `/api/taste/user/detection/start` | POST | 开始新的检测会话 | P1 |
| `/api/taste/user/detection/:sessionId/message` | POST | 发送用户消息 | P1 |
| `/api/taste/user/detection/:sessionId/analyze` | POST | 触发 LLM 分析 | P1 |
| `/api/taste/user/detection/:sessionId/taste-draft` | GET | 获取 TASTE 草稿 | P1 |

### 1.2 React Hook 测试 (P2)

| Hook | 描述 | 优先级 |
|------|------|--------|
| `useCultureDetection` | 用户品味检测 React Hook | P2 |

---

## 2. API 端点测试用例

### 2.1 POST /api/taste/user/detection/start

#### TC-API-001: 正常创建会话

**前置条件:** 无

**测试步骤:**
1. 发送 POST 请求到 `/api/taste/user/detection/start`
2. Body: `{ "userId": "test-user-001" }`

**预期结果:**
- 状态码: 201
- 返回 sessionId
- 返回 firstQuestion
- status = "active"
- currentTurn = 0

#### TC-API-002: 缺少 userId 参数

**测试步骤:**
1. 发送 POST 请求
2. Body: `{}`

**预期结果:**
- 状态码: 400
- error: "userId is required"
- code: "VALIDATION_ERROR"

#### TC-API-003: maxTurns 边界值验证

**测试步骤:**
1. 测试 maxTurns = 2 (应自动调整为 3)
2. 测试 maxTurns = 6 (应自动调整为 5)
3. 测试 maxTurns = 4 (正常)

**预期结果:**
- maxTurns 正确限制在 3-5 范围内

---

### 2.2 POST /api/taste/user/detection/:sessionId/message

#### TC-API-004: 正常发送消息

**前置条件:** 已创建会话

**测试步骤:**
1. 发送 POST 请求到 `/api/taste/user/detection/{sessionId}/message`
2. Body: `{ "content": "我正在开发一个企业级应用", "turn": 1 }`

**预期结果:**
- 状态码: 200
- 返回 message (下一条问题)
- turn 递增
- isComplete 标志

#### TC-API-005: 会话不存在

**测试步骤:**
1. 使用不存在的 sessionId

**预期结果:**
- 状态码: 404
- error: "Session not found"
- code: "SESSION_NOT_FOUND"

#### TC-API-006: 消息内容验证

**测试步骤:**
1. 空消息内容
2. 消息内容超过 2000 字符

**预期结果:**
- 状态码: 400
- error: "Message content must be between 1 and 2000 characters"

#### TC-API-007: 会话已完成状态

**前置条件:** 会话状态为 "completed"

**测试步骤:**
1. 发送消息到已完成的会话

**预期结果:**
- 状态码: 409
- error: "Session already completed"
- code: "SESSION_ALREADY_COMPLETED"

---

### 2.3 POST /api/taste/user/detection/:sessionId/analyze

#### TC-API-008: 正常触发分析

**前置条件:** 会话已收集足够的对话轮次

**测试步骤:**
1. 发送 POST 请求到 `/api/taste/user/detection/{sessionId}/analyze`

**预期结果:**
- 状态码: 200
- 返回 analysisId
- status = "completed"
- 返回 cultureLayer
- 返回 confidence

#### TC-API-009: 会话未准备好分析

**前置条件:** 会话对话轮次不足

**测试步骤:**
1. 发送分析请求

**预期结果:**
- 状态码: 400
- error: "Session not ready for analysis"
- code: "SESSION_NOT_READY"

#### TC-API-010: 分析已在进行中

**前置条件:** 会话状态为 "analyzing"

**测试步骤:**
1. 发送分析请求

**预期结果:**
- 状态码: 409
- error: "Analysis already in progress"
- code: "ANALYSIS_IN_PROGRESS"

#### TC-API-011: 强制重新分析

**前置条件:** 会话已分析完成

**测试步骤:**
1. 发送请求: `{ "options": { "forceReanalyze": true } }`

**预期结果:**
- 状态码: 200
- 重新执行分析

---

### 2.4 GET /api/taste/user/detection/:sessionId/taste-draft

#### TC-API-012: 正常获取 TASTE 草稿

**前置条件:** 分析已完成

**测试步骤:**
1. 发送 GET 请求

**预期结果:**
- 状态码: 200
- 返回 draft (TASTE profile)
- 返回 confidence

#### TC-API-013: 分析未完成

**前置条件:** 会话状态不是 "completed"

**测试步骤:**
1. 发送 GET 请求

**预期结果:**
- 状态码: 425 (Too Early)
- error: "Analysis not yet completed"
- code: "ANALYSIS_NOT_COMPLETE"

---

## 3. Hook 测试用例

### 3.1 useCultureDetection Hook

#### TC-HOOK-001: 初始化状态

**测试步骤:**
1. 渲染 Hook

**预期结果:**
- sessionId = null
- currentQuestion = null
- turnCount = 0
- isComplete = false
- isLoading = false
- error = null

#### TC-HOOK-002: startSession 成功

**测试步骤:**
1. 调用 startSession("test-user")

**预期结果:**
- isLoading 变为 true，然后 false
- sessionId 被设置
- currentQuestion 被设置
- onSessionCreated 回调被调用

#### TC-HOOK-003: startSession 错误处理

**测试步骤:**
1. Mock API 返回错误
2. 调用 startSession

**预期结果:**
- error 被设置
- onError 回调被调用

#### TC-HOOK-004: sendMessage 成功

**前置条件:** 会话已创建

**测试步骤:**
1. 调用 sendMessage("测试消息")

**预期结果:**
- turnCount 递增
- currentQuestion 更新
- isLoading 正确切换

#### TC-HOOK-005: sendMessage 无会话

**测试步骤:**
1. sessionId = null
2. 调用 sendMessage

**预期结果:**
- error = "No active session"

#### TC-HOOK-006: analyzeDialogue 成功

**前置条件:** 会话已准备好

**测试步骤:**
1. 调用 analyzeDialogue()

**预期结果:**
- tasteProfile 被设置
- onAnalysisComplete 回调被调用

#### TC-HOOK-007: getTasteDraft 成功

**前置条件:** 分析已完成

**测试步骤:**
1. 调用 getTasteDraft()

**预期结果:**
- tasteProfile 被设置
- confidence 被设置

---

## 4. 集成测试场景

### TC-INT-001: 完整流程测试 (已有)

**已覆盖:** `src/lib/features/culture/__tests__/integration.test.ts`

### TC-INT-002: 并发会话测试

**测试步骤:**
1. 创建多个会话
2. 同时发送消息到不同会话
3. 验证会话隔离

**预期结果:**
- 每个会话独立
- 消息不会混淆

### TC-INT-003: 会话过期测试

**测试步骤:**
1. 创建会话后等待过期时间
2. 尝试发送消息

**预期结果:**
- 返回 SESSION_EXPIRED 错误

### TC-INT-004: 错误恢复测试

**测试步骤:**
1. 触发各种错误状态
2. 验证错误消息正确返回
3. 验证会话状态正确更新

---

## 5. 测试文件位置

| 测试类型 | 文件路径 |
|---------|---------|
| Start API | `src/app/api/taste/user/detection/__tests__/start.route.test.ts` |
| Message API | `src/app/api/taste/user/detection/[sessionId]/message/__tests__/route.test.ts` |
| Analyze API | `src/app/api/taste/user/detection/[sessionId]/analyze/__tests__/route.test.ts` |
| Taste Draft API | `src/app/api/taste/user/detection/[sessionId]/taste-draft/__tests__/route.test.ts` |
| Hook 测试 | `src/lib/features/culture/hooks/__tests__/useCultureDetection.test.ts` |

---

## 6. 验收标准

- [ ] 所有 API 端点测试覆盖
- [ ] Hook 测试通过
- [ ] 集成测试场景增加到 4+
- [ ] 测试覆盖率 > 80%

---

**创建时间:** 2026-03-12
**状态:** 待开发实现
