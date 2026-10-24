# 字典目录 AppId 与查询范围核对（只读）

范围：对照参考目录源码与当前 AppWorks 实现，供主控结合本次线上请求与 `Count` 读证。只读源码，没有运行测试、访问服务/浏览器或修改产品/Git。

## 参考目录：AppId 是可选列表筛选，但创建时必填

- 参考列表在一般 metadata 入口默认 `AppId=''`；`useApplicationScopeBinding.resolveInitialSearchAppId` 只在 `__subsystemScope=project` 时返回绑定应用（`E:/r/sparkproject/packages/ui/domain/metadata/src/features/application/application-scope/model/application-scope-binding.ts:29-60`）。列表 `el-select` 带 `clearable`；`queryAppId` 在项目子系统中强制绑定 AppId，在普通入口采用用户选值（`.../ui/data-dictionary-list-page.vue:25-34,225,258-277`）。因此普通入口首次查询不按 AppId 过滤，选择后可清空；项目子系统入口则固定为路由绑定应用且隐藏筛选控件。
- `getDictTypePage` 只在 `params.AppId` 非空时加 `AppId eq`，没有默认应用条件；查询同时可按 StructureTypeID 等值、TypeName/functiondesc 包含筛选。创建人姓名先查 `Base_UserInfo.UserName`，再将匹配 ROWID 作为 `createuser IN (...)` 条件（`E:/r/sparkproject/packages/data/metadata/src/api/StructuredConfig/DataDictionary.ts:56-106`）。
- 空 AppId 的普通入口查询不会排除其它 AppId，也不会因源码过滤排除 AppId 为空的行；这只能说明请求允许它们进入候选集合，实际可见行仍取决于正式后端授权/数据和其 Count。源码不能证明当前库里存在共享字典。
- 列表查询页码由 `resolveDataTablePage` 归一化，默认第 1 页、每页 10 条；`metadataSparkApiClient.query` 返回 `rows/total`，列表直接显示该 `total`，没有在浏览器用当前页计算全量总数（`E:/r/sparkproject/packages/data/metadata/src/utils/page-param.ts:9-18`; `.../api/StructuredConfig/DataDictionary.ts:92-106`; `E:/r/sparkproject/packages/ui/base/vue/src/list-page/pagination.ts:12-13`）。页面默认排序仅声明 crttime 降序（页面行 248，API 映射见 sort 75-79）；源码未声明 rowid 次级排序。
- “列表可清空 AppId”与“新增必须归属应用”是两件事：一般入口新增表单的 AppId 控件和验证均存在；提交还会再次阻止空 AppId。子系统入口用绑定应用（`.../ui/data-dictionary-list-page.vue:131-140,338-341,467-480`; scope binding `.../application-scope-binding.ts:44-59`）。所以不能从目录无过滤推导出可新增无应用归属的共享字典。

## 当前 AppWorks：目录查询固定限制为请求应用

- `LowcodeDictionary.loadCatalog(scenarioId)` 从 `lowcodeApi.readRequestScope().headers['X-AppId']` 取 `applicationId`；缺失直接报“请先选择应用”，scope 改变会拒绝迟到结果（`src/lowcode/resources/dictionary/lowcode-dictionary.ts:21-23,96-103`）。
- 它创建静态 `DictionaryCatalogInput`，其中 `AppId` 是主键，唯一输入行固定为当前 `applicationId`；通过原生 `DataSet.addCascade` 将其绑定到 `_Base_DictType.AppId`（`.../lowcode-dictionary.ts:47-55`）。这是常驻范围约束，不由用户筛选表单管理；其它 AppId 和空 AppId 行不能匹配该输入。
- 当前目录页面的 RendererTable 过滤字段只有 `StructureTypeID`、`TypeName`、`functiondesc`、`createuser`，没有 AppId 控件或过滤项（`src/views/features/data-platform/structured-config/data-dictionary/ui/data-dictionary-list-page.vue:18,85-91`）。创建时也从当前 `X-AppId` scope 取 AppId，而非用户选择（`.../lowcode-dictionary.ts:22,96-103`）。
- 当前 DataView 没有目录级 `pageSize` 覆盖，原生 `DataView.pageSize` 默认 20（`packages/spark-data/src/data-view.ts:924`; 目录配置 `src/lowcode/resources/dictionary/lowcode-dictionary.ts:27-39`）。RendererTable 使用 DataView 的 total/page/pageSize，分页尺寸可选 10/20/50/100；total 经 view runtime 读取 `DataView.total`（`packages/spark-component/src/components/containers/data-views/RendererTable/RendererTable.vue:112-120`; `.../view-runtime-state.ts:292-305`）。当前请求过滤具体如何序列化合并、接口返回的 `Count` 是否准确，留由主控检查本次真实请求/响应。

## 差距与待核

1. 源码层的范围确有差异：参考普通 metadata 入口可清空 AppId 而浏览所有正式查询返回且有权可读的字典；当前目录总是精确绑定当前请求应用。因此“当前目录只显示当前应用”是源码可推出的结果，但“数据库里还有多少其他应用/共享字典”不能由静态源码证明。
2. 需主控结合当前登录/路由的真实 Request Scope，核本次 `_Base_DictType` 请求 Filter 是否包含 `AppId eq 当前应用`、分页参数及响应 `Count`；再确认用户提出“当前目录不应只有几条”是希望全局目录，还是当前应用下结果/Count不完整。不可把参考仓旧多应用可浏览直接当成本仓已确认的授权/产品目标。
3. 共享字典的判定条件、AppId 为空记录是否存在/可读、跨应用访问权限均待正式业务合同和服务读证；本报告不建议更改级联，也不调整权限边界。

仅创建本报告：`node_modules/.cache/metadata-integration-20261024/b1-dictionary-catalog-scope.md`。
