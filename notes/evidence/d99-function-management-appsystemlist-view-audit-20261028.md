# D99 功能管理 DataSpace 命名视图只读核查

- 时间：2026-10-28（NewApp 本地 SPARK SPA）
- 入口：`/t/NewApp/D99A1DCE9894698799101EFD70F8FC76/features/data-platform/data-set-management/ui/data-set-list-page?__sparkNavigationId=90A82E287930A234FEC3E687C94A93EA`
- 登录态：页面右上角显示“王涛”；复用用户已提供的 `领码科技 / wangtao` 测试账号。密码未写入文件或输出。
- 目标：正式目录中 `Name` 包含“功能管理”的结果为 2 条；归属“元数据管理”的 `功能管理` 行打开后，设计器目标空间 ID 为 `7AB874097A1E8711A42FD845939A6E05`。
- 空间概要：设计器显示 24 个模型、12 张数据库表、11 个字典、1 个文件资源、0 条关系；主业务模型为 `Base_NavigationInfo`。
- `Base_DataModel`：双击画布模型后打开模型定义，在“数据视图”页看到提示“请选择一个数据视图，或在当前模型下新增视图，再配置请求”；“保存视图配置”与“新增视图草稿”均不可用。没有选择或创建视图、没有保存。
- `Base_AppSystemList`：同一空间中打开模型定义后，“数据视图”页呈现相同提示；“保存视图配置”与“新增视图草稿”均不可用。没有选择或创建视图、没有保存。
- 边界：本次只通过 SPA 正式目录/设计器/DataView 读取，没有写入配置、业务数据或布局，也未修改/启动/部署 Java。以上结论仅覆盖本空间的这两个模型，不推断其余 22 个模型没有命名视图。
- 影响：D99 的 `功能管理` DataSpace 不是可直接用于全局应用目录消费者的现成 `Base_AppSystemList` owner；仓内另有 `config/pages/data-platform/data-space-catalog/pagedata.json` 的 `Base_AppSystemList@catalogApps`，但其正式 owner 属于数据空间目录场景，不能借来替代根目录/平台目录的 scope、数据范围和授权合同。

