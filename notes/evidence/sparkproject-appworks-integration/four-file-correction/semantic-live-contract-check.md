# 当前正式设计合同只读核实

2026-10-08，主控通过本地 5273 当前宿主、已授权 admin 会话读取；未保存业务数据或配置。浏览器 tab 4，测试空间 `97DCB03F75AADEAE6B102B062DB71CEA` 成功装载，当前仍为已部署旧只读设计页及参数编辑入口。测试空间仍显示无输入参数、布局文件不存在。

调用本仓实际 `lowcodeApi.dataSpace.design.readModel`，两个请求均使用 designScenarioId=dataSpaceId=`8D1AB14DD8277F3E7017CD38F77B09FD`，metaName 分别为 `Base_DataModel` / `Base_DataModel_Field`。两者均返回成功；不是新增模型，也不是读取试验空间的业务数据。

| 正式模型 | ID | 正式主键 | 本轮恢复直接有关的输出字段及原始类型 |
| --- | --- | --- | --- |
| Base_DataModel | 8D1AB14DD8277F3E7017CD38F77B09FDp001 | rowid | Name、MetaName、description、Filter、RequestComplete、OutputType、cacheType、selfType、topValue、parentField、hasChildField、requestType、DbId、DbName、PId、JoinType、ForeignKeyFields、JoinFilter、addApi、updateApi、deleteApi、PrimaryKeyFields 均 VARCHAR；IsBusiness、IsBusinessMain、DISTINCT 为 INT；items 为 TEXT |
| Base_DataModel_Field | 8D1AB14DD8277F3E7017CD38F77B09FDp002 | rowid | Name、AsName、description、FieldType、type、Value、ValueFun、Expression、OrderType 为 VARCHAR；IsOutput、IsPKey、Group、Order、DISTINCT、allowAIAdd 为 INT；dataSetId/dataModelId 为 VARCHAR |

返回分别为 39 / 29 个正式字段，以上仅列任务相关字段，未删除其余正式定义。Name 与 MetaName 是两个独立输出；字段类别是小写 `type`。所有返回字段 output=true，只有 rowid primaryKey=true。这证明当前读取合同和正式字段类型，不证明某一业务行允许编辑，也不证明改名的下游引用已处理。

实施必须按当前行 DataView 权限判断，测试 fixture 应反映这些正式类型，尤其不要把 INT 类型 IsOutput/业务标记默认为 boolean。Source/type 相关产品取值仍须对照原业务合同与当前回执。

## 同轮六类来源只读查询摘要

主控同轮曾以实际 DataSpaceRuntime.query、固定设计场景逐来源取第 1 页/1 行（浏览器会话中的 semanticSourceProbe）。以下补记已有结果，未重发查询、未写数据：

| 来源模型 | 成功 | 服务端 total | context.rowKey 可用 | 当前 keyed fieldAccess 的名称读态 |
| --- | --- | --- | --- | --- |
| View_TblList | 是 | 1188 | 否 | invisible |
| View_ViewList | 是 | 134 | 否 | invisible |
| _Base_DictType | 是 | 346 | 是 | visible |
| Base_DataServiceInterface | 是 | 86 | 是 | visible |
| Base_JsonData | 是 | 11 | 是 | visible |
| Base_DataViewList | 是 | 16 | 是 | visible |

每种均返回 1 行和 total；不把历史数量视为下次查询不变量。两种数据库来源虽然返回名为 rowid 的列，正式查询上下文仍没有可用主键；不能据此构造主键或把 keyed access 的 invisible 当作后端明确隐藏了名称。需要原行只读权限访问才能继续作正确判断。四种非数据库候选已经证明当前 runtime 查询可达；前次 semantic-source-api-decision.md 中“能否用 runtime 查询待核”在这个范围已解除，但字段读取、编辑权限和真实建模保存尚未验证。
