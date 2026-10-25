# B2 目录第一批后续修复报告

日期：2026-10-25。产品源码已冻结供主控复审。未改 Java、服务、唯一台账或运行环境；未正式生成 ClassModel，未提交或推送。此报告补充第一轮的导航、查询身份和排序修正，不覆盖原首轮报告与 hash 文件。

## 本轮修复

- **管理导航按当前宿主分支消歧。** 之前的实现对整棵导航树按原始 `item.path` 搜索并要求全局唯一，再调用 `navigateToPath`；正式导航树中同 feature path 有两个有效节点，分属两个模块分支，因此该流程把当前模块的合法目标误报为重复，且不携带正式节点身份。现在要求已解析的 system-page host、route nodeId 与 `nav.activePath` 末端一致；在 `activePath[0]` 对应的唯一根分支验证来源节点及可用祖先，只在该分支按 `resolveNavNodeRuntimeTarget` 和 `normalizeNavRuntimePath` 的合同匹配目标路径，匹配前剥离 query/hash。仅对实际唯一节点浅拷贝并更新 path，再调用 `nav.navigateTo(node)`。原 node id 由框架生成身份 marker，原 query/hash 与所选数据库正式主键 `databaseId` 保留。没有硬编码节点、跳过重复或构造伪节点。
- **查询身份在首次加载前对齐。** `LowcodeDatabaseDirectory` 的数据库视图原本已经以 `autoQuery:true` 装配；表视图页数据库 DataView 初始缺少该值，而标准 `catalogListFilter` 使用 `autoQuery:true`。修正为只给表视图数据库模型的初始查询配置附上 `autoQuery:true`，让正式 RendererFilter mount 前后的 query identity 一致。RendererForm 用例不调用测试专用 `refresh()`，实际经 DataSet 单行保存并等待回执后关闭。
- **字段排序遵循正式输出名。** 排序字段集合依据 `DataSpaceDesignApi.resolveOutputFields()` 的 `canonicalName`。只有正式 `ordIdx` 输出字段存在时才按其 canonicalName 排序，并始终以 `model.primaryKey` 作稳定键；当正式配置不输出 ordIdx 时仅按主键排序。该回退不恢复后端 `ordIdx` 自定义序，未改模型字段或放宽引用校验。
- 修正表视图源码注释中的“五表”范围和页面子组件描述，使其符合当前核心目录模型与标准字段组件实际行为。

## 反例与测试证据

| 检查 | 命令 / 证据 | 结果 |
| --- | --- | --- |
| 导航、query identity、canonicalName 排序 RED | `pnpm exec vitest run tests/runtime/page/database/database-directory-page.test.ts tests/runtime/page/database/table-and-view-page.test.ts -t "cross-module duplicate\|duplicate targets within\|source node no longer\|uses the injected navigation\|canonical output names\|same autoQuery identity\|saves a database entered through the bound RendererForm"`；`b2-entry-nav-query-sort-red.log` | 5 个有效失败（2 files；5 failed / 2 passed / 42 skipped）：跨模块同 path 没有选择当前分支节点、撤销来源仍可通行、排序使用 alias 失败、表视图初始 queryConfig 缺 autoQuery。此日志仅是修复前反例；它不代表页面当前仍失败。 |
| 真实导航宿主 | `pnpm exec vitest run tests/runtime/page/database/database-directory-page.test.ts -t "real useNavigation and DynamicRouter" --reporter=dot`；`b2-entry-real-nav-check.log` | 1/1 通过。真实 `useNavigation` + `DynamicRouter` 中跨模块重复 path 选择当前分支 owner；验证 router marker 等于目标 node id、query 携带 `databaseId=DB1`、解析后的 `nodeId`/`blueprintScenarioId` 为所选 owner 且为新的 system-page instance。 |
| 当前最终聚焦回归 | `pnpm exec vitest run tests/runtime/page/database/database-directory-page.test.ts tests/runtime/page/database/table-and-view-page.test.ts -t "real useNavigation\|cross-module duplicate\|duplicate targets within\|source node no longer\|refuses navigation for\|current source node\|injected navigation context\|canonical output names\|same autoQuery identity\|saves a database entered through the bound RendererForm" --reporter=dot`；`b2-entry-followup-focused-final.log/.exit` | 退出 0；2 files，12 passed / 42 skipped。包含跨分支重复成功、同分支重复拒绝、来源节点撤销/不可用和身份不一致拒绝、真实导航实例身份、别名排序、autoQuery 稳定及无额外 refresh 的真实 RendererForm 保存。 |
| 数据库目录、服务页、页面注册、系统页身份受影响套件 | `pnpm exec vitest run tests/runtime/page/database tests/runtime/page/runtime/system-page-dirty.test.ts tests/runtime/auth-nav/data-space/lowcode-data-space-catalog.test.ts tests/app/config/vue-page-registry.test.ts --reporter=dot`；`b2-entry-followup-suite-final.log/.exit` | 退出 1；16 files，191 tests，188 passed / 3 failed。全部 3 个失败仍为 `table-and-view-page.test.ts` 中既有关系 RED3（关系表单绑定、关系编辑 overlay 写回、既有 editing value）；其余 188 项通过。本轮未修改关系实现、关系失败断言或 skip。此宽套件运行时源码修复已全部落地；随后只有测试类型注解和移除同步函数前的无效 `await`，没有改变产品行为。 |
| TypeScript | `pnpm run typecheck`；`b2-entry-followup-typecheck.log/.exit` | 最终运行退出 0。之前一轮曾报测试 fixture 的导航类型、DOM `DataView` 类型名冲突和可选排序属性类型错误；修正后重跑成功。第一次失败输出被同名成功日志覆盖，因此历史失败只保留在本对话工具输出，不把被覆盖日志称为原始证据。 |
| Scoped ESLint | `pnpm exec eslint --cache [本轮受影响的数据库 owner、页面及测试文件]`；最终 `b2-entry-followup-eslint-final2.log/.exit` | 退出 0。曾有同步 `navigateTo` 前误用 `await` 的 lint 失败，已移除并在最终日志通过。早期同名 log 被重跑覆盖，不作为 RED 证据。 |
| Diff whitespace | `git diff --check`；`b2-entry-followup-diff-check.log/.exit` | 退出 0；仅有仓库 LF/CRLF 提示，没有 whitespace error。 |

查询 identity 的源码及用例观测见 `b2-entry-query-identity-observation.json`。正式导航探针和正式字段 `ordIdx IsOutput=0` 的原始证据继续见 `b2-database-navigation-probe-v3-result.json`、`b2-entry-table-sort-read.json`。没有在测试中额外 refresh 来掩盖 renderer 挂载后的 query identity 变化。

## 本轮边界与后续

- 原报告的首轮完成记录、唯一台账和其余证据保持原位置；此轮不改唯一台账。正式 ClassModel 生成尚未运行；新增/删除公开面仍待主控生成刷新。正式生成、独立 SPA 烟测及工程门禁由主控安排。
- 关系 RED3 仍未解决。旧 `/DataBaseManage/TableAndView` URL alias、数据库编辑/删除、连接测试和批量登记仍非本批交付；本轮不扩展这些功能。
- 对当前修改文件的 SHA256 清单见 `b2-entry-followup-freeze-sha256.txt`。删除文件无法提供当前内容哈希，在清单说明中另列。清单排除此前已处于 modified、但本轮未触碰的 `notes/data-space-retirement-ledger.md`。
