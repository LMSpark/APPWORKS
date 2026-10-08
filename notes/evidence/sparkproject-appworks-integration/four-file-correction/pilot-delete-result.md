# 数据空间目录当前行删除闭环结果

日期：2026-10-08
本次复核修复只修改 `config/pages/data-platform/data-space-catalog/script.js` 与 `tests/runtime/page/catalog/data-space-four-file.test.ts`。`style.css` 冻结且未修改，rule/pagedata 未修改。

## 当前删除行为

- 当前行只有 `deleteActionState(row) === 'enabled'` 时显示删除按钮；处理函数再次检查当前 view、行引用、正式 ID 和删除权限。确认文案不包含名称或主键；取消、切行、页面失效及确认等待期间 DataView 查询替换均不暂存。
- 确认后经 `DataView.removeRow(id)` 暂存单行删除，只用原查询 owner 调用 `saveChanges({ views: [{ tableName: 'Base_DataSet', viewId: 'catalog', ids: [id] }] })`。只接受 `success` 且 `deletedCount === 1`；owner 校验正式 `maplistdelete` 身份回执。
- 未知结果保留 pending-delete 和共享写锁，错误提示不包含主键；无自动刷新、回滚或重发。回执确认后，末页唯一行退一页，否则刷新当前页。刷新后若当前行仍包含已删除 ID，提示“删除回执已确认，但刷新仍含原记录，回读不一致”，不会提示删除成功；普通刷新失败提示“数据空间已删除，刷新失败”。

## RED / GREEN 与审查修正

- 原删除实现 RED：工具栏没有授权删除动作（14 项通过、1 项失败）；最小实现后 15/15 通过。
- 本轮先新增“删除回执成功但刷新仍返回目标 ID”fixture 用例。RED 确认旧代码没有持久错误提示；增加刷新后的目标 ID 核验后该单项 GREEN（1/1）。
- 未知结果用例包含两条记录；暂存删除第一条后显式选择第二条，断言新增、编辑、删除 handler 都存在并逐个调用；请求仍为 1、pending-delete 保留。没有跳过缺失 handler 的条件断言。
- 确认等待期间直接执行 `view.executeFilter(undefined)` 和 `view.refresh()` 两种 DataView 查询替换；释放确认后均没有保存请求或 pending-delete。
- Fixture 通过真实 assembler、`buildPageContext` 和 query/save owner；按 `PageParam` 切片并使用总数 `Count`，保存返回 `maplistdelete`。末页唯一行删除回到第一页并检查目标不在回读列表；陈旧回读用例单独覆盖目标仍在刷新结果中的错误状态。

## 验证与冻结状态

- 最终 `pnpm run typecheck`：通过。
- 最终 `pnpm exec eslint config/pages/data-platform/data-space-catalog/script.js tests/runtime/page/catalog/data-space-four-file.test.ts`：通过。
- 最终 `pnpm exec vitest run tests/runtime/page/catalog/data-space-four-file.test.ts`：1 文件、22 项通过。
- 没有运行浏览器、后端、在线数据或真实删除。删除筛选保留尚无独立行为用例；不把其他操作的筛选用例算作删除验证。`admin` 仅作既有测试身份，不代表其他身份的线上权限验证。
- 当前状态：定向实现与本地验证通过，待主控定向复审及根回归后冻结。没有建分支、提交或推送。

## 写前字节快照

原始字节备份现已复制到计划指定位置 `notes/evidence/sparkproject-appworks-integration/four-file-correction/delete-before/`，逐文件 SHA256 与原副本相同。原先误放的 `notes/evidence/sparkproject-appworks/four-file-correction/delete-before/` 仍保留，未删除。

| 文件 | 写前 SHA256 |
| --- | --- |
| `script.js.txt` | `5CE621E3172D635E4FFAC18497F6FDB81156A9643AE937537874F92A2A854072` |
| `style.css.txt` | `A812CD9749764E3076BB550A47F78534B3E954E21EDCA17A9E80DF730C03D21B` |
| `data-space-four-file.test.ts.txt` | `AACB0708C5B9FF62A0F03B9F73042D81793A14FAD06C0D5E361D974F9F39DF80` |

当前最终文件 SHA256：`script.js` `341E7952A15769FFC42ED69878DBA5D3464C1510891BE1E574067FD5E90A4A25`；未改动的 `style.css` `9361D3F93718B75C3CAECD449E59275F7484A6E2FFC91E784D9753292C0450B0`；测试 `610857E5AFD16C0664E99676EE415C043AD3E33C2A13A2B96E1182394701DD89`。
