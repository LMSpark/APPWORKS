# M0 复制 API：实施前只读研读

## 范围与约束

- 总约束：[notes/plan-appworks-four-file-integration.md](../../../plan-appworks-four-file-integration.md)，尤其是复制 API 验收要求（从正式设计快照生成源格式文本、受治理剪贴板、读取及异步结束均检查页面有效、失败不报成功且隐藏信息不外泄）和缺口表。
- 操作记录：[pilot-remaining-operations.md](pilot-remaining-operations.md#L18)。固定参考仅为 `E:/r/sparkproject` 提交 `842dec4f11b333df904b9a4e26b6566b0802bab8`。
- 本文只研读，不改生产、测试或配置，不运行测试、浏览器或在线 API。

## 源码事实和调用链

**参考文本语义。** `apps/appworks/src/data/api/data-set/apiInfo.ts` 的 `buildDataSetApiInfoText` 按原序生成：首行 `const DataSetId = '…';`；每个模型生成 `DataModel_<sanitized Name>`、`_Type`、`_PK` 三个常量。标识符将非字母/数字/`_$` 字符折成下划线，去掉前导下划线、数字前加下划线，空名回落 `Model`；重名按 `_2` 等递增。字符串转义反斜线、单引号、CR、LF。主键是该模型中首个 `type` 为空或 `dataModel` 且 `IsPKey` 为真的字段 `Name`，没有时回落 `rowid`。`buildDataSetApiInfoTextFromSnapshot` 只是把快照的 `models/fields` 转交同一 formatter。

**参考 owner 和权限事实。** `AppWorksDataSpaceDesign.readApiInfo()` 并行调用本 owner 的 `readModels()` 与 `readFields()`，随后检查 `assertCurrent()` 并格式化。该 owner 构造时固定 `designScenarioId`、`dataSpaceId` 和执行域 guard；各读取经 `#run` 校验前后有效性。`readFields()` 分页收集完整结果；不完整分页会失败。该参考方法自身没有按字段权限过滤，因此不能把它描述成“权限过滤后的文本”。原页面 `handleCopyApiInfo(row)` 先验证 `rowid`，捕获 `hostRevision`，读取 API 文本，检查页面仍有效后复制，再次检查后才提示成功；捕获的 `requestHostRevision` 失效时不提示。异常仅在页面仍有效时记录并展示失败。

**当前设计 API 的两个读取路径不可混为一谈。** `DataSpaceDesignApi.read({dataSpaceId,catalogFormKeys})` 经 `LowcodeClient` 对固定 `DATA_SPACE_DESIGN_FORM_KEY = 8D1AB14DD8277F3E7017CD38F77B09FD` 直接发 `/api/DataOperation/GetData`，汇总 dataSpace、models、fields、relations 与资源目录，产出 `DataSpaceDesignSnapshot`。该路径没有 `assertCurrent`/请求 scope 参数，也不经过 `DataSpaceRuntimeApi` 的 query permission context；不能直接拿它满足本次“受当前权限约束、stale 安全”的复制需求。另有 `design.readModels/readModel/readRelations` 走 `DataSpaceRuntimeApi.query`，按 `designScenarioId + dataSpaceId` 查询，读取器捕获并校验 request-scope token，模型/字段归属也有检查；但它们当前把 `context.rows` 直接投影为模型数据，没有在投影中检查 `context.fieldAccess`。`DataSpaceQueryContext` 本身持有 row permissions、`fieldAccess`，缺失/不唯一权限为拒绝；设计读取器未消费这些权限信息，所以使用此路径也不能宣称隐藏字段自动安全。

**当前四文件和宿主边界。** `pagedata.json` 主场景是 `90A82E287930A234FEC3E687C94A93EA`，绑定 `Base_DataSet@catalog`、应用和创建人视图；它没有设计态模型/字段读取权限投影。脚本 `$page` 来自 `buildPageContext`，当前只暴露 UI 方法及 `getDataSet/resolveView`；`PageServiceCapability` 由 `buildPageService` 建立，`SparkPageRenderer` 从 `PAGE_RUNTIME_SERVICES` 消费覆盖项，`src/App.vue` 当前只注入 `pageService: appPageUiService`。`$moduleContext` 是导航选择快照（selected/items/nodeId），不是 API/service 注入槽。`PageRuntime` 可按 scenarioId 取得已经装配的场景 DataSet，`DataView` 权限属于原查询视图；它只能代表其绑定模型/场景查询，不等价于固定设计 FormKey 的模型与字段全集。当前 `script.js` 没有复制 API action；现有目录测试通过 `buildPageContext` + `compileFunctions` +真实 assembler/DataView 覆盖脚本，尚无复制/API文本/剪贴板测试。

## 唯一建议的受治理接线

把业务读取和通用 UI 分开：增加一个**窄、独立的设计态页面能力**（例如 `$dataSpace.design.readApiInfo({dataSpaceId, assertCurrent})`），宿主只从正式 `lowcodeApi.dataSpace.design` owner 组装它；不要把 `LowcodeApi`、HTTP client、通用 `call/fetch` 或业务方法放进 `PageServiceCapability`。该正式 owner 方法须以固定 `DATA_SPACE_DESIGN_FORM_KEY` 为设计身份、使用带当前 request-scope guard 的数据查询路径，并明确消费每个模型/必需字段的可读权限后才产出文本；无权或 masked 值不得进入文本。通用剪贴板只在 `$page` / `PageServiceCapability` 增加单一 `copyText(text)` UI 宿主操作，由 `buildPageService` 的默认宿主实现和现有注入覆盖路径承载。四文件脚本只负责正式 rowid、当前行/视图身份、读取前后 `assertCurrent`、调用 copy、复制成功后再提示；复制失败不报成功，stale 不呈现迟到结果。

建议实施最小文件边界（需主控据此另列经审定子计划，非本报告授权）：

1. `packages/spark-lowcode-api/src/platform/data-space/design/data-space-design-api.ts`：唯一业务读取/权限投影/源格式文本 owner；绝不使用 `read()` 的直接 GetData 快照路径冒充 query-owner 权限读取。
2. `packages/spark-component/src/runtime/app-services.ts`、`packages/spark-component/src/page/services/buildPageService.ts`：只补通用 `copyText` 合同与宿主实现。
3. 独立 `$dataSpace` 页面能力的类型/构建接线（`packages/spark-component/src/page/context/types.ts`、`buildPageContext.ts`、`SparkPageRenderer.vue` 及 `PAGE_RUNTIME_SERVICES` 能力载体）；`src/App.vue` 只注入窄 owner closure，不泄漏 API/client。
4. `config/pages/data-platform/data-space-catalog/rule.json`、`script.js`：提供复制入口并串行化、验证身份、处理 stale 与成功/失败状态。预期不需改 `style.css` 或 `pagedata.json`。
5. `tests/runtime/page/catalog/data-space-four-file.test.ts`：通过既有真实上下文/owner fixture 覆盖源格式、rowid 缺失、读权限拒绝/隐藏、剪贴板成功/拒绝、owner scope 变化和页面失效。

若确认现有 `DataSpaceDesignApi` 不适合承担 formatter，应另行收窄子计划；不要扩成通用服务平台。以上文件数只说明真实传播边界，主控可在确认能力载体和 owner 测试方式后进一步缩小。

## 必须在实施计划中明确的风险/未决点

- **权限输出语义不能由源码决定。** 总计划要求隐藏信息不外泄，但没有定义任一模型、名称、类型或主键字段不可读时是整体拒绝复制，还是省略不可读模型/字段；参考 formatter 会输出模型名、类型和 PK。建议 fail-closed 整体拒绝并不返回部分文本，需主控在子计划明确。不能以登录名 admin 放行。
- 当前 `DataSpaceDesignApi.read()` 返回模型/字段完整快照，但其单独 GetData 通道与 DataView 权限不相连；任何使用它的实现都需证明其 endpoint 对固定 FormKey 的读权限已覆盖所有需输出字段，否则违反隐藏数据边界。
- `PageRuntime` 场景 DataView 是 catalog 模型，不是设计模型完整集；不可从 `Base_DataSet@catalog` 或 `$moduleContext` 推导设计读取身份。固定设计身份是 `DATA_SPACE_DESIGN_FORM_KEY`，绝不能替换成目录场景 ID。设计请求 scope 与页面 execution scope 是两项 guard，迟到时都应拦截。
- 浏览器剪贴板可能因权限/安全上下文拒绝；只在 `copyText` 完成后显示成功，拒绝时显示失败。宿主页面 teardown / scope 变化时不得展示过期 toast。
- 固定参考文本从旧 `DataModelRecord`/`DataModelFieldRecord` 读取 `Type`、`dataModelId`、`type`、`IsPKey`。当前 `DataSpaceFrontendModel` 投影的 `sourceType`、字段 `primaryKey/canonicalName` 并非天然逐字段同义；formatter 必须通过源码测试锁定同名、非法标识符、引号换行、空模型、无 PK、复合/重复 PK 的行为，不能仅凭展示 DTO 猜等价。

## 调用链摘要

`rule.json` 目录行操作 → `RenderCatalogActions`/脚本行身份 → `$dataSpace.design.readApiInfo` → 当前固定设计态正式 owner 和 request scope → 返回格式化文本 → `$page.copyText` 宿主剪贴板 → stale 检查 → 成功提示。文本 owner 管模型/字段数据与权限，UI 宿主管剪贴板；四文件只编排，不直接请求 API 或读取浏览器 clipboard。

测试应验证：参考格式字节语义；只输出明确可读的数据；rowid 缺失时零 owner/clipboard 调用；数据 owner scope 变化或页面关闭时零剪贴板/成功 toast；剪贴板拒绝不提示成功；行切换/查询替换后迟到的复制结果不影响新行。该清单是实施验收建议，不表示本次运行过测试。

## 追加复核：固定设计场景的多场景 DataView

**结论：架构上可走现有 PageRuntime/DataView 链，值得优先采用；当前页面文件未配置命名视图不构成架构否定。** `PageRuntimePool.scenarioCall` 明确接受 `additionalScenarioIds`，校验非空、无重复且不能重复主场景；`PageRuntime` 对每个声明场景逐个调用宿主 `loadScenario`，分别装配独立 DataSet 并校验身份。`getDataSet(id)` 和 `resolveView('#scenarioId@table@view')` 只接受已声明场景。`src/lowcode/data-space/lowcode-data-space-runtime.ts` 默认以 `DATA_SPACE_DESIGN_FORM_KEY` 作为 `designScenarioId`，并可为给定 `scenarioId` 读取其 ScenarioViewFile 后按配置中的 `modelBinding.modelName` 经正式 `DataSpaceDesignApi.readModel/readRelations` 装配。因而将固定值 `8D1AB14DD8277F3E7017CD38F77B09FD` 作为额外场景 ID，且为它准备合法的 ScenarioViewFile，确实会形成此固定设计场景下 `Base_DataModel` 与 `Base_DataModel_Field` 的正式 DataView；不会以 catalog 主场景身份替代它。

**请求模型名与字段。** DataView 的 query identity 来自 `DataTable.modelBinding.modelName`，`DataSpaceQueryTable.buildRequest` 将该值写入 `/api/DataOperation/GetData` 的 `Table[0].Name`，并由 query owner 以场景 ID 注入同值 `x-FormKey`。查询字段不是任意后端字段：`captureDataSpaceViewQuery` 从正式模型输出投影建立可用字段集合；`loadFromServer({fields:[...]})` 只能选该集合中的字段，字段必须非空、互异。建议命名视图分别请求源 formatter 所需字段：模型行 `rowid, Name, Type`；字段行 `rowid, dataModelId, type, Name, IsPKey`；并过滤 `dataSetId === 当前数据空间 rowid`。实施时须以固定设计场景正式模型的真实输出字段为准：这五个字段若没有全部作为正式模型可输出字段，DataView 会 fail-fast（未知字段），不能通过脚本绕过模型投影直接请求；应据实际 schema 判断是否能配置。命名视图可提供固定 projection 和稳定过滤；如果该过滤要随当前行变化，脚本传入 `loadFromServer` filter，不能把当前数据空间 ID 烘焙进共享场景视图文件。

**权限与完整性。** `DataView.loadFromServer` 在绑定 `DataSpaceRuntimeApi` 时收到 `DataSpaceQueryContext`，保留 query result 用于 `fieldAccess(row, field)`；后端行内的 `lingma_sys_params` 不出现在脚本 row，但仍由权限 context 消费。`DataSpaceQueryContext` 缺少/重复行身份时不给授权，权限缺失时 `fieldAccess` 返回 denied/invisible。因此脚本可在读取两个列表后，对每行的每个源输出字段调用 `fieldAccess`，再交给纯 formatter；不能直接映射 `view.rows` 而忽略读状态。`allPages:true` 会沿 `DataSpaceQueryOptions` 和 wire contract 编码为 AllPages 查询，owner 保留完整回执并执行 scope 检查；调用后仍应核对加载成功、总数与行数一致，避免把不完整字段集生成成成功文本。固定场景的两个 DataView 独立保存权限 context，与目录 DataView 的权限无关，也不应基于 admin 登录名放行。

**配置加载与调用边界。** `loadLowcodeRuntimeScenario` 不从本页 `pagedata.json` 读取次场景配置；它通过项目 ScenarioView gateway 按 `scenarioId` 读取该场景自己的共享 ScenarioViewFile，缺文件就报 `SCENARIO_VIEW_FILE_MISSING`。本页 pagedata 中现有 Base_DataModel / Base_DataModel_Field 默认视图属于主场景配置，不能代替固定设计场景的配置；主控核验固定场景的线上配置是必要的。运行时 route 必须携带 `additionalScenarioIds=8D1AB14DD8277F3E7017CD38F77B09FD`，以使该场景在 `$page.getDataSet/resolveView` 可见；ScenarioViewFile 必须有准确的模型绑定与 `apiInfoModels/apiInfoFields` 命名视图。`PageRuntime` 销毁时销毁各场景 DataSet，运行时代次、`DataSpaceRequest` 的 request-scope token 及视图自身请求竞态提供 stale 保护；复制流程仍需在 await 后再检查页面有效性。URL 的新增 query 值会参与 `PageRuntimePool` instance key，场景集不同会得到独立运行实例。

该路线可移除前节“新增 `$dataSpace` owner 能力”的必要性判断：复制 API 业务读取可以留在四文件脚本，使用显式固定场景 DataView 与 fieldAccess；宿主唯一新增能力只需通用剪贴板 `copyText`。它仍需明确不可读字段策略（整体失败最容易保证不泄露）和父/额外场景配置的正式部署/导航接线来源。纯 formatter 可放 `script.js` 复刻已读参考算法，或在测试覆盖后抽入现有纯工具；不可调用底层 LowcodeApi/HTTP。

