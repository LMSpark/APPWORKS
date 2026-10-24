# B1 引用 DataView 只读探针预检

**状态：仅源码预检，脚本已写但未运行；没有发起服务请求。** 本轮未调用浏览器、未访问真实服务、未读取或记录口令、未触碰未知 Agent 进程 `31708`，也未修改产品、测试或正式配置。

## 探针目标与结论边界

拟用已有正式引用模型 `F9F01665D4A98E1FF996CD8A48D3C373` 所属空间 `944DEE5A0E5170F903E0E008172C4CD2`，对既有元模型 `Base_DataModel` 增加临时命名视图，按精确条件 `Type = '字典' AND DbId = '327D74EC0ABC4196AA75C56D944B8201'` 执行 `loadFromServer({allPages:true})`。要求正式返回 `Loaded`、`rows.length === total`、六个身份字段可读，并验证过滤结果中存在指定模型 ID / T 空间的正向引用。

即使受控查询完整且只读，它最多说明**本次认证 scope 经 SPARK data 正式查询可见范围**的结果。它不证明跨租户、跨实例或服务端未授权范围没有引用；空结果也不能被升级为全局删除安全证明。目标模型和字典的 ID 在脚本中只作为精确筛选/核验值，不创建或伪造模型、DataSet、权限回执。

## 正式装配路径可行性

源码支持一个窄的、同 DataSet 的正式查询路径：

1. `loadLowcodeDataSpaceMetadata(T)` 通过当前应用的 `scenarioViews.readText` 读取正式设计场景 `pagedata.json`，再由 `loadScenarioDataSet`、`LowcodeDataSpaceAssembler` 和 `DataSpaceRuntimeApi.bindModelView` 组装正式 DataSet。现有 `LowcodeDataSpaceMetadata` 只要求单空间默认视图完整读取；探针不会修改或放宽它。
2. 在已装配 `Base_DataModel` default DataView 上调用 `createQueryView(tempId)`。源码合同说明该方法复用同一个正式查询 owner / 资源身份、注册为同表独立视图，不复制行、选择、草稿或权限；它会暂时复制 default 配置，因此脚本随后仅在临时视图清空继承的 `queryContext` 并设置 `filterExpression`、`queryConfig` 和字段投影，不写 default。wire请求还须证明没有残留 `inputParams.dataSpaceId`，以免把目标空间过滤假装为跨空间查询。
3. 查询字段必须已在 default DataView 的正式输出列与 resource field projection 中出现；不能造一个模型定义或重新绑定 owner。临时视图使用已有 DataView 查询 owner 执行 SPARK data 查询，字段权限由返回结果和 `fieldAccess` 检查。
4. default 视图前后比较过滤、queryContext、完整 `toJson()` 摘要、当前行集摘要、rows/total 与 requestState，必须完全相同；完整配置和行数据只以 SHA-256 摘要留证，不把 default 业务行写入结果文件。临时视图明确不启用结果缓存；既有查询缓存默认不缓存完成结果，且 default 查询已完成，不存在并发 in-flight 复用。退出时先销毁临时视图，再销毁正式装配 DataSet。保存、上传、删除及除认证/正式场景文件读取/GetData 之外的请求均由守卫阻断。

正式合同位置：

- `src/lowcode/data-space/lowcode-data-space-runtime.ts`：正式元数据 DataSet 装配和 scope 检查。
- `src/lowcode/data-space/lowcode-data-space-metadata.ts`：default view 单空间范围、Loaded/total 与字段权限验证。
- `src/lowcode/data-space/lowcode-data-space-assembler.ts`：正式模型装配后逐 view 绑定同一 runtime owner。
- `packages/spark-data/src/data-view.ts`：`createQueryView` 复用正式 owner/身份并创建可销毁的同表独立查询视图。
- `packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-cache.ts`：默认不缓存完成结果；只有视图显式配置 cacheType 才启用结果缓存。
- `packages/spark-data/src/data-table.ts`：`destroyView` 命名视图清理。
- `packages/spark-data/src/data-view.ts`、`query/filter/data-view-filter-codec.ts`：DataView `loadFromServer` 完整读回、fieldAccess 与标准 filter 编码。
- `config/pages/data-platform/data-space-design/pagedata.json`：`Base_DataModel` default 仍保留其原 `dataSetId = GetInputParam(dataSpaceId)` 过滤。

