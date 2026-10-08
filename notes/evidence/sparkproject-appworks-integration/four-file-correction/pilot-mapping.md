# 数据空间目录四文件试点映射

## 已读文件与边界

- 迁移纠偏研读：[notes/research-appworks-four-file-integration.md](/D:/SPARK_AppWorks/notes/research-appworks-four-file-integration.md)、总计划：[notes/plan-appworks-four-file-integration.md](/D:/SPARK_AppWorks/notes/plan-appworks-four-file-integration.md)、[knowledge/page-design.md](/D:/SPARK_AppWorks/knowledge/page-design.md)、根 [AGENTS.md](/D:/SPARK_AppWorks/AGENTS.md)。合同是 pageId 下 `rule.json`/`script.js`/`style.css`，scenarioId 下共享 `pagedata.json`。
- 当前页面：[DataSpaceCatalogPage.vue](/D:/SPARK_AppWorks/src/views/app/control/data-platform/data-space/catalog/DataSpaceCatalogPage.vue)；它以 `route.meta.blueprintScenarioId` 定位场景，保留请求 revision 和 owner scope 校验，提供名称/ID、应用筛选、清除、搜索、重置、分页、类型与应用标签、创建人解析及错误/空/加载状态。
- 当前 owner：[lowcode-data-space-catalog.ts](/D:/SPARK_AppWorks/src/lowcode/data-space/lowcode-data-space-catalog.ts)；只读查 `Base_DataSet`、`Base_UserInfo`、`Base_AppSystemList`，以 `DataViewFilter` 拼查询条件，检查 count、正式主键及字段权限，做创建人/应用投影。它直接调用 `lowcodeApi.dataSpace.runtime.query`，不是 PageRuntime 的 DataView owner，也没有新增写 API。
- 固定参考先用 `git ls-tree` 确认路径，再从 `E:\r\sparkproject` 的 `842dec4f11b333df904b9a4e26b6566b0802bab8` 读取 `apps/appworks/src/ui/features/data-platform/data-set-management/ui/data-set-list-page.vue`。参考页功能比当前目录页宽：新增/编辑/删除、设计、复制 API、查询绑定、应用范围权限及创建人提示。试点目标应明确限定为用户指定的“当前目录页查询/筛选/分页+新增”切片，不能把其余参考操作说成已覆盖。
- 本仓示例：[tests/support/fixtures/page-design-leave-request-smoke/rule.json](/D:/SPARK_AppWorks/tests/support/fixtures/page-design-leave-request-smoke/rule.json)、`script.js`、`pagedata.json`；它可证明四文件布局写法，但示例 pagedata 属旧字段形态（`schemaVersion/dataSetName/columns/rows`），不能直接作为当前 ScenarioViewConfig 合法配置。当前校验器 [scenario-view-config.ts](/D:/SPARK_AppWorks/packages/spark-project-model/src/scenario/scenario-view-config.ts) 要求 `scenarioId`、表 `modelBinding:{modelId,modelName}`、`views.default`，拒绝 columns/rows 等字段定义和运行数据。

## 最小闭环映射

