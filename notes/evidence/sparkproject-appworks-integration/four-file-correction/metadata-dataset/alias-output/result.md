# 正式模型查询字段别名闭环

线上真实入口已越过 formid 输入过滤，但在正式字段 `items` 上被后端拒绝：请求附加的 `AsName: items` 命中保留名检查。后端正式模型本就决定输出名，因此 `DataSpaceRuntimeApi.executeQuery` 在绑定正式模型后仅映射字段源 `Name`，不再重复附加 `alias`；未绑定模型的查询路径和正式投影限制保持原样。

新增真实 DataView→owner→HTTP 请求/响应测试：验证正式源字段 `rowid`、`title`、`items` 均发送，全部不含请求 `AsName`，异名正式输出 `orderId`、`caption` 与 `items` 均被消费。同步旧重复输出字段断言。运行时另一测试的旧夹具使用缺少 `ParamName` 的 `GetInputParam`，与前一闭环的输入绑定校验冲突；它本来用于验证其他值函数的完整透传，现改用 `GetApiPublicParam`，保留该测试覆盖目标。

红测试：新增 owner 用例因请求仍含 `AsName` 失败。绿测试：包本地 `data-space-model-alias.test.ts` 和 `data-space-runtime-api.test.ts` 合计 103/103 通过；三文件精确 ESLint 通过。根 typecheck 与线上复验由主控执行，本记录不宣称线上成功。

前像及 SHA-256 见 `preimage-manifest.json`。冻结后生产文件 SHA-256 为 `E57BBD5EE4595CBB3AE0C6C75C1736A00E5C98677C3E2EAE14D9BCC8C67B153B`。未改其他生产文件，未提交或上传。
