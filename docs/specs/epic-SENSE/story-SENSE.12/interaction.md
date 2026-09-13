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

## SENSE12-T4：当前 IM 会话发回文件

用户在企微、飞书或钉钉中要求 Agent/Skill 生成文件并发回；Agent 调用 send_file，平台确认后在原会话显示文件。上传或发送失败时返回明确的安全错误，不能声称已经送达。支持当前工作目录内非空普通文件，最大20_000_000字节；钉钉只接受 xlsx/pdf/zip/rar/doc/docx，其他格式提示生成 ZIP 后发送。无需新增 OriginOS 面板控件，交互沿用各 IM 原生文件消息及键盘、屏幕阅读器行为。

钉钉连接需要 Client ID（AppKey）、Client Secret 和机器人编码，平台侧启用 Stream 模式及机器人发消息权限。旧配置缺少凭据时需重新绑定；连接健康只有 SDK 已连接且已注册时才显示正常。文件或文本调用失败不得显示投递成功。