| 现有动作/数据 | 四文件落点 | 证据与限制 |
|---|---|---|
| 页面容器、表格列和分页 | `rule.json`: `r-page` 包含 `r-table`，列用其 `r-*` 子组件；`r-table` 的真实 props 包括 `dataViewKey`、`showPagination`、`toolbar`、`filter`、`actions`、`border`、`stripe`、`highlightCurrentRow`、`rowKey`，分页器消费绑定 DataView 的 total/page/pageSize 并调用 DataView。 | `RendererTable.props.ts`、`RendererTable.vue`。应使用 `dataViewKey: "Catalog@default"`（若声明唯一主场景，也可局部 `Catalog@default`；完整绑定格式由真实 scenario 决定）。列需绑定正式字段；名称/类型/描述/应用/创建人/时间投影不能凭 JSON 临时造出不存在的正式列。
| 名称筛选 | `rule.json`: `r-table.props.filter` 中配置 filter 区，或嵌套 `r-filter`；其 `children` 是筛选节点数组。`r-text` 配 `field:"Name"` 默认推断 `contains`。 | `RendererFilter.types.ts`、`container-filter.ts`。同一表单直观支持名称 contains。旧逻辑还支持 rowid 精确 eq，单个常规文本过滤项不能表达 `Name contains X OR rowid eq X`，需验证现有筛选树能力如何表达 OR，或接受功能差异；禁止声称已等价。
| 应用筛选/应用下拉 | 若选项能静态列入配置，可用匹配正式字段的筛选控件；当前应用选项是运行时查 `Base_AppSystemList` 并按权限投影。 | 已读 `r-filter` 契约没有动态远程选项源 API。不能把旧 Vue owner 或任意 TS import 搬进 `script.js`；需确认当前 DataView/字段绑定可否配置合法关联下拉，不能则记为底座缺口。仅做名称/分页试点时，把应用下拉排除在首个最小闭环之外，并记录为未覆盖。
| 搜索/重置/刷新 | 可由 `r-filter` 自带 apply/reset 操作驱动其绑定 DataView；脚本最小刷新函数是 `async function refreshCatalog(){ await $page.resolveView('Catalog@default').requestData() }`。`$page.resolveView`/`getDataSet` 是受支持脚本合同；没有 Vue、router 或 lowcodeApi import。 | 单独 script 示例只适用于显式场景可解析且 view 存在的调用；不要从 `$route` 推造场景 id。配置内过滤的具体 AND/OR/分页行为仍需用真实装配和渲染验证。
| 新增 | `r-table` 的 `toolbar` 可声明 `append-row`；该 action 将新行追加到绑定 DataView 的编辑状态，表单/字段组件在视图上编辑。提交须走 `save-dataset` descriptor，显式 `scenarioId`，由当前 DataSet 保存。 | `action-types.ts` 确认 `append-row`、`save-dataset` 是受支持动作；工具栏类型为 `RToolbarProps`。真实 Base_DataSet 的 `allowAdd`、新增字段白名单、必填规则、主键字段、创建者字段以及应用关联写值必须来自真实模型/权限上下文。现有 owner 是只读的，不能作为新增 API；必须验证 DataView `append-row` + `save-dataset` 是否能满足原后端合同。若不能，报告精确缺口，不添加第二套原生 owner。
| 场景/正式模型 | `pagedata.json`：只给共享场景中的稳定 tableName、`modelBinding` 与 view 配置（分页、过滤、排序及投影字段）；DataSet/DataView 运行行由运行链加载。 | 示例形状：`{"scenarioId":"<真实场景>","tables":{"Catalog":{"modelBinding":{"modelId":"<真实模型ID>","modelName":"Base_DataSet"},"views":{"default":{"page":1,"pageSize":10,"sortExpression":[{"field":"createtime","direction":"desc"}]}}}}}`。尖括号值是占位说明，不能落盘；真实 modelId、scenarioId、正式字段 projection 由主控只读确认。现有 `LowcodeDataSpaceCatalog` 查询跨 3 个模型，`Base_UserInfo`/`Base_AppSystemList` 是否配置为同场景模型尚无证据。
| 样式 | `style.css` 仅覆盖四文件页面自身容器/间距/列布局。 | 参考 Vue scoped CSS 的变量可以作为视觉参考，不应带入 scoped Vue 生命周期或组件 wrapper。

## 可执行片段（仅作组件/脚本契约示例）

```json
{
  "type": "r-page",
  "id": "data-space-catalog",
  "children": [
    {
      "type": "r-table",
      "id": "catalog-table",
      "props": {
        "dataViewKey": "Catalog@default",
        "highlightCurrentRow": true,
        "showPagination": true,
        "filter": {
          "children": [
            { "type": "r-text", "id": "name-filter", "props": { "field": "Name", "label": "名称或 ID" } }
          ]
        },
        "toolbar": {
          "children": [
            { "type": "r-button", "id": "add-row", "props": { "label": "新增", "action": "append-row", "dataViewKey": "Catalog@default", "appendPayload": { "Type": "datasource" } } },
            { "type": "r-button", "id": "save-rows", "props": { "label": "保存" }, "on": { "click": { "action": "save-dataset", "scenarioId": "<真实场景ID>" } } }
          ]
        }
      },
      "children": [
        { "type": "r-text", "id": "catalog-name", "props": { "dataField": "Name", "label": "名称" } }
      ]
    }
  ]
}
```

