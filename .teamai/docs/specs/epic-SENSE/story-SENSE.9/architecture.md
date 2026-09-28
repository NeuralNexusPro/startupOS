# SENSE.9 架构

```text
home top-level capability section -> AppWindowManager -> components/os/sense-center
  -> web services/store -> thin app/api/perception/management
  -> core perception management facade
```

入口不进入 `homeApps.ts`；它与应用启动器、项目、角色、技能同级，只复用窗体管理基础设施。UI 使用 React 函数组件、Tailwind、shadcn 和 Zustand。Route 只解析/映射；服务层调用 core facade。secret 字段使用 write-only DTO，响应只有 `secretConfigured`。组件不依赖 Desktop main，core 不依赖 Web。列表虚拟化阈值 50，符合 AGENTS.md。
