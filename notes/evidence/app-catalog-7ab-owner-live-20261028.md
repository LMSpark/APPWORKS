# 7AB 应用目录 DataSpace owner 与 DataView 草稿验证

日期：2026-10-28
环境：已认证 NewApp/D99 SPARK SPA，数据空间管理导航 `90A82E287930A234FEC3E687C94A93EA`
范围：只读核对正式目录/模型，并创建后撤销本地 DataView 草稿；未保存远端配置或业务行。

## 正式 owner 与模型

- 在正式 DataSpace 目录按名称 `功能管理` 查询得到 1 条空间；打开设计器后定义详情显示 DataSpace ID `7AB874097A1E8711A42FD845939A6E05`，所属应用“元数据管理”。该 ID 与 `LOWCODE_APPLICATION_CATALOG_FORM_KEY` 一致。
- 工作区显示 24 个模型；模型树中 `Base_AppSystemList` 的正式来源为 `QYVirtualPlat.Base_AppSystemList`（数据库表），描述为“应用系统注册表”。该模型有 23 个正式字段。
- 已存 `Base_AppSystemList` 命名视图数为 0。模型字段输出中 `rowid`、`AppName`、`AppDesc`、`EntId`、`EntShortName` 为输出字段；`IsSys` 当前输出关闭。旧 `listApplications()` 查询合同要求 `rowid`、`AppName`、`AppDesc`、`EntId`、`EntShortName`、`IsSys`，因此正式视图仍需完整字段和权限读回。
- 旧 `/app-list` 固定 FormKey `7AB...` 的既有真实响应记录为 61 行/61 卡片（见 [`application-catalog-scope-live-20261028.json`](application-catalog-scope-live-20261028.json)）。这证明旧请求范围，不证明新 DataView 查询等价。

## 未保存视图草稿验证

- 在 `Base_AppSystemList` 下创建本地命名视图 `catalogApps` 草稿，绑定名 `Base_AppSystemList`，只在草稿中选单表查询并检查查询输出。此阶段没有点击保存。
- 设计器的查询预览被拒绝，显示 `DATA_VIEW_UNSAVED_CHANGES: DataViewDefinition@default 必须先保存或明确放弃修改`，预览按钮禁用或无法执行；因此本次不能获得 DataView 的真实行数及字段授权结果。
- 点击“取消未提交修改”后，树恢复 `数据视图（0）`，保存按钮禁用。远端模型/视图定义与打开前一致；无业务数据写入、Java 修改或其他配置提交。
- 该现象提示新增命名视图草稿预览路径错误地碰到 `default` 定义或相关未处理状态。低价模型正在查源码并补自动化反例，修复后再尝试正式 DataView 预览。

## 当前裁定

7AB 是正式目录中的应用目录模型 owner，不应继续把 root owner 记为“完全未找到”。当前未完成项改为：在该 owner 下通过 DataSpace 设计补 `Base_AppSystemList` 命名 DataView，确保查询输出包含旧消费者实际所需字段，比较 DataView 与旧 61 行的范围，并核实正式字段权限。未拿到真实 DataView 预览前，不迁移 `listApplications()` 消费者，不声明数据架构统一。