这是按 `r-table`/ActionDescriptor contracts 组合的最小候选片段，不是已通过当前配置校验器和模型装配的成品。上面“新增”只有在真实 model 的 `Type` 可写且 append/save 权限允许时成立；`r-text` 列字段组件的 `dataField`/列模式还需按具体字段组件 props 核对后确定。不得复制尖括号 ID。`RendererToolbar.vue` 确认工具栏 children 会渲染，`RButtonProps` 确认 append-row 是按钮内置动作；`on.click` 使用 ActionDescriptor。字段列 props 仍需按具体字段组件 props 核对。

script.js 可执行的框架无关刷新入口：

```js
async function refreshCatalog() {
  const view = $page.resolveView('Catalog@default')
  if (!view) throw new Error('Catalog@default 未装配')
  await view.requestData()
}
```

该脚本不应重写列表查询或自行 fetch；筛选由 DataView filterExpression 驱动，新增/保存由 action executor 驱动。仅名称 contains 可由 `r-text` 推断；名称 OR rowid、应用选项动态来源、创建人及应用标签投影仍是待验证差距。

## 精确建议的验证文件

- 目标行为最终应新增/改造到 `tests/runtime/auth-nav/data-space/lowcode-data-space-catalog.test.ts` 对应配置运行验收，但当前该文件针对原生 Vue page/owner，不能单独证明四文件迁移；迁移前应保留其中已存在的数据权限、分页总数、创建人关联断言，不把它报告为新管线通过。
- 正式 renderer/绑定：`tests/runtime/page/spark-page-renderer-binding.test.ts`（PageRuntime + SparkPageRenderer 绑定、脚本函数/组件动作接线）。
- DataView 查询运行线：`tests/runtime/auth-nav/lowcode-data-space-runtime.test.ts`（真实查询上下文、分页/过滤/权限输入）。
- 新增/保存动作执行语义：`tests/runtime/data-view/dataview-crud-bridge.test.ts`（CRUD bridge）；场景保存仍需在正式 DataSet save path 对应测试中补覆盖。
- 多调用隔离：`tests/runtime/page/runtime/page-runtime-tabs.test.ts`（独立 runtime/scenario 与释放边界）。只在实际实现形成闭环后运行聚焦测试；本次只读研究未运行测试。

## 尚未证实，必须由主控补查

1. 当前有效入口真实 pageId、正式 scenarioId、目标蓝图绑定及场景文件现值；这里不填虚构身份。
2. Base_DataSet 正式 modelId/modelName、字段访问/新增权限与 CRUD 保存能力；旧 owner 当前只有查询，并直接走 runtime query API。
3. 当前 DataView renderer field projection 如何实现 rowid、Type label、description、sysid→应用名、createuser→Base_UserInfo.UserName；是否已有跨模型可配置关联/值函数。
4. 应用下拉动态查询、名称 contains 与 rowid eq 的 OR 组合能否在现有 r-filter 组件表达。
5. Toolbar 子节点结构和 `r-button` 的实际 props 是否允许上面候选 JSON。该片段展示了 descriptor 合同，不可越过实际 props/schema/renderer 证据。

本轮只读源码和指定固定提交，未运行测试/构建、未触碰 browser/backend、未修改生产/测试/配置文件；仅新增本报告。


## 只读补核：live contract、选择项、过滤脚本与 DataView 权限

主控证据文件 [pilot-live-contract.json](/D:/SPARK_AppWorks/notes/evidence/sparkproject-appworks-integration/four-file-correction/pilot-live-contract.json) 显示 `90A82E287930A234FEC3E687C94A93EAp000` 的三个 page tool 文件均 404；当前导航仍为 `target: vue:`。文件列出了 Base_DataSet、Base_AppSystemList、Base_UserInfo 等模型身份，但没有三工具正文可据以转换。Base_DataSet 输出字段存在重复（如 `Name`、`description`、`createuser`、`createtime`、`sysid`、`Type` 等重复 canonicalName）；真实装配 [lowcode-data-space-assembler.ts](/D:/SPARK_AppWorks/src/lowcode/data-space/lowcode-data-space-assembler.ts) 明确拒绝输出名重复，主控实测 `loadLowcodeRuntimeScenario` 报“模型输出字段重复: Base_DataSet”。这是当前场景装配的实证阻塞；不得通过删字段/改模型绑定来伪造页面可运行。

### `r-select` 远程候选与 DataView 列

