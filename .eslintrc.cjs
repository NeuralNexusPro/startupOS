module.exports = {
  "extends": [
    "next/core-web-vitals",
    "plugin:@typescript-eslint/recommended"
  ],
  "parser": "@typescript-eslint/parser",
  "parserOptions": {},
  "plugins": [
    "@typescript-eslint",
    "import"
  ],
  "ignorePatterns": ["**/*.d.ts"],
  "rules": {
    // ========================================
    // 模块依赖规约（AGENTS.md 新增章节）
    // ========================================
    "import/no-cycle": "off",
    "import/no-self-import": "error",
    "import/no-relative-parent-imports": "off",
    // ========================================
    // TypeScript 严格模式规则（AGENTS.md 要求）
    // ========================================
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-empty-object-type": "warn",
    "@typescript-eslint/no-unused-expressions": "warn",
    "@typescript-eslint/explicit-function-return-type": "warn",
    "@typescript-eslint/no-unused-vars": ["warn", {
      "argsIgnorePattern": "^_",
      "varsIgnorePattern": "^_"
    }],
    "@typescript-eslint/strict-boolean-expressions": "off",
    "@typescript-eslint/no-floating-promises": "off",
    "@typescript-eslint/no-misused-promises": "off",

    // ========================================
    // 目录结构规约 — 层级边界（AGENTS.md 第 3-4 章）
    // ========================================
    "import/no-restricted-paths": ["warn", {
      "basePath": __dirname,
      "zones": [
        {
          "target": "./packages/core",
          "from": ["./packages/web", "./packages/desktop", "./packages/service"],
          "message": "Core 禁止依赖 Web、Desktop 或 Service 包。"
        },
        {
          "target": ["./packages/core/src/lib/storage", "./packages/core/src/lib/integrations", "./packages/core/src/lib/shared", "./packages/core/src/types"],
          "from": ["./packages/core/src/lib/features", "./packages/core/src/modules"],
          "message": "Core 基础设施层禁止依赖业务功能层或模块层。"
        },
        {
          "target": ["./packages/web/src/services", "./packages/web/src/store"],
          "from": ["./packages/web/src/components", "./packages/web/src/app"],
          "message": "Web 服务与状态层禁止依赖组件层或应用层。"
        },
        {
          "target": "./packages/web/src/components",
          "from": "./packages/web/src/app",
          "message": "Web 组件层禁止依赖应用层。"
        },
        {
          "target": ["./packages/web/src/services", "./packages/web/src/store", "./packages/web/src/components"],
          "from": "./packages/desktop/src/main",
          "message": "Web 服务、状态与组件层禁止依赖 Electron 主进程。"
        },
        {
          "target": ["./packages/web/src/components/ui", "./packages/web/src/components/molecules"],
          "from": "./packages/web/src/components",
          "except": ["ui", "molecules"],
          "message": "基础 UI 与 molecules 禁止依赖业务组件。"
        },
        {
          "target": "./packages/desktop/src/main",
          "from": ["./packages/web/src/app", "./packages/web/src/components"],
          "message": "Electron 主进程禁止依赖 Web 页面或 UI 实现。"
        },
        {
          "target": "./packages/perception-plugins",
          "from": ["./packages/web", "./packages/desktop"],
          "message": "感知插件禁止依赖 Web 或 Desktop 包。"
        }
      ]
    }],

    // ========================================
    // 禁止使用的技术（AGENTS.md 第 2 章）
    // ========================================
    "no-restricted-imports": ["error", {
      "patterns": [
        "redux",
        "@reduxjs/*",
        "mobx",
        "mobx-react",
        "styled-components",
        "@emotion/*",
        "*.module.css",
        "*.module.scss",
        "express",
        "koa",
        "fastify",
        "pg",
        "mysql",
        "mongodb",
        "mongoose",
        "typeorm",
        "prisma"
      ]
    }],

    // ========================================
    // React 规范（AGENTS.md 第 7 章）
    // ========================================
    "react/function-component-definition": ["warn", {
      "namedComponents": "arrow-function",
      "unnamedComponents": "arrow-function"
    }],
    "react-hooks/rules-of-hooks": "warn",
    "react-hooks/exhaustive-deps": "warn",
    "react/no-unescaped-entities": "warn",

    // ========================================
    // 导入顺序规范（AGENTS.md 第 7 章）
    // ========================================
    "import/order": ["warn", {
      "groups": [
        "builtin",
        "external",
        "internal",
        ["parent", "sibling"],
        "index",
        "object",
        "type"
      ],
      "pathGroups": [
        {
          "pattern": "react",
          "group": "external",
          "position": "before"
        },
        {
          "pattern": "next/**",
          "group": "external",
          "position": "before"
        },
        {
          "pattern": "@/components/**",
          "group": "internal",
          "position": "after"
        },
        {
          "pattern": "@/lib/**",
          "group": "internal",
          "position": "after"
        }
      ],
      "pathGroupsExcludedImportTypes": ["react", "next"],
      "newlines-between": "always",
      "alphabetize": {
        "order": "asc",
        "caseInsensitive": true
      }
    }],

    // ========================================
    // 命名规范（AGENTS.md 第 7 章）
    // ========================================
    "@typescript-eslint/naming-convention": [
      "warn",
      {
        "selector": "interface",
        "format": ["PascalCase"],
        "custom": {
          "regex": "^I[A-Z]",
          "match": false
        }
      },
      {
        "selector": "typeAlias",
        "format": ["PascalCase"]
      },
      {
        "selector": "enum",
        "format": ["PascalCase"]
      },
      {
        "selector": "variable",
        "format": ["camelCase", "UPPER_CASE", "PascalCase"],
        "leadingUnderscore": "allow"
      },
      {
        "selector": "function",
        "format": ["camelCase", "PascalCase"]
      }
    ],

    // ========================================
    // 性能约束相关（AGENTS.md 第 6 章）
    // ========================================
    "no-console": ["warn", {
      "allow": ["warn", "error"]
    }],

    // ========================================
    // 通用代码质量规则
    // ========================================
    "prefer-const": "error",
    "no-var": "error",
    "eqeqeq": ["warn", "always"],
    "curly": ["warn", "all"],
    "no-throw-literal": "warn",
    "prefer-template": "warn",
    "no-nested-ternary": "warn",
    "max-depth": ["warn", 4],
    "max-lines-per-function": ["warn", {
      "max": 150,
      "skipBlankLines": true,
      "skipComments": true
    }],
    "complexity": ["warn", 15]
  },
  "overrides": [
    ...["web", "core", "desktop", "perception-plugins/email", "perception-plugins/wecom", "perception-plugins/feishu", "perception-plugins/dingtalk"].map((pkg) => ({
      files: [`packages/${pkg}/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}`],
      settings: {
        "import/resolver": {
          [require.resolve("eslint-import-resolver-typescript", { paths: [require.resolve("eslint-config-next")] })]: {
            project: require("node:path").join(__dirname, "packages", pkg, "tsconfig.json"),
          },
        },
      },
    })),
    {
      "files": ["*.d.ts", "**/*.d.ts"],
      "rules": {
        "@typescript-eslint/await-thenable": "off",
        "@typescript-eslint/no-floating-promises": "off",
        "@typescript-eslint/no-for-in-array": "off",
        "@typescript-eslint/no-implied-eval": "off",
        "@typescript-eslint/no-misused-promises": "off",
        "@typescript-eslint/naming-convention": "off",
        "@typescript-eslint/no-unnecessary-type-assertion": "off",
        "@typescript-eslint/no-unsafe-argument": "off",
        "@typescript-eslint/no-unsafe-assignment": "off",
        "@typescript-eslint/no-unsafe-call": "off",
        "@typescript-eslint/no-unsafe-member-access": "off",
        "@typescript-eslint/no-unsafe-return": "off",
        "@typescript-eslint/require-await": "off",
        "@typescript-eslint/restrict-plus-operands": "off",
        "@typescript-eslint/restrict-template-expressions": "off",
        "@typescript-eslint/strict-boolean-expressions": "off",
        "@typescript-eslint/unbound-method": "off"
      }
    },
    {
      "files": ["*.test.ts", "*.test.tsx", "*.spec.ts", "*.spec.tsx"],
      "rules": {
        "@typescript-eslint/no-explicit-any": "off",
        "max-lines-per-function": "off"
      }
    }
  ]
};
