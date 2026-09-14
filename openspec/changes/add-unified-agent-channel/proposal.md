# Proposal：统一 Agent Channel 与多 Runtime 双工消息主路径

## 追溯

- Epic/Story：OS.22
- 规格：`docs/specs/epic-OS/story-OS.22/`

## 动机与变更

OriginOS UI 输入框和外部感知源都是消息 Channel，但当前使用两条不同 Agent 调用链。新增统一 Message Ingress、Session Binding、Agent OutputEvent 和 Channel Delivery 协议，使 Agent、RoleAgent、Project Agent、Skill 与 Project Multi-Agent/Collaboration Runtime 复用消息持久化、流式执行、HITL、取消和双工输出。

## 非目标

不重写 LLM/Agent Engine，不让渠道直接访问项目内部子 Agent，不引入远程插件市场、数据库或新的后端框架。

## 影响与依赖

影响 core channel/perception/pi-agent/collaboration runtime、Desktop Session IPC、Web 消息 hooks 和感知插件；依赖 OS.20 与 SENSE.12。

## 上线与回滚

先抽取现有 UI 主路径并做契约测试，再接入企微和其他渠道；通过兼容字段双轨验证。回滚保留 Session、Binding、Delivery 与审计数据。
