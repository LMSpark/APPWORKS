状态：implementing

# D1c 主控生产拒收与原闭环修正

## 已证实问题

首轮3文件 hash 与执行回报一致，根191/2246、build通过，但真实目录报“用户查询结果缺少唯一且匹配 ROWID 的正式主键”。不验收。证据 creator-contract-rejection.json / production-rejection.png。

真实 GetData 用户响应：primaryKeyField='ID'；data={Count,Items,hasNextPage,Action}；Items 行业务字段为 rowid、ID、UserName，ID 与 rowid 值不同。权限 e 为 UserName/ID/rowid（h/m空）；不保存或输出用户值/系统凭据。

主控随后用既有授权会话调用真实 design.readModel，designScenarioId=8D1AB14DD8277F3E7017CD38F77B09FD，dataSpaceId=90A82E287930A234FEC3E687C94A93EA，metaName=Base_UserInfo：primaryKey='ID'；正式 fields ROWID/ID/UserName，name与canonicalName相同，只有ID primaryKey=true。正式 ROWID 在该响应输出为小写 rowid。因此前稿把关联键 ROWID 当权限行主键是错误前提；旧 lookup-feasibility 仅证明 context.rowKey 有效，未证明它等于 ROWID。

## 替代原 dispatch 第2/3项的用户关联实现

- 范围仍原 owner/page/test3文件，不动共享API、元数据/后端；保持D1c只读。所有修改先重读当前版本，RED最小复现再修。
- 目录 Base_DataSet 的 rowid 原验证保持。用户查询明确 fields=['ID','ROWID','UserName']，filter仍正式 ROWID in IDs，allPages=true。
- 用户权限使用 context.rowKey(row) 的正式 ID，校验非空唯一且匹配 row.ID，绝不能用业务 ROWID/rowid 当权限索引。
- 关联业务值只接受已证实 source/output 两种名 ROWID 与 rowid；有两个且规范化后不一致时明确错误，不能首项胜出。校验关联非空/标量，关联键重复不能选任意一人。不要扩成任意大小写/任意别名兼容框架。
- 权限在同一真实 rowKey 下同时检查正式 ROWID 与输出 rowid，任意一方非visible则不关联；这是为了防止正式字段与响应大小写差异绕过 h/m。ID仅私有权限定位，不能泄漏到projection/DOM；UserName继续自身fieldAccess检查，不回退原ID。
- 缺失/不可读关联标记未解析并按源可见ID计数；源createuser不可见绝不查询；既有pending/new-query发布闸门不退化。
- 真实响应形状和ID!=businessId的测试必须成为默认用户夹具，至少保留一个正式ROWID输出的验证。覆盖 h/m 在ROWID和rowid任一拼写、ID不同而权限仍正确生效、重复权限ID、重复关联ID、冲突大小写键、未解析/隐藏/迟到现有行为。不要只修改旧断言去迎合实现。

## 验证与冻结

最小实际context回归先RED→修复→GREEN；最终 root typecheck、两个定向测试文件、3文件lint、ai/dirs；保留真实stdout/exit和hash到 creator-correction-validation.log。不要跑根/包全量或build/browser，主控负责。根全量首轮结果仍是历史（修正后需按影响决定复验），不得继续宣称生产已通过。
