# Story Sandbox.1: 前端代码沙箱 - 架构设计文档

**版本**: v2.0
**日期**: 2026-04-29
**状态**: 待评审

---

## 1. 核心思路

用户通过 skill/agent 构建的前端应用产物已存在于 `/data` 目录下（HTML/CSS/JS 静态文件）。

我们只需要：
1. **提供 API 路由**：将 `/data` 下的文件作为静态 Web 页面服务
2. **iframe 加载**：用 `sandbox` 属性的 iframe 加载这些页面
3. **注入拦截脚本**：在返回 HTML 时自动注入 console 拦截代码

无需编辑器、编译引擎、Blob URL、代码拼接。

## 2. 数据流

```
用户点击 Dock → SandboxWindow → 列出 /data 下应用 → 选择应用
                                                        ↓
                                        iframe src="/api/sandbox/apps/my-app/"
                                                        ↓
                              API route 读取 /data/apps/my-app/index.html
                              注入 <script>console-bridge</script>
                              返回完整 HTML
                                                        ↓
                              iframe 渲染页面，console 调用通过 postMessage 上报
                              SandboxConsole 组件接收并展示
```

## 3. 组件架构

```
SandboxWindow
├── AppList (应用列表：列出 /data 下的应用产物目录)
├── SandboxIframe (iframe 加载 /api/sandbox/apps/:appId/)
│   └── sandbox="allow-scripts"
├── SandboxConsole (接收 postMessage 控制台输出)
└── SandboxErrorPanel (接收 postMessage 错误)
```

## 4. 类型定义

```typescript
// src/types/sandbox.ts
interface SandboxApp {
  id: string;           // 应用目录名，如 'my-dashboard'
  name: string;         // 应用名称
  path: string;         // 在 /data 下的相对路径
  indexHtml: string;    // index.html 的绝对路径
  updatedAt: number;
}

interface SandboxLog {
  id: string;
  type: 'log' | 'warn' | 'error' | 'info' | 'debug';
  args: string[];
  timestamp: number;
}

interface SandboxErrorInfo {
  message: string;
  stack?: string;
  lineno?: number;
  colno?: number;
  timestamp: number;
}

interface SandboxRuntimeState {
  appId: string;
  status: 'idle' | 'loading' | 'running' | 'error';
  logs: SandboxLog[];
  errors: SandboxErrorInfo[];
}
```

## 5. API 设计

### 5.1 列出应用

```
GET /api/sandbox/apps
```

扫描 `/data` 目录，返回所有包含 `index.html` 的子目录：

```json
{
  "success": true,
  "data": {
    "apps": [
      { "id": "my-dashboard", "name": "我的看板", "path": "data/apps/my-dashboard", "updatedAt": 1714377600000 },
      { "id": "report-v1", "name": "报告生成器", "path": "data/apps/report-v1", "updatedAt": 1714377600000 }
    ]
  }
}
```

### 5.2 服务应用入口

```
GET /api/sandbox/apps/:appId
```

读取 `/data/apps/:appId/index.html`，注入控制台拦截脚本后返回。

响应头：`Content-Type: text/html; charset=utf-8`

### 5.3 服务静态资源

```
GET /api/sandbox/apps/:appId/[...path]
```

读取 `/data/apps/:appId/...path` 下的 CSS/JS/图片等文件，按原样返回。

响应头：根据文件扩展名设置 `Content-Type`

### 5.4 安全约束

- 禁止访问 `/api/*`, `/_next/*`, `/.env*` 等主站敏感路径
- 禁止目录穿越（`../` 等）
- 仅允许 `/data/apps/` 下的文件被访问

## 6. 控制台拦截脚本

注入到 `</body>` 之前：

```javascript
(function() {
  var methods = ['log', 'warn', 'error', 'info', 'debug'];
  methods.forEach(function(method) {
    var original = console[method];
    console[method] = function() {
      var args = Array.prototype.slice.call(arguments).map(function(arg) {
        try { return typeof arg === 'object' ? JSON.stringify(arg) : String(arg); }
        catch(e) { return String(arg); }
      });
      parent.postMessage({ type: 'sandbox-console', method: method, args: args, timestamp: Date.now() }, '*');
      original.apply(console, arguments);
    };
  });

  window.addEventListener('error', function(e) {
    parent.postMessage({
      type: 'sandbox-error',
      message: e.message,
      stack: e.error?.stack,
      lineno: e.lineno,
      colno: e.colno,
      timestamp: Date.now()
    }, '*');
  });

  window.addEventListener('unhandledrejection', function(e) {
    parent.postMessage({
      type: 'sandbox-error',
      message: e.reason?.message || String(e.reason),
      stack: e.reason?.stack,
      timestamp: Date.now()
    }, '*');
  });
})();
```