## 文件及运行约束

- 预备脚本：[b1-reference-probe-readonly.mjs](./b1-reference-probe-readonly.mjs)。**未执行**。
- 离线守卫函数：[b1-reference-probe-guard.mjs](./b1-reference-probe-guard.mjs)；离线自检：[b1-reference-probe-guard-self-test.mjs](./b1-reference-probe-guard-self-test.mjs)。自检从正式 `lowcode-application.ts` 加载 `applicationCatalogQuery` / `navigationRootQuery`，验证两种完整请求体仅凭固定 FormKey 可通过；另验证正式装配请求缺少 tenant 或 app scope 会拒绝。该自检不调用 DataView/HTTP client，不发服务请求。
- 结果路径只在将来经复核、获准 live 执行时由脚本以 `flag: 'wx'` 新建：`node_modules/.cache/metadata-integration-20261024/b1-reference-probe-readonly-result.json`。
- 脚本复用既有 Vite SSR、`lowcodeApi.platform.login`、`activateApplication`、`readRequestScope`、`loadLowcodeDataSpaceMetadata(T)` 正式装配及正式 SPARK DataView 路径；不额外读取/解析第二份 pagedata。DPAPI XML 凭据只经进程内存传入登录函数，不被序列化、打印或放入请求 trace。
- 请求 allowlist 仅允许 POST `/api/LoginAuthority/UserLoginByEnt`、`/api/File/content/text`（仅目标正式设计场景 `pagedata.json`，body 形状按 `LowcodeDesignApi.fileInfo` 正式实现核定）、`/api/DataOperation/GetData`。其余路径/方法在客户端拦截器中阻断。应用选择阶段仅接受正式 `applicationCatalogQuery()` 或 `navigationRootQuery(APP)` 完整请求体、固定 `LOWCODE_APPLICATION_CATALOG_FORM_KEY`，且此时要求没有 `tenant-id` / `X-AppId` header；该请求形状直接从正式 builder 比较，不手工发请求或仿造请求体。正式装配阶段限制到源码确认的查询模型 `Base_DataSet`、`Base_DataModel`、`Base_DataModel_Field`、`Base_DataModel_Relation`、`View_TblList`、`Base_TblField`：装配读取正式数据空间/模型/字段，legacy relations 读取 Base_DataModel_Relation，数据库来源主键核验读取 View_TblList/Base_TblField。探针阶段只允许 `Base_DataModel`，wire Filter 必须严格匹配恰好两条类型和 DbId 条件，wire `inputParams` 必须为空，Fields 必须只含六个身份字段对应的正式 source fields。装配和探针GetData继续核 `tenant-id=NewApp`、`X-AppId=APP`、`x-FormKey=设计场景ID`；请求只记录白名单身份、路径、表/过滤/字段/分页和inputParams摘要，不记录header全量、token、密码或完整响应体。
- 脚本在低层 `DataSet.saveChanges`、`DataView.saveChanges`、`DataView.saveQueryViews`、文件上传 owner 上安装拒绝守卫；预期 `blockedMutations === 0`。仅 `DataSet.destroy` / `DataTable.destroyView` 清理本地读取对象。
- 登录使用现有正式 `/api/LoginAuthority/UserLoginByEnt` 的未认证调用合同，只核 request body `entName === NewApp`；该登录请求没有 `tenant-id` header，脚本不对它要求此header，也不记录 `strUser` / `strPwd`。登录完成后还从正式会话快照核 `session.enterprise.shortName === NewApp`，然后调用原 `activateApplication(APP)`。
- 若任何阶段失败，脚本保留原始失败 stage，仅输出静态 safeCode / errorType 和脱敏 requestTrace 到 `b1-reference-probe-readonly-selection-failure.json`（新建模式，不覆盖前两轮证据）；拦截器拒绝的 safeCode 通过独立变量留存；不输出原始异常、响应体或凭据。

