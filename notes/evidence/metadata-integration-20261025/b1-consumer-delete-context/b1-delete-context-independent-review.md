# B1 删除上下文窄组独立复核

## 结论

- **Spec：通过。Quality：通过当前限定范围。** HEAD=`fe003c69da209edf488b29431e764181995ec465`。最终文件 SHA256：
  - `packages/spark-lowcode-api/src/platform/resources/dictionary/dictionary-workspace.ts` — `6B6F940BDB71E8E18B4F8521B75F1CC9484277B84E916C5A48D1D3AF8A4C9B1F`
  - `packages/spark-lowcode-api/src/platform/resources/dictionary/dictionary-workspace.test.ts` — `4D814D27C9E5836FD6BBD29F4C4770F6807E3A2E05966DE3A2F27001C98CCD9B`
- 最终源码 diff 只有 `canRemoveDefinition` 的只读上下文守卫；删除执行与保存代码没有改变。未发现新查询、权限提升、额外保存器或部分修改回归。
- 未改产品、测试、台账或证据文件；未运行测试、门禁、UI 或服务操作。

## 代码与测试

`dictionary-workspace.ts:305-309` 对 definition/entries 两个正式 DataView 和所属 DataSet 检查：DataSet/View 未销毁、`requestState === Loaded`、无 `loadingError`、refresh pending、mutation 或 unknown save。该判断只读；随后仍沿既有完整行数、字典身份、当前逐行 deleteActionState 与 draft 检查。`removeDefinition()` 仍调用同一 getter 完成整批预检，再逐行 `removeRow`；`commit()` 和 DataView 的删除保存链无 diff。因此 Idle 0/0、刷新中/失败、未知回执不会被误当作完整快照；正式 Loaded 视图仍执行原查询授权。

测试增量对拒绝状态验证没有 pending draft、没有行待删、没有 HTTP saves，并覆盖：entries `resetState()` 后拒绝；definition 独立 reset 后身份拒绝；definition 和 entries 各自真实挂起 refresh 时拒绝；一行删除权限不足时不暂存任一行；恢复 entries 为 Loaded 后合法删除可被 `workspace.load(true)` 取消且未提交。最终 GREEN 日志显示领域 101/101、runtime 143/143，退出码均为 0；有效 RED v3（不是早期断言版本）展示 5 项针对性失败，支撑该守卫修复的是可达行为缺陷而非仅结构断言。

## SPA 消费证据复核与边界

`b1-consumer-evidence-check.mjs` 的断言与生成 JSON 一致：正式新增 `Base_DataModel` 一条及 8 个正式字段，ID=`F9F01665D4A98E1FF996CD8A48D3C373`；正式目录绑定 `b1Consumer` 到该模型并配置 val/txt 与 `ordIdx ascending`。首次与排序配置 pagedata 文件回读成功，其他 tables/layout hash 未变；同一 SPA 运行期重新读取结果为 7 行，与保留字典数据逐字段比较一致；记录为 0 business writes、0 documents。它证明了当前明确操作，不证明永久删除或全局无引用。

**未完成回执必须保留为限制：** runtime observer 共记录 48 个 GET 请求，其中 47 个有 HTTP 200 / Code 200 回执；最后目录关闭时的 `2180.5413`（`clean-close-final-frozen`，Base_DataSet 查询）没有捕获响应。此前窗口出现两次 HTTP 401 后已正常重认证并在独立运行期继续；这不改变已收到的正式模型、分页结果、文件保存回执，但不能据现有记录宣称最终关闭查询也已成功回执。JSON 与只读核验脚本本身已明确计数该条 unfinished，未把 48 次都算作完成。

另有明确边界：本次没有执行永久删除，没有全局引用缺失证明；named view table preview 通过，但专用业务 select 组件消费仍是独立事项。本次窄组只修复删除前完整查询上下文判断，不应被表述为解决全局引用/级联完整性。