## 7. SandboxIframe 组件

```typescript
// src/components/sandbox/SandboxIframe.tsx
interface SandboxIframeProps {
  appId: string;
  onConsole?: (log: SandboxLog) => void;
  onError?: (error: SandboxErrorInfo) => void;
}

// iframe 属性：
// sandbox="allow-scripts"
// src={`/api/sandbox/apps/${appId}`}
```

sandbox 仅包含 `allow-scripts`，不含：
- `allow-same-origin` — 不需要，因为同源请求由 API route 处理
- `allow-forms` — 禁止表单提交
- `allow-popups` — 禁止弹窗
- `allow-top-navigation` — 禁止跳转父页面

## 8. Store 设计

```typescript
// src/store/sandboxStore.ts
interface SandboxStoreState {
  apps: SandboxApp[];
  activeAppId: string | null;
  runtime: Record<string, SandboxRuntimeState>;
  isConsoleOpen: boolean;
  consoleFilter: 'all' | 'log' | 'warn' | 'error';

  // Actions
  loadApps: () => Promise<void>;
  setActiveApp: (appId: string | null) => void;
  addLog: (appId: string, log: SandboxLog) => void;
  addError: (appId: string, error: SandboxErrorInfo) => void;
  clearConsole: (appId: string) => void;
  toggleConsole: () => void;
  setConsoleFilter: (filter: 'all' | 'log' | 'warn' | 'error') => void;
}
```

## 9. 文件结构

```
src/
├── components/
│   └── sandbox/
│       ├── index.tsx
│       ├── SandboxWindow.tsx        # 沙箱主窗口（列表 + iframe + 控制台）
│       ├── SandboxIframe.tsx         # iframe 载体 + sandbox 属性
│       ├── SandboxConsole.tsx        # 控制台输出面板
│       └── SandboxErrorPanel.tsx     # 错误面板
├── lib/
│   └── sandbox/
│       ├── console-bridge.ts         # 控制台拦截脚本字符串
│       └── mime.ts                   # 文件扩展名 → Content-Type 映射
├── store/
│   └── sandboxStore.ts               # Zustand store
├── types/
│   └── sandbox.ts                    # 类型定义
├── app/
│   └── api/
│       └── sandbox/
│           └── apps/
│               ├── route.ts                      # 列出应用
│               └── [appId]/
│                   ├── route.ts                  # 服务 index.html
│                   └── [...path]/
│                       └── route.ts              # 服务静态资源
└── store/
    └── dockStore.ts                  # 新增 sandbox dock item
```

## 10. Dock 集成

在 `src/store/dockStore.ts` 新增：

```typescript
{
  id: 'sandbox',
  name: '代码沙箱',
  icon: '🔬',
  iconType: 'emoji',
  isRunning: false,
  isPinned: true,
  appType: 'sandbox',
},
```

在 `src/types/os.ts` 扩展 `appType`:

```typescript
appType?: 'agent' | 'skill' | 'action' | 'sandbox';
```

在 `src/config/system-apps.ts` 注册：

```typescript
{ code: 'sandbox', name: '代码沙箱', workDirStrategy: 'app-output' },
```

在 `src/app/page.tsx` 的 dock action handler 中处理 `launch-sandbox`。

## 11. 安全模型

| 威胁 | 防护 |
|-----|------|
| 访问父窗口 | sandbox 仅 `allow-scripts`，无 `allow-top-navigation` |
| DOM 污染 | iframe 隔离 DOM |
| Cookie 窃取 | sandbox 不含 `allow-cookies` |
| 弹窗骚扰 | sandbox 不含 `allow-popups` |
| 目录穿越 | API route 校验路径在 `/data/apps/` 下 |
| 访问主站 API | API route 禁止 `/api/*`, `/_next/*` 路径 |
