# DevSystem 元数据候选视图 SPA 证据（2026-10-28）

范围：认证态 NewApp/D99 SPA 的数据空间设计器；不是 API 测试夹具，也不是业务数据写入。

## 正式空间身份

- 目录查询键 / DataSpace ID：`90A82E287930A234FEC3E687C94A93EA`
- 空间名称：`数据空间管理`
- 所属应用：`元数据管理`
- 设计器模型清单包含：`Base_DataSet`、`Base_DataModel_Field`、`Base_DataModel`

## 已保存的命名视图

- 模型：`Base_DataSet`
- 视图：`navHostDataSpaceOptions`
- 输出列：`Type`、`sysid`、`rowid`、`Name`
- 结果读取：完整集合，完整集合上限 5000 行
- 保存回执：SPA 显示“视图配置已保存并回读确认”；保存及取消动作均禁用；模型视图列表重新显示 `default`、`catalog`、`designTarget`、`navHostDataSpaceOptions`。

## 查询验证与限制

- `Base_DataModel@default` 预览正式查询返回 20 行、总数 7672、状态 `Loaded`。
- `Base_DataSet@navHostDataSpaceOptions` 配置为完整集合时，预览显示 `Request failed with status code 502`。仅在本次预览参数里关闭完整集合后，正式查询返回 20 行、总数 1335、第 1 页、状态 `Loaded`；结果 JSON 展示 `Type`、`sysid`、`rowid`、`Name` 四个投影字段。未保存预览开关，因此正式视图定义仍配置全量读取。
- `Base_AppSystemList@catalogApps` 预览返回 1 行、总数 1、状态 `Loaded`，唯一行显示 `NewApp`、系统名“元数据管理”、应用代码 `DataSchemaManage`。此响应证明该 view 在本应用的实际范围只有一项。
- 结果只支持候选视图的分页查询可运行；不支持全量候选、权限完整性或跨 DataSet 绑定。没有继续创建 `Base_DataModel`、`Base_DataModel_Field` 视图，没有添加级联或修改 `Base_Navigation_DataRelation` / 业务行。

## root `homepage` owner 检查

- 在同一 `Base_DataSet@navHostDataSpaceOptions` 预览中，以正式字段“所属系统 ID”（`sysid`）等于 `homepage` 查询，DataView 返回 0 行、总数 0、状态 `Loaded`。此预览条件未保存到设计定义。
- 关闭设计器返回 D99 正式数据空间目录时，页面的 `新增`、`编辑`、`删除`按钮均 disabled。没有尝试从 UI 之外写入。
- 因此目前没有证据证明 `homepage` 有正式 DataSet，也没有本账号当前页面可用的 DataSpace 创建入口。90A8 的 Base_AppSystemList 只能读到 D99 当前应用的一行，不能替代 root `/app-list`。
- root `/app-list` 的正式 DataSet owner/创建权限继续作为迁移阻断条件；本记录不授权扩大权限、冒用其他应用的 DataSet 或绕过 DataView。

## 后续验证门槛

查询完成并取得真实 DataView 回执后，才补齐模型与字段选项视图、过滤级联和 DevSystem 标准绑定消费。`90A82...` 是元数据平台设计空间，不是静态 root `/app-list` 的正式 owner，也不能证明它的服务端 scope 可用于其他应用。
