# 实施文档 - Story SENSE.1

**最后更新:** 2026-08-28

## 实施步骤

- [x] 建立 protocol 类型与 Connector Contract。
- [x] 建立 scope-safe perception root/path resolver。
- [x] 实现 DataFile atomic/recovery store。
- [x] 实现 payload 大小检查和递归脱敏。
- [x] 实现 Inbox/Event/Dedupe/Lease/Audit store。
- [x] 通过模块 index.ts 导出公共 API。
- [ ] 完成单元和集成测试并运行 lint：定向测试与 tsc 已通过，Epic 完成前执行全量 lint。

## 兼容与迁移

纯新增模块，无旧数据迁移。文件 schema 从 `1.0` 起步，所有读取器必须拒绝不支持的 major version。

## 审查要点

- 是否存在从 modules 到 web/desktop/features 的反向 import。
- 是否在日志、错误信息或 audit 中泄露 payload/secret。
- 是否以字符数代替 UTF-8 字节数检查 payload。
- 是否有非原子覆盖或未校验的路径拼接。
