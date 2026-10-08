# D11/D14 关系页面实现结果

## 已实现

页面继续使用四文件配置与现有 DataView 编辑缓冲。关系列表展示父子正式注册名及精确关系 ID；编辑、删除只操作所选关系 ID。Filter/JoinFilter 使用现有 DataSpaceFilterEditor wire codec，并要求当前 contextKey、原始值及 valid 回执匹配。关系字段按实际变化逐字段检查读写/必填权限；只允许删除的关系可以进入删除操作，编辑和保存保持禁用。Join 归属使用父模型正式 Name；其他父的配置不被关系操作覆写。删除当前父拥有的最后一条父子关系时，同批清空 JoinType、ForeignKeyFields、JoinFilter、PId，并精确回读完整模型投影；仍有同父子关系或归属其他父时保留配置。无法读取其他边端点时按存在其他边保守保留。

保存/删除在首个 stage await 前进入 busy。dispatch 前失败时只丢弃本编辑器实际 stage 的目标行；dispatch 后回执、回读或布局未确认时保留重复提交锁，取消或换选不能解除，需重新加载正式数据。回执逐项匹配 tableName/viewId 和操作专属计数（删除用 deletedCount）。已有合法布局保留 JSON 原文扩展、节点坐标；删除精确图边后独立写入。缺失布局不创建，返回明确的“元数据已确认、布局未确认”部分结果。

新增入口仍禁用：当前公开 DataView 新行没有可核验的字段级 fieldAccess 上下文，因此页面不伪造权限或建立第二份业务草稿。

## 文件范围

- `config/pages/data-platform/data-space-design/rule.json`
- `config/pages/data-platform/data-space-design/script.js`
- `config/pages/data-platform/data-space-design/style.css`
- `tests/runtime/page/design/data-space-design-four-file.test.ts`
- 本结果及本目录下验证日志

`pagedata.json` 未变。没有触碰宿主 API 文件、在线数据、分支或提交。

## 验证

- rendered edit/delete 最小用例：`pnpm exec vitest run tests/runtime/page/design/data-space-design-four-file.test.ts -t "edits and deletes the selected relation through the rendered page"`，1 passed、45 skipped。真实 Filter OR/常量值保存读回；刷新为 delete-only 权限后编辑禁用、删除可用；关系删除按 deletedCount 确认，最后一条当前父归属 Join 同批清空；图边删除、节点/扩展属性保留且布局写入成功。日志：`relation-page-minimal.log`。
- 页面关系测试文件整套：`pnpm exec vitest run tests/runtime/page/design/data-space-design-four-file.test.ts`，46 passed。日志：`relation-page-suite.log`。该整套运行时最小用例最后一轮修正前；之后最小用例已重新通过。
- 图测试：`pnpm exec vitest run tests/runtime/page/design/data-space-design-graph.test.ts`，1 passed。日志：`relation-page-graph.log`。
- 类型检查：`pnpm exec vue-tsc --noEmit --skipLibCheck -p tsconfig.typecheck.json` 通过，日志文件为空表示无诊断：`relation-page-typecheck.log`。

## 未单独覆盖 / 交主控验收

- 新增关系仍等待正式新行字段权限合同；未宣称新增闭环完成。
- 已实现其他父归属、同父子重复关系及不可读其他端点时的 Join 保留规则，但当前没有各自独立渲染 fixture。
- 布局文件缺失、布局 writer 部分失败或保存回读未知时，页面不会自动创建/重复提交；需要主控结合宿主 API writer 一并验收部分结果提示。
- 最后一轮 changed-field ACL 收窄及清理临时错误诊断后，只重跑了最小 rendered 用例和 typecheck；关系整套及 graph 套的原始日志时间早于这两项小改动。
