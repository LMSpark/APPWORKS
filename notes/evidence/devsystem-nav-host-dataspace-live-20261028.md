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

## 项目蓝图关系正式查询

- 在正式空间 `7AB874097A1E8711A42FD845939A6E05`（应用“元数据管理”，名称“功能管理”）的设计器中，`Base_Navigation_DataRelation` 的正式字段定义共 26 列，唯一已配置视图为 `default`；预览没有修改定义。
- `Base_Navigation_DataRelation@default` 通过 SPA 查询返回 9 行、总数 9、页 1/20、状态 `Loaded`。这证实模型已有正式关系行；DevSystem 宿主 `prowid=appworks-tool-dev` 对应的精确查询仍为 0 行，所以候选项目关系尚未配置。
- 9 行中现有 `Base_AppSystemList` 关系引用 DataSpace ID 前缀 `03D8E17A`。用 D99 数据空间目录的正式名称/ID筛选该前缀返回“No Data”。这只证明当前目录查询没有匹配行，尚不足以证明该 DataSpace 在别的应用范围或服务端目录中不存在。
- 对 `Base_Navigation_DataRelation` 及其 9 行没有执行新增、修改或删除。没有更改 DataView 查询条件、排序、输出字段或 pagedata。

## root `homepage` owner 检查

- 在同一 `Base_DataSet@navHostDataSpaceOptions` 预览中，以正式字段“所属系统 ID”（`sysid`）等于 `homepage` 查询，DataView 返回 0 行、总数 0、状态 `Loaded`。此预览条件未保存到设计定义。
- 关闭设计器返回 D99 正式数据空间目录时，页面的 `新增`、`编辑`、`删除`按钮均 disabled。没有尝试从 UI 之外写入。
- 因此目前没有证据证明 `homepage` 有正式 DataSet，也没有本账号当前页面可用的 DataSpace 创建入口。90A8 的 Base_AppSystemList 只能读到 D99 当前应用的一行，不能替代 root `/app-list`。
- root `/app-list` 的正式 DataSet owner/创建权限继续作为迁移阻断条件；本记录不授权扩大权限、冒用其他应用的 DataSet 或绕过 DataView。

## 后续验证门槛

查询完成并取得真实 DataView 回执后，才补齐模型与字段选项视图、过滤级联和 DevSystem 标准绑定消费。`90A82...` 是元数据平台设计空间，不是静态 root `/app-list` 的正式 owner，也不能证明它的服务端 scope 可用于其他应用。