- 注册表把 `r-select` 注册为 `FieldSelect`。其 props 是 `SparkOptionFieldProps`，除常规字段 `field`/label 外支持 `optionDataViewKey`、`optionDataMember`、`optionDataField`、`optionLabelField`、`optionValueField`。共享选项解析器通过 `$page` 所在 PAGE_RUNTIME 执行 `runtime.resolveView(optionDataViewKey)`，默认取 `rows`，默认 label/value 字段分别取 DataView.labelField/primaryKey；故现有正式 Base_AppSystemList 可配置为独立场景表（例如稳定表名 `Applications`），候选引用可写 `optionDataViewKey:"Applications@default"`、`optionLabelField:"AppDesc"`、`optionValueField:"rowid"`。这样数据源走 PageRuntime/DataView，满足动态选项来源；它不会自动实现旧 owner 的 `AppDesc` 空值时回退 `AppName` 逻辑，需配置一个已有的合法投影/字段能力或接受标签差异。此配置仍须等真实 scenario/model binding 证实后应用。
- `r-select` 自身 `field:"sysid"` 是宿主业务字段绑定。用于筛选面板时，RendererFilter 会把子节点 `field` 当过滤目标，单值默认 `eq`；但 `r-select` 的字段控件自身也由 FieldContextRenderer 消费字段写权限。把它放进 filter panel 是否正确处于 filterModel 的呈现路径、是否与编辑权限互相影响，要用 renderer 测试确认；已读 `useFilterPanel` 代码识别节点 `type/field` 并为面板生成受控输入，不能凭静态 props 就宣称端到端成立。
- `r-table` 子列的准确字段键是 `r-text.props.field`，不是 `dataField`；`r-text` 从 `SparkFieldSemanticProps` 继承 `field`。节点 label 是 `SparkNodeProps` 的字段标签。候选列写法为 `{type:"r-text",props:{field:"Name",label:"名称"}}`。宽度/可拖列配置使用 `width`/`resizable`。不能把旧 Vue 的 el-table column `prop/label/min-width` 原样搬入。
- 权限边界：普通字段组件通过 `useFieldPermission`/`FieldContextRenderer` 查询宿主 DataView 的 `fieldAccess`，RendererTable 有 `DataView` 原查询结果的权限接线。动态 option 来源代码 `buildOptionSourceFromView` 则从候选 DataView `rows` 直接取 label/value，`useFieldOptions` 未显式调用候选视图的 `fieldAccess`。本次找到的 `tests/ui/field/choice/field-option-dataview-facets.test.ts` 只验证 DataView label/value facets，没有字段遮蔽用例。因此应用候选模型的 `AppDesc` 与 `rowid` 可读权限消费是未证实风险，不能声称已等同旧 owner 对每行 `rowid/AppDesc/AppName` 的 fieldAccess 检查；需检查/补足现有组件权限合同后再上线，不可在页面 script 用裸 rows 绕过。

最小 rule 树形状（节点级结构与公开 props 已核对；模型当前装配失败，故此 JSON 不是可运行成品）：

```json
{
  "type": "r-table",
  "id": "catalog-table",
  "props": {
    "dataViewKey": "Catalog@default",
    "filter": {
      "children": [
        { "type": "r-text", "id": "name-filter", "props": { "field": "Name", "label": "名称或 ID" } },
        { "type": "r-select", "id": "application-filter", "props": {
          "field": "sysid", "label": "所属应用", "clearable": true,
          "optionDataViewKey": "Applications@default",
          "optionDataMember": "rows", "optionLabelField": "AppDesc", "optionValueField": "rowid"
        } }
      ]
    },
    "toolbar": {
      "children": [
        { "type": "r-button", "id": "add", "props": {
          "label": "新增", "action": "append-row", "dataViewKey": "Catalog@default",
          "appendPayload": { "Type": "datasource" }
        } },
        { "type": "r-button", "id": "save", "props": { "label": "保存" },
          "on": { "click": { "action": "save-dataset", "scenarioId": "<真实 scenarioId>" } } }
      ]
    }
  },
  "children": [
    { "type": "r-text", "id": "name", "props": { "field": "Name", "label": "名称", "width": 220 } },
    { "type": "r-text", "id": "description", "props": { "field": "description", "label": "描述", "width": 320 } }
  ]
}
```

如 r-filter 两个孩子都生成条件，其公开 filter panel 目前由 `useFilterPanel` 合并多个有效条件为 AND；它不能表达旧页面语义 `Name contains term OR rowid eq term`，也不能把其中两个字段绑定成一个搜索框。应用 `sysid` 条件与名称/ID OR 子组之间需要 AND。因此完整搜索应由脚本在得到 name/sysid 输入值后构造表达式，再对正式 DataView 执行。`script.js` 中以下片段使用 renderer 明确注入的 `SparkData`，和 `DataViewFilter.group/condition`、`DataView.executeFilter` 源码合同吻合：

