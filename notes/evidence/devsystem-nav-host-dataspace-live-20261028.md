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

- 同一预览器点击“查询”后，SPA 状态持续显示“正在查询…”；结果区仍显示“尚未取得有效查询结果”和“暂无数据”。
- 关闭预览后，`Base_DataModel@default` 面板仍显示“正在读取当前模型字段…”。浏览器控制台 error/warn 列表为空。
- 因此此证据只支持“正式视图定义已保存并由设计器回读”；不支持查询成功、完整集合实际读取、结果权限、候选项可用或跨 DataSet 绑定可用。
- 未继续创建 `Base_DataModel`、`Base_DataModel_Field` 视图，未添加级联，未修改 `Base_Navigation_DataRelation` 或任何业务行。

## 后续验证门槛

查询完成并取得真实 DataView 回执后，才补齐模型与字段选项视图、过滤级联和 DevSystem 标准绑定消费。`90A82...` 是元数据平台设计空间，不是静态 root `/app-list` 的正式 owner，也不能证明它的服务端 scope 可用于其他应用。
