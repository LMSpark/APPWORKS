# Excel 导入方案目录场景

场景 `36B01771C627B9BF5CD493DC75B996A1` 引用实际服务的 `Base_Import_solution`、`Base_DataSet` 和 `Base_UserInfo`。目录使用 `solutionName`、`coding`、`dataSetId` 等正式字段；空间/创建人由命名视图提供显示标签，不复制业务数组。空间名称选项使用原 SPARK data 全页查询，每请求 500 条。

非输出的增强开关、版本及哈希字段不参与查询。方案目录与独立配置设计分别提交；工作表/字段/布局/转换规则及执行链仍须按参考专题恢复，旧设计 owner 不作为真实服务验收依据。