```js
async function searchCatalog(input) {
  const view = $page.resolveView('Catalog@default')
  if (!view) throw new Error('Catalog@default 未装配')
  const term = String(input.name ?? '').trim()
  const sysid = String(input.sysid ?? '').trim()
  const groups = []
  if (term) groups.push(SparkData.DataViewFilter.group({ logic: 'or', filters: [
    { field: 'Name', operator: 'contains', value: term },
    { field: 'rowid', operator: 'eq', value: term },
  ] }).toJSON())
  if (sysid) groups.push(SparkData.DataViewFilter.condition({ field: 'sysid', operator: 'eq', value: sysid }).toJSON())
  const filter = groups.length === 0 ? undefined : groups.length === 1
    ? groups[0]
    : SparkData.DataViewFilter.group({ logic: 'and', filters: groups }).toJSON()
  await view.executeFilter(filter)
}
```

`buildPageContext.ts` 把 `SparkData` 注入脚本上下文；`DataViewFilter` 从 `@spark-appworks/spark-data` 公共入口导出。`executeFilter` 即使过滤表达式未变也会重查服务端，改变表达式时走 `setFilter`（重置分页并刷新）。但是怎样将 filter UI 的两个输入值作为 `input` 传给该脚本函数、同时保留查询/清除按钮交互，本轮没有找到一个已用测试覆盖的现成整合组件/事件配置，不能编造 `r-filter` 表单读取 API。简单可执行候选需要在 rule 中显式放两个筛选输入和按钮，用当前确认支持的组件事件 `on.click` 字符串 handler 调用 `searchCatalog` 并传实值；事件参数到命名脚本函数参数的映射仍须按 `bind-normalize.ts`/组件发出的真实事件签名核验后再定。不得靠 DOM selector 读取控件值。

### DataView 新增/保存、权限与显示

- `$page.resolveView('Catalog@default')` 返回该次 PageRuntime DataView。运行时新增动作 `r-button.props.action:"append-row"` 最终调用 `view.addRow(payload)`；DataView 的 `fieldAccess(row, field)`、`addActionState()` 把原查询 `DataViewQueryContext` 的读/写与新增许可带到组件层。DataView 脏编辑提交由 `view.dataSet.saveChanges(options)` 执行；声明式 `save-dataset` action 从 `$page.getDataSet(scenarioId)` 取同次运行 DataSet，检查保存权限，再调用 `saveChanges`。动作机制存在不等于 Base_DataSet 当前后端新增合同可用：live contract 未提供该模型 add 权限成功证据，且装配当前先被重复输出字段拦截。
- `append-row` 的按钮动作自身不生成字段编辑表单。可在 r-table row scope 下配置字段编辑组件/动作，或者由 r-form 绑定该 DataView 当前行；新增是 staged 编辑时要提交对应 DataSet。必须先从 `DataSet.addRow` 与真实渲染 props 证实如何自动补 rowid、必填字段、Type 固定值、sysid 关联和服务端创建人，不应假定旧 owner 的 `create` 继续可用。只读 user/request 相关字段应按 fieldAccess 展示；前端不得伪写 createuser。
- 当前 DataSpaceCatalogPage 展示的行数据经旧 owner 将创建人 ID 二次查 `Base_UserInfo`，再按两个查询 context 的 fieldAccess 校验，并处理 masked、未解析、多重候选冲突。DataView 当前视图投影能提供 `createuser` 原值，不会自动跨 Base_UserInfo 查 `UserName` 并保留该双侧权限语义。虽然 live contract 中确有 Base_UserInfo 模型身份，尚无 `Base_DataSet.createuser -> Base_UserInfo.ROWID` 的正式 relation/lookup 投影配置证据；`r-select optionDataViewKey` 只能为编辑候选提供选项，不是行字段 lookup renderer。故创建人姓名、应用名称、类型标签及 masked/hidden 展示需要逐项确认现有 DataView projection/value function 或 renderer 能力；不得用未授权裸字段映射冒充等价。

### 可复用的精确测试证据

