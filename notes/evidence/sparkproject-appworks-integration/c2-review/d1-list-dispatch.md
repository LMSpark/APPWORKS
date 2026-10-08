# D1 目录只读列表候选派工

状态：draft（待主控裁决；不是实现状态）

依赖状态：C2a 已验收；C2c 实施中。本候选不改动两者范围。

## 目标和边界

增加一个可从正式系统页打开的 `Base_DataSet` 只读列表闭环：当前已验证 node 的 `route.meta.blueprintScenarioId` 是 query 的 `scenarioId`；URL 上同名 `scenarioId` 仍是独立业务 query，不能作为目录场景回退。query 的执行应用来自 `lowcodeApi.readRequestScope()`；行的 `sysid` 是被管理数据空间的业务归属，两者单独传递，不得用 `X-AppId` 推导 `sysid`。不新增后端 API、不发送写请求。本项不接 CRUD、应用 options/creator hydration、设计器、API复制、绑定查询或授权编辑，不宣称 D1 全部实现。C2a 已验收；C2c 实施中。

当前只读探测已从真实“数据空间管理” node 验证 `blueprintScenarioId=90A82E287930A234FEC3E687C94A93EA` 可查询 `Base_DataSet`；目标是该已验证 owner，URL query `scenarioId` 仍独立，绝不作 fallback。正式系统页身份由 C2a 提供，本项不再实现第二套 node/app 授权。

## 精确候选文件

1. 新增 `src/lowcode/data-space/lowcode-data-space-catalog.ts`：应用层只读 owner，依赖现有 `lowcodeApi.dataSpace.runtime.query`，接收已验证蓝图场景、分页、名称；不传 `sysid`；返回只读行及明确分页状态，不绕过 runtime/context/scope。
2. 新增 `src/views/app/control/data-platform/data-space/catalog/DataSpaceCatalogPage.vue`：正式列表视图，读取当前已验证路由 meta 场景，调用 owner；有加载、空列表、配置缺失、查询失败、总数缺失状态。只呈现名称搜索和分页；不提供 sysid/app selector。首切片显式投影 rowid、Name、Type、description、sysid、createuser、createtime，并由 context 为每行每字段决定显示/遮罩/隐藏；不渲染可伪装可用的新增/编辑/删除/设计操作。
3. 修改 `config/navigation/vue-pages.json`：为 `/features/data-platform/data-set-management/ui/data-set-list-page` 注册真实 Vue source/component 映射，沿现有静态 componentMap 接线，不另改 DynamicRouter。
4. 新增 `tests/runtime/auth-nav/data-space/lowcode-data-space-catalog.test.ts`：聚焦 owner/UI 的真实只读行为；不发真实后端请求。

## 查询和结果合同

以 runtime 当前类型为准：`DataSpaceQueryIdentity={scenarioId,metaName}`；`DataSpaceQueryOptions` 的 `filter` 是 `spark-data` 的 `DataViewFilter | null`，`sort` 元素为 `{field,direction:'asc'|'desc'}`，`page` 为 `{index,size}`（页码从 1 起，size 正整数且 <=1000）。候选请求固定 `metaName:'Base_DataSet'`、`sort:[{field:'createtime',direction:'desc'}]`、`page`；名称 trim 后按参考语义构造 `(Name contains name OR rowid eq name)`，本首切片不附 `sysid` 条件：当前正式系统页没有业务筛选入口，只展示当前已选执行 app scope 下 API 返回的行。未绑定时不能把空选中值变成过滤；更不能将执行 `X-AppId` 当 `sysid`。

