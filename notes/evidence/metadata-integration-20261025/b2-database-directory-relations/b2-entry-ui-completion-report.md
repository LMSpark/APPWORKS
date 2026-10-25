# B2 目录第一批完成报告

日期：2026-10-25。当前冻结快照供主控复审；没有修改 Java、实际服务、浏览器或唯一台账，没有生成 ClassModel，没有提交或推送。

## 本批实际完成

- 将 `/dbms` 和蓝图数据库目录路径 `/DataBaseManage/DataBaseManage/index` 直接注册到原生页面 `src/views/DataBaseManage/DataBaseManage/index.vue`。删除旧 Hub 与 context，未增加 `/DataBaseManage/TableAndView` 的虚假 owner/alias。`/dbms` 当前承担真实数据库列表；表视图管理使用当前导航树中的唯一 feature 节点，旧 host alias 仍属后续范围。
- 新目录通过 `LowcodeDatabaseDirectory` 装配本页正式 `Base_serverInfo` 与 `_base_dbInfo` 两个 DataView；分页请求 `pageSize=20/allPages=false`。列表无隐式服务器过滤。服务器选择只作为原单行新增的明确前置条件，服务器注册/连接测试仍留在独立服务器页。仅附加库名查询命令视图，没有附加表/视图登记命令视图。
- 数据库单行新增仍用原 DataView/DataSet helper、原行引用和原保存回执/未知结果保护。服务器必须处于当前 Loaded 无错误/无 mutation/无未确认提交状态，服务器名与类型字段须可读且非空；不再默认 MYSQL。取消丢弃本次新增；未知结果阻止取消/重复新增，保存通过原 DataSet 入口核验单个目标。
- 表视图页以 `dbView.primaryKey` 构造 DataView 查询过滤；空值、多值和未唯一命中明确报错。目录页导航只用真实 DataView 主键，并检查目标节点唯一性、节点/祖先可用性；`useNav()` 在 setup 中取值，实际注入测试通过。路径原有 query/hash 保留，databaseId 使用选中行正式主键写入。
- 数据目录 page dirty source 检查所有 DataView 的 editing、dirty、mutating 和未确认保存状态；异步新增与未登记库名查询返回后检查原 DataSet、原视图和 action generation，旧页销毁后的迟到结果不会写入替换页。
- 将旧 I5 计划标记 superseded，并在 I5 总研读、Hub/entry/identity/table-and-view 相关研读顶部说明历史方案已过时、原文仅保留作历史且唯一当前依据指向台账 B2 节。正文和原始证据保留。源码中“五表/full 档”注释同步纠正。

主要文件：新增 `src/lowcode/resources/database/lowcode-database-directory.ts`、`src/views/DataBaseManage/DataBaseManage/index.vue`、`tests/runtime/page/database/database-directory-page.test.ts`；调整目录导航、database DataSet owner、单行新增 helper、表视图路由过滤、服务页身份接线及相关测试；删除 `database-management-hub.vue`、`database-catalog-context.ts` 和旧 Hub/context、档位/缓存、旧目录新增测试。具体工作树文件以 `git status --short` 为准；既有 `notes/data-space-retirement-ledger.md` modified 状态属交接前工作，本批没有改动它。

## 验证

最终受影响套件命令：

```text
pnpm exec vitest run tests/runtime/page/database tests/runtime/page/runtime/system-page-dirty.test.ts tests/runtime/auth-nav/data-space/lowcode-data-space-catalog.test.ts tests/app/config/vue-page-registry.test.ts --reporter=verbose
```

日志：`node_modules/.cache/metadata-integration-20261025/b2-entry-database-suite-final2.log`；退出码：1；16 个文件、175 项测试，172 pass、3 fail。3 项失败仅为现有关系 RED3，均在 `tests/runtime/page/database/table-and-view-page.test.ts` 的关系字段绑定/关系编辑 overlay/既有 editing value 用例；按 brief 保留，未改关系实现、未删 skip、未调断言。其余受影响数据库、目录、页面注册、系统页身份、服务器页测试全部通过。

新增单行新增、取消、命令视图、未知保存保护与目录页 dirty/navigation/迟到结果聚焦命令：

```text
pnpm exec vitest run tests/runtime/page/database/database-catalog-db-view-ops.test.ts tests/runtime/page/database/database-directory-page.test.ts --reporter=verbose
```

日志：`node_modules/.cache/metadata-integration-20261025/b2-entry-unknown-protection-final.log`；退出码：0；2 个文件、15 项测试全部通过。

覆盖边界：当前聚焦用例尚未提供服务器 DataView `requestState` 非 Loaded / 查询失效及服务器字段 `fieldAccess` 不可读的拒绝反例；本报告不将其描述为已验证拒绝路径，留给主控复审后决定是否补测。现有实现仍要求服务器 Loaded、无错误/未确认状态，并检查 `ServerName`/`Type` 可读且非空。

其他测试运行记录（包括早期草稿 RED 和测试夹具/断言修正）保留在同目录；早期 `directory-page-red` 的唯一失败是测试把请求全部 JSON 中出现的合法 `serverId` 字段误判成筛选，之后改为只断言 `Table[].Filter`/分页输入；`directory-owner-red` 文件名虽含 red，实际退出码 0、2/2 通过。最终结果以 `database-suite-final2` 与 `unknown-protection-final` 为准。

```text
pnpm run typecheck
log: b2-entry-typecheck-final3.log
exit: 0

pnpm exec eslint --cache [本批数据库 owner、页面、registry 与受影响测试文件]
log: b2-entry-eslint-final4.log
exit: 0

git diff --check
log: b2-entry-diff-check-final.log
exit: 0
```

旧接口/候选回退搜索：

```text
rg -n "database-management-hub|database-catalog-context|/DataBaseManage/TableAndView|DatabaseUnregisteredNames|collectDatabaseCatalogScenarioCandidates|resolveDatabaseCatalogScenarioTiered" src config tests
```

日志：`b2-entry-ui-no-retired-search.log`；rg 退出码 1，表示 0 命中。

## 保留缺口与边界

- 关系 RED3 留给下一组，不在本批实现或清理。
- 旧 `/DataBaseManage/TableAndView` host alias 未映射；当前管理跳转只使用导航树中已存在的 feature 节点路径及真实 databaseId。数据库编辑/删除、连接测试、批量注册等不属于第一批交付；本批不代表完整 B2 完成。
- 正式 ClassModel 目录/概要/指南沿用主控已核的 `b2-entry-contract-query.json` 与 `b2-entry-contract-query-v2.log/.exit`。本批新增 `LowcodeDatabaseDirectory` 公共类/方法并删除候选函数与类型，但未运行正式 ClassModel 生成；新增及删除的公开面待主控生成刷新。
- 主控负责冻结后独立复审、实际 SPA 验收、关系组、正式生成与工程门禁。

## 冻结 SHA256

`node_modules/.cache/metadata-integration-20261025/b2-entry-ui-freeze-sha256.txt` 保存当前所有改动且仍存在的 tracked/untracked 文件的 SHA256（不含交接前已 modified 且本批未触碰的唯一台账）。删除文件无当前内容 hash；删除名单见上文与工作树状态。