- 动态选项：`tests/ui/field/choice/field-option-dataview-facets.test.ts`（现有 optionDataViewKey/DataView.labelField/valueField 实例测试）；`tests/ui/field/choice/field-tree-option-sync.test.ts` 同样显式传 `optionDataViewKey`。
- 过滤语法：`packages/spark-data/src/tests/query/filter-contract.test.ts`（`DataViewFilter.group({logic:'or'})`）；`packages/spark-data/src/tests/data-view/data-view-filter-expression.test.ts`（`setFilter`、group filter、字段有效性及刷新）。catalog 当前 OR/sysid 组合仍只有 native owner 对应 `tests/runtime/auth-nav/data-space/lowcode-data-space-catalog.test.ts` 的证据，不能转称 DataView 脚本已验证。
- 新增/保存/权限：`tests/runtime/data-view/dataview-crud-bridge.test.ts` 覆盖 append-row 调用 `view.addRow`；`tests/runtime/auth-nav/permission-resolver.test.ts` 覆盖 action 对 DataView add/save permissions 的消费；`tests/runtime/page/transaction-config-pages.test.ts` 覆盖 save-dataset action 场景身份及请求语义。
- 实际四文件渲染仍需 `tests/runtime/page/spark-page-renderer-binding.test.ts` 接入正确 fixture，覆盖真实 filter 值进入 `searchCatalog(input)`、动态应用选项、列渲染、append/edit/save、字段 h/m/e/拒绝，以及 DataView的实际路由/API loader。当前没有包含全部行为的单个现成四文件 E2E fixture。

本补核仍是源码/既有测试读取，无测试执行；没有尝试解决 `Base_DataSet` 输出重复问题，没有通过缩减模型/应用筛选达到运行。

## 主控补充的模型边界与最窄修复建议（只读，不实施）

主控新增证据 [pilot-assembly-before.json](/D:/SPARK_AppWorks/notes/evidence/sparkproject-appworks-integration/four-file-correction/pilot-assembly-before.json) 记录真实装配失败；[pilot-duplicate-fields.json](/D:/SPARK_AppWorks/notes/evidence/sparkproject-appworks-integration/four-file-correction/pilot-duplicate-fields.json) 记录 Base_DataSet 的 13 组重复正式输出。已逐段核对本仓：

- [DataSpaceDesignApi.sameFormalKey](/D:/SPARK_AppWorks/packages/spark-lowcode-api/src/platform/data-space/design/data-space-design-api.ts) 目前已让重复主键在同正式键条件下进入模型并保留完整 fields；这不等于普通列可用。
- [LowcodeDataSpaceAssembler.columns](/D:/SPARK_AppWorks/src/lowcode/data-space/lowcode-data-space-assembler.ts) 对所有 output canonicalName 强制唯一，并直接逐字段生成 DataColumn，导致等价重复在 DataSet 创建前 fail。
- [DataSpaceRuntimeApi.executeQuery](/D:/SPARK_AppWorks/packages/spark-lowcode-api/src/platform/data-space/runtime/data-space-runtime-api.ts) 的 `requestField` 要求一个 canonicalName 恰好匹配一个 output，正式查询筛选/投影/排序也会被挡住。
- [DataSpaceQueryContext.prepareSaveRow](/D:/SPARK_AppWorks/packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context.ts) 写回映射再次要求每个输出名只有一个模型字段，故不能仅改列构造就宣称新增保存闭环可行。
- 设计层现存 `sameFormalKey` 比较 `name/canonicalName/type/output/computed` 与 raw Group/Value/ValueFun/Expression；主控的重复证据进一步确认该模型等价组的 primaryKey、description、order、orderType 也相同。新运行期折叠判断必须覆盖正式字段完整语义，不能直接把设计层较窄 helper 当完整等价判断。

建议下一份单页计划把“等价重复输出折叠”限定为一个小的共享运行期解析规则，并只落在三个消费点：

1. columns 构造按 canonicalName 聚合。组内所有正式语义完全一致时只产一个 DataColumn；发现同名但任一正式语义不同立即 fail-fast。不得删改 DataSpaceDesignApi 返回的原始 `model.fields`，不得改远端模型/文件。
2. runtime `requestField` 用同一解析规则：组内等价时确定性选一条的正式源 `name` 映射；有冲突或不存在时保留当前 unresolved fail-fast。
3. 保存的 canonicalName→正式 `name` 映射复用同一规则，等价组只生成一个 wire 字段；冲突/计算输出继续拒绝写入。以免读链通过、写链仍因 duplicates 失败。

