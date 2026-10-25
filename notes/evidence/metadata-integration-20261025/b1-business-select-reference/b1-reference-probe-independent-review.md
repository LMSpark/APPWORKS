# B1 精确引用只读探针独立复核

**结论：探针证据在其窄 scope 内通过；没有写入。** 最终脚本 SHA256 与冻结值一致：`E3CC0077743EEF3821F43CFBEE13DFB2516BDB3111BAF9C134AF58E418D67E60`。本次只读既存脚本、结果和日志，没有重新运行脚本、连接服务或修改产品/台账。

- `b1-reference-probe-readonly-result.json` 记录 status=confirmed，12 请求含 1 次登录、预选应用/导航、正式场景文件读取、元数据 DataSet 装配及 1 次精确探针。所有业务读取绑定 `tenant-id=NewApp`、`X-AppId=D99A1DCE9894698799101EFD70F8FC76`、设计场景 `8D1AB14DD8277F3E7017CD38F77B09FD`；登录请求按正式未认证合同、应用选择按固定 FormKey 处理。
- 唯一 probe 请求为正式 `Base_DataModel` DataView 的 SPARK `GetData`：filter 精确为 `Type='字典' AND DbId='327D74EC0ABC4196AA75C56D944B8201'`，没有 `dataSetId` filter，`inputParams=[]`；输出投影只有 `rowid, Name, Type, DbId, MetaName, dataSetId`。该查询回执为 Loaded，1/1 行；命中已存在模型 `F9F01665D4A98E1FF996CD8A48D3C373`，所属 T 空间为 `944DEE5A0E5170F903E0E008172C4CD2`。脚本按正式 DataView `fieldAccess(...).read === 'visible'` 逐行核六个字段且要求字段实际存在；因此这是脚本检查与记录结果，不是从报告之外推测服务权限。
- 前后 `defaultViewBefore` 与 `defaultViewAfter` 指纹相同（过滤、queryContext、配置、原行摘要、rows/total 与 requestState）；`blockedMutations=0`。结果记录 `temporaryViewDestroyed=true`、`dataSetDestroyed=true`。请求轨迹仅含 login、正式文件读取及 GetData，没有写请求。离线 binding self-test 的日志为 14 项断言通过、exit 0；未执行 query executor 或网络。
- 三次早期失败记录保持独立，最新 `b1-reference-probe-live-binding.log/.exit` 为 exit 0；其输出含本机 Vite WebSocket 端口占用提示，但随后探针完成并记录清理状态，未导致本次确认失败。早期 helper 失败不能当作最新脚本的产品失败，也不能覆盖为零；本结论只引用最终 hash 对应的成功结果。

**范围限制：** 这是当前认证 NewApp/APP 正式 SPARK 查询可见范围内、按指定 `Type` 与 `DbId` 的单次正向命中。它证明该既有 B1 模型引用当前 T 空间，不能证明跨租户/全安装没有其他引用，也不是空结果的全局删除安全证明；不能据此核销全局引用完整性。
