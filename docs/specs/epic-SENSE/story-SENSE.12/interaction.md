# SENSE.12 交互

感知中心展示“已安装的感知插件”，流程为：`添加感知源 → 选择插件 → schema 配置 → 安全保存/测试 → 默认停用 → 启用`。

插件卡片显示名称、图标、版本、transport、能力和健康状态。表单支持 text/password/number/boolean/select、帮助、敏感标记和跨字段校验；Password 只在 Desktop 可编辑且永不回显。

## 状态与错误

- 未安装：首期仅列 bundled plugins。
- 不兼容：展示所需 Host API 版本并禁止配置。
- 迁移失败：保留旧数据并可回滚。
- 插件故障：显示脱敏安全码，允许重试/停用。
- Schema 非法：整个插件不可用，不渲染部分表单。

所有控件具有关联 label、键盘焦点和 `role=alert`；宽屏双列、窄屏单列；使用现有 Tailwind/shadcn，不允许插件注入样式。
