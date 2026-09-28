# 需求 - Story P2.5

**Story:** 方案版本管理与执行清单
**Epic:** P2 - AI 解决方案设计
**最后更新:** 2026-04-22

---

## 用户故事

作为方案设计者，
我想管理多个方案版本，在确认某个版本后生成执行清单，
以便为第三阶段详细设计提供引导性文档。

---

## 验收标准

- [ ] AC1: 左侧面板展示当前项目的所有方案版本列表
- [ ] AC2: 每个版本显示：名称、状态（draft/reviewing/confirmed）、Agent 数量、创建时间
- [ ] AC3: 用户可切换查看不同版本的方案
- [ ] AC4: 方案状态流转：draft → reviewing → confirmed
- [ ] AC5: confirmed 状态方案锁定，不可编辑
- [ ] AC6: 用户确认方案后，自动生成执行清单 JSON 文件
- [ ] AC7: 提供执行清单查看/下载入口
- [ ] AC8: 支持版本对比（Agent 数量差异、协作关系变化）——可选，MVP 后

---

## 依赖关系

### 已实现

| 内容 | 状态 | 说明 |
|------|------|------|
| Skill 阶段五：清单生成 | ✅ | 用户说「确认方案」，Skill 写入 `solutions/solution-{version}-manifest.json` |
| `ExecutionManifest` 类型 | ✅ | `src/types/solution.ts` 已定义 |
| `SolutionStatus` 类型 | ✅ | draft / reviewing / confirmed |

### 缺失部分

| 缺失点 | 说明 | 优先级 |
|--------|------|--------|
| 版本列表 API | `GET /api/projects/{id}/solutions` 读取 solutions/ 目录 | Critical |
| 方案状态更新 API | `PUT /api/projects/{id}/solutions/{version}` 更新 status | High |
| 左侧版本列表 UI | 展示所有 solutions/*.json 文件 | Critical |
| 执行清单查看入口 | 方案 confirmed 后显示「查看清单」按钮 | High |
| 版本切换逻辑 | 切换版本时恢复对应会话或展示历史数据 | Medium |

---

## 相关文档

- [Epic P2 README](../README.md)
- [PRD 3.7 方案版本管理](../../../product/phase-2-ai-solution-design.md#37-方案版本管理)
- [PRD 3.8 执行清单生成](../../../product/phase-2-ai-solution-design.md#38-执行清单生成)
- [solution.ts 类型定义](../../../../src/types/solution.ts)
- [solution-design Skill 阶段五](../../../../skills/solution-design/SKILL.md)
