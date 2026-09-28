# 测试策略 - Story 10.4

**Story:** 本地 Agent Runtime
**Epic:** 10 - OriginOS CE 客户端
**最后更新:** 2026-06-02

---

## 🧪 测试用例

### 1. 本地 Agent 启动测试

**步骤：**
- 在 Electron 中启动 Agent 会话

**预期结果：**
- 验证 Agent 子进程启动成功
- 验证可正常收发消息

### 2. 多 Agent 协作测试

**步骤：**
- 启动多个 Agent

**预期结果：**
- 验证多 Agent 协作正常

### 3. Agent 崩溃恢复测试

**步骤：**
- 模拟 Agent 子进程崩溃

**预期结果：**
- 验证主窗口不受影响
- 验证可重新启动 Agent

### 4. 离线测试

**步骤：**
- 断开网络连接
- 进行 Agent 会话

**预期结果：**
- 验证 Agent 会话正常运行

---

## 📚 相关文档

- [需求规格](./requirements.md) - 用户故事和验收标准
- [架构设计](./architecture.md) - 技术实现方案
- [返回 Story 概览](./README.md)