## 当前未在线证明的事项

本任务只确认前端正式装配/查询调用链可承接候选探针，没有验证部署服务是否允许当前认证 scope 通过 `Base_DataModel` 视图看到其他空间的模型行，也没有验证总数/字段权限的在线返回。研究报告中的 Java 源码说明及历史 fixture 都不能替代该受控在线观察。在线复核如遇字段不可读、scope 不匹配、请求不完整、未知额外请求或异常响应，脚本应失败并保留“范围/结果未知”，不能自动切到直接 HTTP、去掉权限过滤或按无引用继续删除。

修订轮 1：登录守卫按真实未认证合同核 body.entName；业务读取scope守卫不变；拒绝 safeCode 独立保存；失败文件改为 retry-failure，保留首轮日志与failure证据。修订轮 2：仅应用选择阶段放行两种正式query builder完全相等的请求并核固定FormKey及无scope头；登录后核会话shortName；其他请求守卫不变；失败文件改为selection-failure。修订轮 3：应用选择分支移至tenant/app断言之前；正式装配/文件/探针仍经严格scope helper；新增以正式query builder为输入的离线守卫自检。三份文件 `node --check` exit 0；离线自检 exit 0、5项通过（两个selection query通过，formal缺tenant/缺app拒绝，scope正例通过），未调用服务；Vite middleware输出一条本机WebSocket端口占用/优化器提示，不影响自检断言。未运行live脚本。SHA-256：probe `18EC1C577E296633088DF92025C5220743837AFF4B64C81C6A583F26AF74C82C`；guard `3626EF3BC2F83532F461E11A4E6452FCF902589D7E71F3C545B06843ECDBF242`；offline self-test `69B75B80E51E521C806EB1DF57016FD7ED8BCE1902A3F2B773F3B842D43A58F4`。

修订轮 4（离线 helper 修复）：第三次 live 日志显示正式装配完成 11 个请求，但在发出临时 GetData 前失败；不重放 live。源码确认 `ViewMetadata.filterExpression` 是 plain `DataViewFilterTree`，`DataView.configure()` 通过 `filterExpression` setter 解析 plain tree；正式调用也将 `DataViewFilter.group(...)` 转为 `.toJSON()`。探针现将临时 filter 传为 `.toJSON()`，并分别记录 `temporary-view-configure` / `temporary-view-query` 阶段。离线复现脚本使用真实 `DataSet.fromJson`、`DataView.createQueryView`、正式 `captureDataSpaceViewQuery` 和 `encodeDataSpaceQueryOptions`，证实 Filter 类对象触发字段树解析错误，而 plain JSON tree 可编码出精确 AND 条件、六个字段、空 inputParams；没有执行查询器或网络请求。安全失败记录新增经过白名单筛选的源文件/行/列栈帧，不保存原异常消息，写入独立 `b1-reference-probe-readonly-binding-failure.json`（新建，不覆盖先前证据）。离线检查 `node --check` probe 与 helper test 均 exit 0；自测 exit 0、14项断言通过。Vite 插件仍报告本机 WebSocket 端口占用，但这次离线自测通过且不发网络请求。第三次 live 原始输出仍是失败证据，不构成本轮修复后的在线证明；修订后的 probe 尚未再次 live。SHA-256：probe `E3CC0077743EEF3821F43CFBEE13DFB2516BDB3111BAF9C134AF58E418D67E60`；offline self-test `2B3055DB80F654A1C6EB99C00932AD3047F1AE6936CD1C455C1F919BE4EEFBC9`。