此建议仅收窄“完全等价输出记录可视为一个可消费列”这一运行时适配，不涉及模型去重、不碰模型编辑/设计快照、不放宽字段权限、主键或计算列约束。第一轮验证应覆盖主控这 13 组真实 evidence 的成功唯一列/请求字段映射，以及人为构造同 canonicalName 但 description/order/type/source 或 computed 不同的冲突模型保持 fail-fast；之后才重新验证完整 `loadLowcodeRuntimeScenario` 与 page DataView query/add/save。对应候选测试分别落在 assembler 所在 lowcode data-space runtime 套件和 `packages/spark-lowcode-api/src/platform/data-space/runtime/data-space-runtime-api.test.ts`、`.../query/data-space-query-context.test.ts`；本次未运行测试。

该边界必须在正式 DataView/DataSet 管线上修复后重试页面；不要缩减 Base_DataSet 投影/删应用筛选，也不要回退 raw `lowcodeApi.dataSpace.runtime.query`。

## 计划第 2 项：等价重复输出解析的最小实现边界（只读建议）

完整核对了 [DataSpaceDesignApi](/D:/SPARK_AppWorks/packages/spark-lowcode-api/src/platform/data-space/design/data-space-design-api.ts)、装配器、`DataSpaceRuntimeApi`、`DataSpaceQueryContext`，以及它们现有的 `data-space-design-api.test.ts`、`data-space-runtime-api.test.ts`、`tests/runtime/auth-nav/lowcode-data-space-runtime.test.ts`、`runtime/tests/data-space-model-alias.test.ts`。以下规则区分“可以折叠的字段输出记录”和“仍必须唯一的行身份/权限身份”：

### 推荐的唯一解析入口

在现有导出的 `DataSpaceDesignApi` 门面加一个静态输出解析行为，供装配、运行查询和查询上下文共同调用；不增加新文件、导出的工具函数或新的 public type。它接受正式模型、查找字符串及匹配方向（`canonicalName` 或正式源 `name`），返回唯一输出字段；没有匹配、匹配记录语义不一致、或调用方要求单字段身份而结果含义仍有歧义时明确报错。静态入口只消费 `readModel()` 已返回的完整原始 `fields`，绝不改写、去重或排序模型本身。

等价比较忽略仅用于记录身份的 `id/fieldId` 与 `raw.rowid`；必须严格一致：正式源 `name`、`canonicalName`、type、primaryKey、description、output、computed、order、orderType，以及 Group/Value/ValueFun/Expression 的规范语义值。不得比较整个 raw 对象（重复记录的记录 ID 本就不同）；不得沿用当前 `sameFormalKey` 的窄比较当成充分条件。解析按请求方向取候选：canonicalName 索引用于页面列/查询/写入，正式 name 索引用于物理请求回执和 ParentField。若同一 source name 被不同 canonicalName 输出占用，不能任选第一条。

### 每个消费点是否要改

