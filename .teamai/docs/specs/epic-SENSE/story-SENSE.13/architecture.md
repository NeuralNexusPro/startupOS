# SENSE.13 架构

```text
page.tsx / TopMenuBar / HOME_APPS
        ├── PerceptionStatusButton → perceptionStore
        └── openSenseCenter → AppWindowManager
                                  │
                                  ▼
                    既有 perception management API/facade
```

`HOME_APPS` action 扩展为 `open-sense-center`，页面只做动作分发。状态组件复用 `usePerceptionStore` 的 connectors、health、eventTraces 与 load；健康聚合为 `components/os/sense-center` 内的纯展示函数并通过 index 导出，不新增存储或 API。

影响限于 Web 配置、首页、sense-center 展示组件及测试。Web 不依赖 Desktop main，Route 不新增业务逻辑，Core 无反向依赖，符合 AGENTS.md。面板只使用已脱敏摘要，不接触凭据；渲染为有界连接列表。