`DataSpaceRuntimeApi.query` 返回 `DataSpaceQueryContext`，不是参考 owner 的 `{list,total,queryContext}`。列表消费 `rows`、`total`、`countReported`、`rowKey(row)` 及每个展示字段的 `fieldAccess(rowKey,field)`。Context 对合法且唯一 rowKey、未返回 `lingma_sys_params` 的行使用 `DataSpaceMissingAuthPolicy` 默认值 `allow`；本 `DataSpaceQueryResource` 构造 context 时未传策略覆盖，因此不能将其概括成“缺权限一律拒绝”。有权限快照时依 `h/m/e/r` 返回 `invisible/masked/visible` 与写状态；缺失/重复 rowKey 无法建立唯一 permission entry，`fieldAccess` 才返回 `read=invisible`、`write=denied`。不要改底层策略。`context.rows` 只移除 `lingma_sys_key`、`lingma_sys_params`，不会替 UI 隐藏或脱敏业务字段。页面必须按 rowKey+fieldAccess 投影每个单元格：visible 才能呈现原值，masked 必须用固定遮罩，invisible 不输出原值；受限原值不得进入文本、title/tooltip、属性、可访问标签或导出。分页查询若后端没有合法非负整数总数会由 runtime 显式失败，UI 不得把当前页长度当 total，也不把错误解释为“暂无数据”。

主键必须区分两层：context 的 `rowKey(row)` 来自后端 `primaryKeyField` 或查询表 `PrimaryKeyFields`，不会从 `id`/`rowid` 猜；正式模型绑定也会校验模型主键与查询主键一致。固定参考 `Base_DataSet` 以 `rowid` 表示目录身份，且当前只读探测已在目标场景正式模型确认 `primaryKey=rowid`，page 1/2 各 5 行且 rowKey 均存在、同页唯一并等于 rowid。正式模型存在若干同 canonicalName 的重复字段声明，本闭环只投影已确认输出字段，不以 UI 清理/规整后端模型。D1 页面不做写操作；结果若缺 `rowid` 或同页重复，应显示数据契约错误而非生成替代 key。若后续要以 `rowid` 作为表格 key/CRUD 身份，先确认当前正式 model primary key 与 rowid 同一且唯一；不可把 `context.rowKey` 静默换成 `rowid`。当前只读页也不得绕过权限投影直接把 `rows` 整行传给表格自动列/JSON/导出；字段集合要显式列明，并通过 `rowKey(row)` 与 `fieldAccess(rowKey, field)` 决定值呈现。

执行域来自 `lowcodeApi.readRequestScope()`：需要有效 session、tenant、明确选择的 app，且 `X-AppId` 是请求应用身份；没有 scope 是错误态而非空列表。`sysid` 是 `Base_DataSet` 行归属，不是执行 scope。本第一切片不提供业务 sysid 输入，也不附该条件；不把 `X-AppId` 复制到 sysid。后续实现宿主绑定/selector 时须单独遵从 host binding 合同。

## 最小实现行为与验证

- 初次进入：从 `route.meta.blueprintScenarioId` 读取场景；不读 query 的 `scenarioId` 作 fallback；显示当前请求 app scope 下 `Base_DataSet` 列表。
- 搜索、分页：按上述 filter/sort/page 发 runtime query，显示服务端 total；明确区分空结果、缺配置、scope 失效、分页总数缺失和查询失败。
- 请求代次：新查询、路由 owner 变化或请求 scope 变化后，先前请求的成功和失败都不能覆盖当前 rows、total、error/loading。runtime 会在请求前后校验自己的 token scope；页面/owner 仍需保证不同输入的旧成功不覆盖新查询。不得由列表代码自行构造身份或权限。
- 最小测试：断言空/非空 name 的过滤树形状、rowid 精确 OR、createtime desc 及 page；明确首切片 query 不附 sysid 条件且不会由 request X-AppId 推导 sysid；蓝图 meta 场景作为请求 identity，而 URL query scenarioId 不参与 identity；请求 scope app 与 sysid 独立；分页缺总数和 query 异常可见；旧成功/旧失败不改写较新查询状态；缺/重复 rowid 明确错误。测试文件必须覆盖新 Vue 组件的呈现路径，并以真实 `DataSpaceQueryContext` 权限快照验收 visible/masked/invisible 三种展示；DOM、title/tooltip、属性、可访问文本和任何导出模型均不得暴露 masked/invisible 原始值。覆盖无 auth 快照且 rowKey 唯一时遵从 runtime 默认 allow；缺失或重复 rowKey 的字段访问为 denied/invisible。列元数据使用的 fieldName 必须与后端权限字段标识一致，不能只凭 UI label 推导；需要验证传入 `fieldAccess` 的实际 field key。不得修改 `DataSpaceRowPermission` 策略。测试只验证应用层投影和状态发布，不代替后端真实注册场景、字段和授权验收。
- 完成该小闭环后只可称“目录列表可打开/可读（按当前 query scope）”。CRUD 必须另做每项最小保存+回读验证；授权页面、数据空间设计保存和多应用 selector 均不在此声明内。