| 文件与当前点 | 应用同一解析行为 | 保持的身份/权限约束 |
|---|---|---|
| `DataSpaceDesignApi.projectFormalModel` / `sameFormalKey` | 是。主键候选重复仍校验它们完整正式语义等价；冲突继续“主键无法唯一映射”fail-fast。普通非主键重复可以保留在返回 `model.fields`，冲突在作为输出被消费时拒绝。 | `id` 字段记录不删除；主键仍只能是唯一 canonical 输出身份，不能把“同名”推成“同一主键”。来源物理 key 校验原样保留。 |
| `src/lowcode/data-space/lowcode-data-space-assembler.ts:columns` | 是。按 canonicalName 输出一列，组内只在完整等价时折叠；否则仍抛“模型输出字段重复”。保持原 order/描述/type，字段 ID 不暴露给 DataColumn。 | `validateProjection` 仍需验证 projection 的 fieldId 对应正式字段身份；当前 `matches.length === 1` 不能放宽成只看 canonicalName，否则投影中 fieldId 无法唯一识别。此处若要兼容重复 fieldId 候选，必须另有明确投影合同；本次不建议改。主键列唯一性仍验证。 |
| `DataSpaceRuntimeApi.executeQuery.requestField` | 是。查询 filter/fields/sort/tree 中的 canonicalName 映射到等价重复记录共同的正式 `name`。 | 未知字段/冲突重复仍 `SPARK_MODEL_FIELD_UNRESOLVED`；查询选项本身 fields 继续非空且不重复，不能把用户重复请求静默折叠。 |
| `DataSpaceQueryContext.bindFormalModel` 的主键 lookup | 是。通过 canonical resolver 找唯一正式输出，再保留 `primaryKey === true` 与原查询快照 `primaryKeyField` 一致检查。 | `rowid`、DataView rowKey、查询快照主键及权限 Map 仍是每行唯一主键；不可因模型字段定义有重复就合并重复数据行/权限行。 |
| `prepareSaveRow` 的 canonical→正式 name | 是。等价字段输出落到唯一 wire name；缺字段、冲突、computed 继续拒绝（delete 仍按现有规则跳过不可映射字段）。 | 每个输入 canonicalName 仅产生一次 wire key；不以任意一条 conflicting 字段写出。前端字段权限仍消费原查询上下文，不在 resolver 中放宽。 |
| `canonicalReceiptRow` 的正式 name→canonical | 是，但按正式源 `name` 索引。等价重复字段回执映射到同一 canonicalName；同一源 name 对应不同 canonical 输出须 fail-fast，不能 `.find()` 取第一条。 | `resolveSaveReceipt` 对 receipt model identity、动作数量、原查询行主键及回执范围的校验完全保留。返回行仍只有一个主键；不能合并重复/越界回执。 |
| `addCredential` 的 ParentField→canonical | 是，但按正式源 `name` 解析。重复父字段只有完整等价才能折叠。 | 继续要求 output、非 computed、非主键、唯一原父行、明确 `c === true`、非自身父行及原父行凭据；不能让同名 conflicting ParentField 改变 token 选择。 |

上述 primary/receipt/ParentField 都必须跟同一正式字段解析行为一致，但用途不同：主键/列/查询/save 使用 canonicalName；receipt 与 ParentField 从后端 `name` 反查。权限本身按返回行与字段名登记在 DataSpaceQueryContext，不按 fieldId；任何“等价”不得将不同 canonicalName、不同权限字段名、不同 query identity 或不同 row key 合并。

### 精确修改与测试落点

- 生产实现边界：`packages/spark-lowcode-api/src/platform/data-space/design/data-space-design-api.ts`（门面解析行为、完整等价判断、formal primary candidate）；`src/lowcode/data-space/lowcode-data-space-assembler.ts`（columns 唯一列）；`packages/spark-lowcode-api/src/platform/data-space/runtime/data-space-runtime-api.ts`（requestField）；`packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context.ts`（formal primary、save、receipt、ParentField 四处）。不改设计 snapshot 的 fields 内容，不改后端模型，不改配置/页面/其他 API。
- 现有测试增量：`packages/spark-lowcode-api/src/platform/data-space/design/data-space-design-api.test.ts` 覆盖重复正式字段记录保留且 resolver 对 full-equivalent 折叠、description/order/type/computed/value 中任一冲突拒绝；`tests/runtime/auth-nav/lowcode-data-space-runtime.test.ts` 覆盖等价重复只装配一列、冲突仍拒绝；`packages/spark-lowcode-api/src/platform/data-space/runtime/data-space-runtime-api.test.ts` 覆盖 DataView filter/fields/sort 对等价组映射单一源 Name、冲突不发请求；`packages/spark-lowcode-api/src/platform/data-space/runtime/tests/data-space-model-alias.test.ts` 覆盖 duplicate primary bind、save wire、receipt canonicalization 与 ParentField token 规则。现有 `data-space-runtime-api.test.ts` 里的 formal tree child-add 测试应继续通过；无需改动 permission parity tests，因为 resolver 不接触权限规则。
- 最小聚焦测试命令：`pnpm exec vitest run packages/spark-lowcode-api/src/platform/data-space/design/data-space-design-api.test.ts packages/spark-lowcode-api/src/platform/data-space/runtime/data-space-runtime-api.test.ts packages/spark-lowcode-api/src/platform/data-space/runtime/tests/data-space-model-alias.test.ts tests/runtime/auth-nav/lowcode-data-space-runtime.test.ts`。按总计划，在写任何代码前先记录 `pnpm run typecheck` 基线；本次只读，没有执行这些命令。

建议主控先审定此最小范围，再将其加入单页计划的第二项验收。此处未创建新计划、未编辑代码、未运行测试。
