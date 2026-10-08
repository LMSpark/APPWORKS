# Copy API independent review

## Verdict

通过本轮本地实现审查；未发现当前三文件差异中的阻断缺陷。此次审查只读，没有重复运行测试。审查基准为 `copy-api-before/` 中的两份写前快照；全量未跟踪 `script.js` 不作为本轮差异判断依据。

## 复核结论

- 固定设计场景 `8D1AB14DD8277F3E7017CD38F77B09FD` 在新增设计 `pagedata.json` 中绑定两个正式模型，并配置独立命名视图；脚本以固定场景 ID 解析 DataView，缺场景时显式提示，没有 HTTP 或其他查询兜底。[pagedata.json](../../../../config/pages/data-platform/data-space-design/pagedata.json)；[script.js](../../../../config/pages/data-platform/data-space-catalog/script.js:438)
- 查询从正式 DataView owner 发出，按目录 rowid 过滤，两次均使用 `allPages: true` 并显式检查成功回执；字段视图按 `rowid:asc` 排序。DataView owner 的分页收集会检查页数、稳定 total 与 maxRows，代码符合已确认的权限上下文路径。[script.js](../../../../config/pages/data-platform/data-space-catalog/script.js:444)
- 构造文本前逐行核对必需字段的 `fieldAccess(...).read === 'visible'`、数据空间归属、正式行 ID 唯一性和字段所属模型；失败关闭，不降级为部分字段。文本 formatter 的转义、主键选择和空值回退与固定参考提交 `842dec4f11b333df904b9a4e26b6566b0802bab8` 的 `apps/appworks/src/data/api/data-set/apiInfo.ts` 语义一致。Whitespace type / PK 名称回退有直接用例。[script.js](../../../../config/pages/data-platform/data-space-catalog/script.js:388)；[data-space-four-file.test.ts](../../../../tests/runtime/page/catalog/data-space-four-file.test.ts:382)
- 三个生成常量名作为一组检查碰撞，再递增后缀；用例覆盖 `A`, `A`, `A_2`, `A_Type` 造成的普通重名与跨 `_Type` 名称碰撞，并断言输出声明名唯一。[script.js](../../../../config/pages/data-platform/data-space-catalog/script.js:357)；[data-space-four-file.test.ts](../../../../tests/runtime/page/catalog/data-space-four-file.test.ts:315)
- 复制前后都复核固定 DataSet、两视图实例、rows 引用及字段权限；页面当前行也会复核。剪贴板拒绝显示失败且可重试；成功提示只在复制 Promise 成功并通过复制后复核时显示。新增的延迟剪贴板用例覆盖设计模型结果被刷新替换和 owner scope 变化；保留的用例覆盖目录换行、页面 abort/dispose 及查询期间 scope 变化。[script.js](../../../../config/pages/data-platform/data-space-catalog/script.js:413)；[data-space-four-file.test.ts](../../../../tests/runtime/page/catalog/data-space-four-file.test.ts:469)；[data-space-four-file.test.ts](../../../../tests/runtime/page/catalog/data-space-four-file.test.ts:623)
- 写前快照对比显示本轮既有脚本改动集中于新增 formatter、读取/复核与按钮接线；测试改动增加复制行为夹具和断言，既有 CRUD 测试仍在原文件后段。执行报告记录最新样板测试 49 项、typecheck、精确 ESLint 均通过；本审查没有重跑这些命令。

## 未完成的验收边界

执行报告说明尚未保存线上设计场景/目录脚本，也没有从带 `additionalScenarioIds=8D1AB14DD8277F3E7017CD38F77B09FD` 的工具 URL 进行浏览器剪贴板验收。因此代码审查通过不代表线上入口或真实剪贴板已验收；这属于计划中的部署与人工验收门，不是当前本地差异的代码阻断。

