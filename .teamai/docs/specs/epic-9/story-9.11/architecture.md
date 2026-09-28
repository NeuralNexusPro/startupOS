# 架构设计 - Story 9.11

**Story:** Collaboration API Routes
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-17

---

## 技术栈

- Next.js App Router API Routes
- TypeScript 严格模式
- SSE（Server-Sent Events）流
- 依赖注入（CollaborationRuntimeDeps）

## 数据结构

### SSE 事件流实现

```typescript
// events/route.ts — SSE 流
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const stream = new ReadableStream({
    start(controller) {
      const unsubscribe = eventEmitter.subscribe((event: RuntimeEvent) => {
        if (event.sessionId === params.id) {
          controller.enqueue(`data: ${JSON.stringify(event)}\n\n`);
        }
      });
      req.signal.addEventListener('abort', () => unsubscribe());
    }
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream' },
  });
}
```

### 统一错误格式

```typescript
{ success: false, error: string }
```

## 模块设计

**文件：**

```
src/app/api/collaboration/sessions/route.ts
src/app/api/collaboration/sessions/[id]/route.ts
src/app/api/collaboration/sessions/[id]/events/route.ts
src/app/api/collaboration/sessions/[id]/blackboard/route.ts
src/app/api/collaboration/sessions/[id]/execute/route.ts
src/app/api/collaboration/sessions/[id]/abort/route.ts
```

## 代码变更

- 新增 6 个 API route 文件
- API routes 仅做 HTTP 请求/响应处理
- 所有业务逻辑委托给 `collaboration-runtime` 模块
- 负责组装 `CollaborationRuntimeDeps` 并注入
- 实现 SSE 事件流推送
