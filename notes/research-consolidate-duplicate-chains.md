# 重复链路收敛研读

## 范围确认

用户要求按源码诊断“一次搞定，循环迭代”。本轮只收敛四类已证实重复边界：

1. SmartBid 已发布页面身份与 PageRuntime 绑定。
2. SmartBid 页面 action 与 operation dispatch 的命令 envelope。
3. 只读 command 查询的 DataViewLocalQuery 结果与字段接纳。
4. lowcode catalog/enterprise 的响应包裹解析。

不合并：owner/receipt 已固化在 DataView 内部；草稿、递交、Agent dispatch/return、PDF journal、低代码定义会话及业务指南验证仍是不同领域协议。

## 调用链

- `content-review-target`、`content-operation-target`、`content-authoring-target`、`smart-bid-page-call` 分别检查应用、节点、工具、场景、禁传 route key，并重复绑定 session/PageRuntime。
- `smart-bid-action-source` 与 operation/page call 分别校验 JSON inputs，构造相同 `operationId/registrationId/businessInstanceId/runtimeInstanceId/requestKey/prompt/inputs` envelope。
- `data-set-command-view` 在 `readonlyRowsQueryResult` 中调用 `DataViewLocalQuery.select` 后再建立 row key、字段可读、只读动作和 identity guard；此接纳逻辑应由 local query owner 提供。
- `lowcode-catalog-api` 与 `lowcode-enterprise` 分别解包 data/Data + Items/items；catalog 额外支持 Result/result，enterprise 只接受数组。

## 影响面

- 修改面集中在 SmartBid entry/publication、spark-data command/local query、spark-lowcode-api core/catalog/platform。
- 公开行为保持不变；错误码、允许的 route policy 和响应键严格度由调用方继续提供。
- 测试覆盖相应 target、operation、command view、catalog API 与 enterprise normalization。

## 约束

- owner/receipt 不从 DataView 拉出，也不进入页面第二套执行链。
- command envelope 只规范结构、stale/cancel 和固定身份，不吸收 claim、dispatch eligibility 或业务结果语义。
- published identity helper 只收敛公共校验，不把不同页面的 scope policy 强制一致。
- lowcode response parser 通过 options 保留 caller 的严格度。

## 第二轮收敛（2026-11-21）

### 已合并

1. `DataViewArrayQuery` 的过滤、排序、分页仍由 `DataViewLocalQuery.select` 负责，只读结果构造复用 `readonlyResult`；array 增加身份 callback 与消费者 lifecycle guard，command/file owner 的默认行为不变。
2. `page-tool-file-dataview` 与 `page-tool-file-operations` 共用 basename/pageId validator；入口、动态 queryContext、目录资源和传输 target 使用同一身份约束。
3. `spark-lowcode-api` 中 19 个完全相同的普通对象 guard 统一消费 `@spark-appworks/spark-utils/isRecord`；`DataSpaceRowPermission` 接受 object 的既有行为与 AI data-entry 的 plain-prototype 校验明确保留。

### 继续分离

- file resource result 支持新增、编辑、删除及 live write policy，不与只读 result 合并。
- `DataSpaceQueryTable` 处理错误 envelope、count、primary key 和权限 metadata，不复用普通 Items parser。
- query/save/request 的业务回执与 unknown 判断仍按各 owner 独立处理。
- `claim`、Agent receipt、文件历史、发布 proof、草稿与递交恢复不是重复控制链。
