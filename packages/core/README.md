# @originos/core

`@originos/core` 是 OriginOS 的共享 TypeScript 运行时包。所有业务逻辑、集成抽象、共享模块与类型都下沉在本包中，`packages/web`（Next.js）与 `packages/desktop`（Electron main）只是两个消费本包的宿主（host），不得复制本包的实现。

## 包定位

- **共享 TS 运行时**：core 以 `.ts` 源码直接发布给 workspace 内宿主（`exports` 指向 `./src/**/*.ts`），不做独立编译；打包时的 TS→JS 转换由宿主链路负责（Web 走 webpack/Next.js，Desktop 走 tsc + `packages/desktop/scripts/prepare-core-runtime.js` staging）。
- **依赖层级（自上而下单向依赖）**：
  1. `src/lib/features/` — 业务功能（agent / skills / project / ontology / taste 等）
  2. `src/modules/` — 共享模块（collaboration-runtime / memory-core / scheduler 等）
  3. `src/lib/storage/`、`src/lib/integrations/`、`src/lib/shared/`、`src/types/` — 基础设施层
  - 下层禁止依赖上层；跨 feature 只能通过各 feature 的 `index.ts` 公共 API，不得深入其他 feature 的内部文件。

## exports 白名单即公共 API

跨包访问 core 的**唯一合法方式**是 `@originos/core/<spec>` 包名说明符，且 `<spec>` 必须命中本包 `package.json` 的 `exports` 显式条目（白名单）。任何相对路径穿透（`../../core/src/...`）都被 `lint:boundaries` 以 error 级拦截。

### 维护方式

`exports` 表由消费面驱动的机械脚本维护，不手工增删：

```bash
# 扫描 packages/web 与 packages/desktop 的 src，
# 将真实消费的 @originos/core/<spec> 展开为 exports 显式条目，
# 并删除未被消费的通配符条目（consumption-closed）
node scripts/expand-core-exports.cjs

# 只读校验：0 通配符、消费闭包全部解析、facade 底线（<feature> 与 <feature>/types）
node scripts/expand-core-exports.cjs --verify
```

- 支持按段展开（`--section lib/features` 等），用于分批灰度。
- 新增跨包消费时：先在宿主代码中写 `import ... from '@originos/core/<spec>'`，再运行 expand 脚本补齐 exports；若 `<spec>` 无法解析到真实文件，脚本会非零退出。
- 不允许为未被消费的路径手工添加 exports 条目（保持"白名单 = 真实消费面"）。

## 边界约束

- core 不依赖 `packages/web`、`packages/desktop`、`packages/service/`。
- Electron 相关实现位于 `src/lib/integrations/electron/`，对外的公共聚合入口是其 `index.ts` facade。
- 详见根目录 `AGENTS.md`（模块依赖规约、数据存储规约）。
