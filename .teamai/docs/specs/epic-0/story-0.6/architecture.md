# 架构设计 - Story 0.6

**Story:** 错误处理与恢复
**Epic:** Epic 0 - 技术架构实施层
**最后更新:** 2026-03-04

---

## 🔧 技术实现要点

### 错误类型定义

```typescript
// src/lib/integrations/pi-agent/error-handler.ts
export enum ErrorType {
  NETWORK_ERROR = 'NETWORK_ERROR',
  TOOL_ERROR = 'TOOL_ERROR',
  LLM_ERROR = 'LLM_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
}

export interface PiAgentError {
  type: ErrorType;
  message: string;
  details?: unknown;
  recoverable: boolean;
  retryFn?: () => Promise<void>;
}
```

### 错误处理器

```typescript
class ErrorHandler {
  handleError(error: unknown, context: ErrorContext): PiAgentError {
    if (error instanceof NetworkError) {
      return {
        type: ErrorType.NETWORK_ERROR,
        message: '网络连接错误，请检查您的网络连接',
        details: error,
        recoverable: true,
        retryFn: () => context.retry(),
      };
    }

    if (error instanceof ToolExecutionError) {
      return {
        type: ErrorType.TOOL_ERROR,
        message: `工具执行失败: ${error.toolName}`,
        details: error.cause,
        recoverable: true,
      };
    }

    // 默认错误处理
    return {
      type: ErrorType.LLM_ERROR,
      message: '服务器错误，请稍后重试',
      details: error,
      recoverable: false,
    };
  }
}
```

### UI 错误显示

```typescript
// src/components/molecules/ErrorMessage.tsx
export function ErrorMessage({ error, onRetry }: Props) {
  return (
    <div className="p-4 border border-red-500/30 rounded-lg bg-red-500/10">
      <div className="flex items-center gap-2 mb-2">
        <AlertCircle className="w-5 h-5 text-red-500" />
        <span className="font-medium text-red-500">
          {getErrorTitle(error.type)}
        </span>
      </div>
      <p className="text-sm text-red-400 mb-3">{error.message}</p>
      {error.recoverable && onRetry && (
        <Button onClick={onRetry} variant="outline" size="sm">
          <RefreshCw className="w-4 h-4 mr-2" />
          重试
        </Button>
      )}
    </div>
  );
}
```
