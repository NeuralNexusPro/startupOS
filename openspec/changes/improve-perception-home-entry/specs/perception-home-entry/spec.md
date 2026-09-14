# Perception Home Entry

## ADDED Requirements

### Requirement: 应用化发现入口
系统 SHALL 在首页应用启动器展示“感知与连接”，支持打开既有感知中心和固定到 Dock，并 SHALL 移除独占整行入口。

#### Scenario: 从应用启动器打开
- **WHEN** 用户点击“感知与连接”
- **THEN** 系统 SHALL 打开或聚焦唯一的感知中心窗体

### Requirement: 创建技能入口
系统 SHALL 在首页应用启动器的创建入口组展示“创建技能”，并复用既有 `skill-creator-app` 系统 Skill 与 Dock 应用身份。

#### Scenario: 从应用启动器创建技能
- **WHEN** 用户点击“创建技能”
- **THEN** 系统 SHALL 通过通用 Skill 启动链路打开 `skill-creator-app`

### Requirement: 常驻连接健康入口
系统 SHALL 在顶部系统栏提供不泄密的连接健康摘要和管理入口。

#### Scenario: 连接部分异常
- **WHEN** 至少一个启用连接异常且至少一个正常
- **THEN** 系统 SHALL 显示警告状态、异常数量和各连接摘要

#### Scenario: 状态不可用
- **WHEN** 管理数据尚未加载或加载失败
- **THEN** 系统 SHALL 显示加载或未知状态，并允许进入完整管理窗体
