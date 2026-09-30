# home-page-structure Specification

## Purpose
TBD - created by archiving change refactor-home-page-structure. Update Purpose after archive.

## Requirements

### Requirement: 首页布局门面单一职责

`packages/web/src/app/page.tsx` SHALL 只承载首页布局 JSX 与各模块组装（Provider 挂载、hook 组合、组件编排），默认导出符号 `OSHomePage` MUST 保持不变；展示组件、状态 hook、handler/effect 模块 SHALL 存放于页面就近目录 `packages/web/src/app/home/`。

#### Scenario: page.tsx 行数与导出

- **WHEN** 执行 `wc -l packages/web/src/app/page.tsx` 与 `grep -E "^export" packages/web/src/app/page.tsx`
- **THEN** page.tsx SHALL ≤ 300 行，且导出集合与拆分前一致（唯一默认导出 `OSHomePage`）

#### Scenario: 职责单句注释

- **WHEN** 查看 `packages/web/src/app/home/` 下任一新文件首部
- **THEN** SHALL 存在一句话职责注释，且单文件 ≤ 600 行

### Requirement: 纯机械拆分且行为不变

拆分 MUST 为纯代码移动：不改逻辑、不改导出符号、不新增抽象接口；全仓调用方 import 零改动。

#### Scenario: 符号清单不变

- **WHEN** 对比拆分前后 page.tsx 的导出符号清单
- **THEN** diff SHALL 为空（或仅新增 re-export 行），且 `grep -rn "app/page"` 无新增导入方

#### Scenario: 循环依赖不回退

- **WHEN** 执行 `npx madge --circular packages/core/src --extensions ts,tsx`
- **THEN** 循环数 SHALL ≤ 基线 12，且 `packages/web/src/app/home/` 内部无循环导入

### Requirement: 首页行为回归保障

拆分 SHALL 通过既有测试基线与首页模块冒烟，验证首页加载、窗口打开/关闭、Dock 交互行为与拆分前一致。

#### Scenario: 测试与编译基线

- **WHEN** 执行 `pnpm --filter @originos/web build`、`pnpm --filter @originos/desktop build`、`pnpm test`、`pnpm --filter @originos/desktop test`
- **THEN** 双端 build SHALL 0 error，测试通过数 SHALL ≥ 拆分前基线（web 425 / desktop 182）
