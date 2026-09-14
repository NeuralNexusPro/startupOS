## 1. SENSE12-T5
- [x] 1.1 核对用户确认的企微渠道、旧ASAR基线、共享方案审查和Story测试；沿用当前修复授权。
- [x] 1.2 Core子代理独立Task实现output-dispatcher及对应测试：有界预取、连续文本合并、原包回执、源异常与写盘失败；与1.3并行，范围仅该源码和测试。TC1–6，types/lint/boundaries/selftest，返回commit。
- [x] 1.3 企微子代理独立Task修改plugin.ts及对应测试：ACK后提交文本状态，重试内容不重复；与1.2并行，范围仅企微源码/测试。TC7与既有文件/文本回归，types/lint/boundaries/selftest，返回commit。
- [x] 1.4 父代理集成、自动化验证goal、TC1–8、完整构建和旧新实际ASAR延迟对照；平台模拟，不发真实消息。
- [x] 1.5 更新Story/Epic/变更记录、strict校验、合入dev、同步归档、清理工作区并交付本地测试包。