## 当前页面构件复用

本仓没有可直接复用的参考项目 `ListPageShell`。本仓 `src/views/app/DBMS.vue` 已用本地 Element Plus / 原生 `<table>` 组织表格和状态区域；新页可采用已安装的 `el-form`/`el-input`、`el-table`、`el-pagination` 形成当前页面风格，但不搬运参考项目 `SchemaForm` 封装。列表页不需要空的 CRUD 表单，也不应将参考页有写能力的按钮照搬过来。

## 当前后端只读验证仍需补齐

代码合同说明 runtime 会消费其收到的权限快照，但不证明目标环境实际返回权限快照或任何特定字段授权。只读验证必须在当前正式场景、当前登录租户和所选执行 app 下确认：管理员样本已证明本场景能查询 `Base_DataSet`、分页总数 1184（两页各 5 行且 key 唯一）、按 `createtime desc` 页查和 `Name contains OR rowid eq` 命中；正式模型确认 rowid 主键和七个输出字段。该证据来自 `c2-review/d1-live-query.json`，没有保留行值。尚未证明受限用户下 `lingma_sys_params` 的 `r/e/h/m/d/c`、masked/invisible 的字段是否存在及实际展示效果；管理员所有字段 visible 不能证明受限权限行为。此缺口由新增组件测试覆盖权限投影，真实受限账号只读验证仍需另行安排；runtime 默认 allow 不被 D1 覆盖。不能以模拟测试替代此验证，也不能为了“安全默认”在 D1 临时覆盖 runtime policy。验证过程仅读，不发 save/CRUD 请求。

## 已解决事实与下一切片

当前只读证据已解决目录场景、Base_DataSet 正式主键、固定字段投影以及样本分页/搜索合同。仍未完成的是受限身份权限字段行为的现场验证；管理员只读样本全 visible 不可替代该验证，不能因此跳过组件权限呈现测试。

固定参考 `apps/appworks/src/ui/features/application/application-scope/model/application-scope-binding.ts` 的语义为：宿主 contexts 为空时 boundAppId 为空、selectedAppId 初始为空，因此查询不附 `sysid`；恰有一个 host context 时，从匹配 host input 的 routeParameters.value 解析绑定，重复 context/input 会显式失败；存在唯一绑定后 sysid 查询锁定该值并隐藏 app controls。其设计目标调用也要求唯一宿主上下文，并把应用选择单独写入 host 参数；这是业务归属传递，不等同执行请求 app scope。

当前 AppWorks D1 尚无目录页/owner，也未发现将该 host-binding helper 等价接入正式系统页的实现。现有系统页 owner 校验的是授权 node 身份/blueprintScenarioId，`readRequestScope` 提供当前执行 app；这些不是 host-bound sysid。故本只读第一切片不显示 app selector、不附 sysid 条件，保留当前 API 在执行 scope 下实际返回的列表。后续业务绑定/UI selector slice 必须补齐参考的唯一 host binding 语义；若未来当前路由/宿主确实提供绑定值，不能忽略或覆盖它，须以唯一绑定值锁定 sysid；多个绑定必须失败，不能回退成无过滤全列。

如真实环境还需确认其他事项：受限账号 fieldAccess 样本；host binding 信息在目标 AppWorks 路由产品流中的正式供给方式（当前系统页无等价消费者）。以上是实现验收/后续 slice，不阻塞本只读列表最小实现，也不要求后端迁移。

