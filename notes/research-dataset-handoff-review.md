# DataSet 整合工作交接复查

> 历史复查记录；当时的未修复状态、旧合同和草案指针不再指导实施。2026-10-07 当前交付与验证见 research-project-blueprint-integration.md 末节，产品事实以源码和正式文档为准。

日期：2026-10-06  
状态：复查完成；发现的问题尚未修复，P3 不据既有绿色测试自动开工。

续作方案更新：用户纠正数据空间存在后端表中、按场景 ID 使用，并明确一份 pagedata 对应一个场景，实际新增多 DataView 与 viewCascades。现行草案为 `plan-scenario-dataview-extension-integration.md`；此前两稿已 superseded，单文件多场景集合不得实施。以下代码复查证据保留，不能将展示快照或文件编辑链重新解释为空间正式持久化真源。

## 结论

Copilot 接手后的工作树已完成部分 P1/P2 代码与测试，但不能把 P1/P2 整体视为已验收。保留三类骨架、显式场景/模型字段、一模型一张表、自动选择 false 往返的方向成立；身份运行真源、页面切换顺序和持久化隔离仍有可复现缺口。

本轮只读审核代码、运行既有检查及内存夹具探针，写入本报告并修订续作顺序。没有改生产源码或测试，没有回退现有改动，没有修改 Java、写后端文件、连接真实数据空间或提交 Git。未按作者猜测归属；以下结论针对当前工作树，包括已有的另一项 API 删除工作。

## 审核范围与证据

- 本仓 HEAD：`a7f2cf2e16e43dc1051855dfd87b0dbdf2cc7834`，分支 `feat/agent-workflow-node-contract`。
- 审核差异：21 个已跟踪修改文件，以及 3 个新测试文件。计划、研读记录另行对照，不把记录当作代码事实。
- 主要范围：`spark-data` 身份和序列化；宿主模型/关系/运行装配；相关测试；3 份类模型生成物；`getCurrentUser` 删除及消费者台账；`knowledge/page-design.md` 的新增规则。
- 核对调用链：`SparkPageRenderer.resolveRuntimeDataSet → loadBoundDataSpaceDataSet → LowcodeDataSpaceAssembler → DataSet/Table/View → CrudService → DataSpaceRuntimeApi`，以及页面文件序列化和容器 DataViewKey 解析。
- 后端只读证据：`E:/lowcode-jdk17/lowcode-mainbody/src/main/java/com/htong/controller/LoginController.java:224`、`:254`。
- 探针复用现有测试中的合成模型与内存 HTTP 客户端，未使用真实业务记录或网络服务。

## 需要处理的发现

### F1 — P1：页面引用尚未迁移，运行装配已经统一切换身份

**位置**：`src/lowcode/data-space/lowcode-data-space-assembler.ts:198`、`:252`；`src/lowcode/data-space/lowcode-frontend-model-adapter.ts:13`。

装配器直接采用 `tableName=modelId`，只创建 `default` 视图。旧的 `RESOURCE-PARENT@MODEL-PARENT` 因而立即失效。当前 `SparkPageRenderer.vue:635` 对所有绑定页面直接调用宿主装载器，装载器没有页面迁移预览/审核/引用校验门；P7 尚无实现。

内存探针得到 `oldPageReferenceResolved:false`。这证明满足旧引用条件的页面会丢失原寻址，不证明某个线上页面已经发生事故。进一步读码发现容器 `view-data-source.ts:135` 在键解析失败后可以在 `:142` 回退父级继承数据源，不能声称所有旧引用都会明确报错终止；有继承源时可能显示另一来源的数据。

用户已确认“保留页面内稳定 tableName”和“先预览、人工审核、逐页切换”。不保留旧运行协议不等于可以跳过逐页转换。`tableName=modelId` 可作为新页初始命名策略候选，不能替代已有页的稳定名称和显式绑定。

**修正方向**：页面局部 tableName/viewId 的映射与引用检查必须在切换运行装配前成立；不能靠直接改断言证明迁移已完成，也不建议补旧协议兜底。

### F2 — P1：新增身份字段与实际查询路由仍是两份状态

**位置**：`packages/spark-data/src/dataset.ts:381`、`packages/spark-data/src/data-table.ts:81`；`src/lowcode/data-space/lowcode-data-space-assembler.ts:207`、`:212`、`:215`。

`scenarioId`、`modelBinding` 是可写公共字段，但 HTTP 头和请求/响应转换闭包仍捕获装配时的 `formKey`、`binding.model`，不消费当前 class 身份。探针通过公开字段把场景和模型 Name 改成新值后，查询成功且出现：

```json
{
  "declaredScenario": "FORM-RENAMED",
  "declaredModel": "RENAMED-MODEL",
  "sentScenario": "FORM-1",
  "sentModel": "部门模型"
}
```

这与源码注释“后端模型改名只更新 modelBinding”及计划的身份唯一真源相冲突。当前没有证明权限被越权；已证明对象声明身份与实际访问模型不一致，不能在此基础上直接叠加保存。

**修正方向**：在一个生命周期边界内确定唯一身份来源与合法变更入口。查询、响应登记、权限上下文、保存必须使用同一份已验证身份；身份替换需要同步失效旧结果/请求。不能只让请求读取新字段，却保留旧权限上下文。

### F3 — P2：仅有模型绑定的表仍被当成本地数据落盘

**位置**：`packages/spark-data/src/data-view.ts:471`、`:2362`。

新契约允许 `scenarioId + modelBinding`，`resourceType` 和 `api.list` 均可缺省；新增身份测试也采用该形状。但 `_holdsRemoteRows()` 只查看资源类型和 list 端点，不查看模型绑定。给这种表放入一行后，`dataSet.toJson().tables.Orders.views.default.rows.length` 为 `1`。

当前宿主装配器会补上 resourceType，因此此问题不代表该装配器已泄漏行；触发面是合法的绑定元数据直接创建/恢复的 DataSet。后续把 SPARK 接口收进 API 包后，更不能依赖某个 HTTP 端点属性判断数据是否可持久化。

**修正方向**：把绑定模型数据与本地静态行的序列化分类补齐。明确拒绝 `static-data + modelBinding` 等互斥配置；配置序列化只保留定义，不能把绑定模型的结果落盘。应以独立用例验收，不能沿用同一个遗漏 modelBinding 的测试分类谓词。

### F4 — P2：权限字段清理只覆盖第一层行

**位置**：`packages/spark-data/src/data-view.ts:125`、`:2364`。

新增 `withoutPermissionWireFields()` 只对根对象做解构。合成静态行包含 `children: [{ id: 'c', lingma_sys_key: 'synthetic-child', lingma_sys_params: ... }]` 时，序列化仍包含该子行的令牌和权限集合，探针结果 `nestedPermissionSerialized:true`。

这是“权限线协议字段不进入 JSON”修复未覆盖的结构，非新引入的线上授权漏洞。修复应区分框架定义的嵌套行与普通业务 JSON 字段，不宜为通过探针盲目删除所有业务对象中同名键。

**修正方向**：按实际树/行结构清理已识别的运行态字段，或者在配置边界明确拒绝残留的权限载荷；补嵌套行用例，并验证业务 JSON 不被破坏。

### F5 — P2：scenarioId 校验可被公开构造路径绕过

**位置**：`packages/spark-data/src/dataset.ts:449`、`:457`；`packages/spark-data/src/metadata.ts:105`、`:206`。

`DataSet.fromJson` 使用 `normalizeScenarioId` 拒绝空白字符串；公开 `new DataSet({dataSetName:'d', scenarioId:' ', tables:{}})` 直接登记它，探针结果 `constructorAcceptsBlankScenario:true`。这不是 TypeScript 能拒绝的输入，因为空白值仍是 string。

**修正方向**：将同一个身份不变量落实到所有合法入口，而不是只覆盖 JSON 工厂。构造、反序列化、replaceFromJson 及后续合法重绑定须有一致断言。

### F6 — P2：另一任务删除 getCurrentUser 的依据不成立，生成面还未同步

**位置**：`packages/spark-lowcode-api/src/platform/lowcode-platform-api.ts` 的删除差异；`packages/spark-lowcode-api/src/index.ts:123`；`generated/dts-class-model/files/packages/spark-lowcode-api/src/platform/lowcode-platform-api.ts.json:1274`。

当前源码确实已删 `getCurrentUser`、`LowcodeCurrentUser` 与专属测试，但后端 `LoginController.java:224` 仍声明 `@GetMapping("GetUserInfo")`，`:254` 仍执行 `loginService.GetUserInfo()`。端点台账中查不到不能证明后端删除；台账生成器 `generate-ledgers.mjs:67` 只向后扫描 1800 字符寻找方法，不能替代控制器源码。

生成类模型仍公开 `getCurrentUser` 和 `LowcodeCurrentUser`，会使模型消费者得到与实际 API 不同的公共面。本轮 `verify:class-model` 仍通过，说明该检查没有证明这一删除与生成面同步。

这是已有独立改动，本轮没有擅自恢复。应单独决定恢复原 API 或依据明确的新需求保留删除；不能把“后端接口不存在”作为继续依据，也不能混入 DataSet 的验收。恢复或删除都应连同对应生成面、测试、台账闭环处理。

### F7 — 续查：销毁运行 DataSet 后，迟到的查询仍能回填

**位置**：`data-view.ts:1383`、`:1477`、`:2195`；`strategies/crud-delegate.ts:414`；`usePageDataSet.ts:47`；`SparkPageRenderer.vue:714`。

2026-10-06 追加内存探针 `%TEMP%/spark-dataset-review-lifecycle.mts`：复用既有模型夹具，用 deferred HTTP 启动查询，调用 `dataSet.destroy()`，再释放响应。输出 `destroyed:true, viewDestroyed:true, rowsAfterLateResponse:1, requestState:3`，请求仍返回 `success:true`。没有联网或写业务数据。

原因证据：响应登记只比较 requestId；destroy 没有推进该代次，CrudDelegate.destroy 也未取消请求。页面 hook 只释放引用、不 destroy，是为保护 PageNode 持有的设计实例；对宿主另行装配的运行实例则缺少对应所有权处理。页面 `isStale()` 分支也未释放刚得到的运行 DataSet。

这是落实“绑定变化后旧请求与权限失效”的必要前置闭环，不能靠调用现有 destroy 即宣称完成；不把它归因于 Copilot 新增身份字段。需区分借用的设计 DataSet 与页面拥有的运行 DataSet，验证迟到成功/失败、重复销毁、页面卸载及过期装载。

F4 续查补充：`DataView._applyComputedColumns:791`、`visitRowsDeep:954` 均把行的 `children` 数组中的对象作为子行递归处理，不要求 treeConfig。权限清理应遵循同一行结构，只遍历这些子行，不能递归清理任意业务 JSON 属性。

### F8 — 多来源复查：设计读取仅允许数据库来源，来源类型在适配时丢失

用户明确数据空间组织多种数据源，不限于物理表。现有 `packages/spark-lowcode-api/src/platform/data-space/design/data-space-design-api.ts:308-315` 却对非 table/view 来源直接拒绝；`data-space-resource-type-wire.ts:26-33` 将数据库视图与逻辑视图合并为 view，重新编码统一成为“视图”；`src/lowcode/data-space/lowcode-frontend-model-adapter.ts:48-52` 将 interface/json/file 统一变成 third-party-api。

2026-10-06 追加纯内存探针 `%TEMP%/spark-dataset-review-source-kinds.mts`，退出 0：数据库表夹具成功返回 2 模型；字典、接口、JSON、文件分别因“尚无稳定资源目录身份”失败；三种来源标签被合并；数据库视图往返后变成视图。没有网络、业务写入或仓库测试源码改动。

后端 `BasicFunServiceImpl.GetData:1444-1470` 则有数据库表、数据库视图、字典、接口、JSON、逻辑视图的独立分支。文件虽在模型注释和本仓枚举出现，当前 GetData 无此分支，不能声称已经支持。`findCrudModelByName:661-685` 的数据库表限制属于该后端 CRUD 路径，不能提升为前端按查询来源拒绝保存的规则。用户已明确 addApi / updateApi / deleteApi 写入目标由后端处理，前端按原模型身份提交，不解析目标或映射字段。

这是目标覆盖缺口和已存在的适配前提，未断言由 Copilot 引入。详见 `research-page-multi-data-space.md` 的多来源复查；需按正式模型输出读取字段，保留真实来源类型，核对查询和结果消费，再纳入人工审核的精确实施范围。后端操作目标处理不扩展为前端实现项。

## 已确认仍未实施的目标，不归咎于新增回归

| 目标 | 当前证据 | 后续要求 |
|---|---|---|
| GetData 参数由 DataView 表达 | 实际请求仍主要由 captured model 生成；命名视图设置投影 output=false 后，wire Fields.IsOutput 仍为 true | P3/P4 完整映射投影、参数、树等选项；未支持项显式拒绝 |
| 输入参数 | 合成探针把 inputParams 放入当前通用 queryContext 后，wire inputParams 仍为空 | 这只证明该透传路径不存在，不能把这种临时嵌套写法认定为已批准的新契约 |
| 权限完全沿用 sparkproject | 当前仍返回 DataPermissionSnapshotInput，组件仍读旧权限入口 | 原实现移植和 DataView.permission 接入未完成 |
| 查询脏保护与失败 stale | DataView 尚无目标 stale/dirty 查询防护闭环 | 不能把当前查询测试通过作为已满足确认项 2/6 |
| 同模型冲突及一次 SPARK save | 目前仍只有查询端点与原保存编排 | P5 尚未完成 |
| 表＋JSON 保存闭环 | 当前绑定页面不叠加 pagedata；页面保存网关及正式定义写回未接通 | 仍在完整目标内，不能代选为“本期只读”就宣称整合完成 |
| 关系语义 | 关系解析 collectFieldPairs 原有代码不区分 AND/OR | 是既有风险，须在后续关系验收处理，不写成 Copilot 新引入回归 |

## 本轮执行结果

先运行类型检查，再运行后续检查。以下结果来自本轮命令输出，不复制计划中的历史数量。

| 命令 | 结果 | 证明边界 |
|---|---|---|
| `pnpm run typecheck` | 退出 0 | 当前类型基线 |
| `pnpm run lint` | 退出 0 | 当前 lint 基线，无自动修复 |
| `pnpm run verify:ai-codegen` | 退出 0，939 文件 | 规则扫描，不证明业务行为 |
| `pnpm --filter @spark-appworks/spark-data run test:run -- --reporter=dot` | 30 文件、413 测试通过 | 包内既有断言；输出有既有 Network Error 路径日志，最终断言全部通过 |
| 根 Vitest 定向 6 文件（命令见下） | 51 测试通过 | 序列化夹具、装配及寻址；与包测试有交集，不相加声称独立用例数 |
| `pnpm --filter @spark-appworks/spark-lowcode-api run test:run -- src/platform/lowcode-platform-api.test.ts --reporter=dot` | 1 文件、12 测试通过 | 删除后剩余 API/认证断言，不证明删除依据正确 |
| `pnpm run verify:class-model` | 退出 0；4 文件、49 测试通过 | bundle/模型基础检查；未检测 F6 的过时公共面 |
| 3 个只读内存探针 | 均退出 0，复现 F1/F2/F3/F4/F5 及输入映射缺口 | 合成夹具；不是在线数据空间或浏览器验收 |

```text
pnpm exec vitest run tests/page/page-data-serialization-roundtrip.test.ts tests/auth-nav/lowcode-data-space-runtime.test.ts tests/auth-nav/data-space/lowcode-frontend-model-adapter.test.ts tests/auth-nav/data-space/lowcode-model-relation-adapter.test.ts packages/spark-data/src/tests/data-view-key.test.ts packages/spark-data/src/tests/data-view-resolver.test.ts --reporter=dot
```

未重跑根全量 1329 项、全部包测试、完整 verify:rules、构建或浏览器端到端；未把这些标为本轮通过。27 个 pagedata 夹具中有 3 个历史不可解析项，当前测试将它们列入显式清单并在逐页用例中提前返回；51 项通过不等于 27 个页面均完成有效往返。

## 续作顺序与审核点

1. **先收敛身份与页面切换方案**：固定“页面稳定 tableName + 显式 modelBinding”“DataView = GetData 查询定义”“一模型可多个视图”；明确当前新页默认命名与已有页迁移的差别。F1/F2 涉及 class 生命周期与已有页行为，列为重要人工审核项。
2. **修正 P1/P2 的局部不变量**：F3 绑定模型序列化、F4 嵌套权限载荷、F5 构造校验分别作为最小闭环，逐个验证；不能一次散射修改。
3. **F6 独立处理**：保留当前差异，给出明确处置后再改；不以它阻止继续只读完善 DataSet 方案。
4. **再接原 SPARK 实现**：P3 必须列出原实现→目标文件映射、宿主与请求/API 层内部的传输及 scope 接线、逐项参数/权限/保存向量。按用户最新要求，应用与租户只在请求时处理，不进入 DataSet/Table/View。当前 P3 仍未精确到全部文件，不能直接开工。
5. **保存与持久化继续覆盖完整目标**：重要的真实写入和逐页切换由人工批准具体对象与范围；Java 仍不改。

计划顶部只写“P1 已批准”，正文却记录 P2a/P2b 已完成；本轮得到用户确认 Copilot 已接手大量工作，但不据文档矛盾反推每项授权有无。保留实际成果和历史记录，以本次审查结论收敛下一轮方案。

## 后端页面文件持久化续查

### F9 — P1：文件保存回执会清掉保存期间产生的新修改

**位置**：`packages/spark-project-model/src/project/project-workspace.ts:581-585`、`packages/spark-project-model/src/page/config-page.ts:177`、`packages/spark-project-model/src/page/content/text-file.ts:54`、`packages/spark-project-model/src/page/content/dataset-file.ts:52`。

`savePageFileFromModel` 发送当时的 getFileText，await 后却调用不带提交快照的 markFileSaved。PageTextFile 把回执时的当前文本记为 savedText，PageDataSetFile 直接把 dirty 清零。

临时只读探针 `%TEMP%/spark-dataset-review-page-save.mts` 使用真实 ProjectWorkspace、ConfigPageNode 和内存网关：先提交 A，挂起回执，继续编辑 B，再释放 A 的回执。script.js 与 pagedata.json 均复现 `sentDiffersFromCurrent=true, dirtyBeforeReceipt=true, dirtyAfterReceipt=false`。`pnpm exec tsx --tsconfig tsconfig.json <probe>` 最终退出 0。未发网络请求、未改仓库测试源码；首次探针仅因 Windows ESM 路径格式失败，改用 file URL 后运行成功。

**方案要求**：保存确认必须对应实际提交并回读确认的快照，继续保留后来编辑的 dirty 状态；同文件保存需有顺序。修正应覆盖文本、规则、数据集三个文件模型的保存基线和 undo/redo，而非只在当前文本不同于提交文本时跳过 markSaved：后者不能更新真正的持久化基线，撤销后仍可能误报状态。现有并行保存 dirty 文件也不构成四文件事务。

本发现是当前框架的既有保存缺口，不归因于 Copilot 的 DataSet 改动。在接通后端页面保存前列为 G1 的独立修复闭环，须随方案人工审核，当前未实施。

本轮后端既有测试 `FileServiceImplContentTextTest` 4 项、`FileServiceImplDownloadTest` 3 项均通过；multipart 空文件上传另行尝试的临时 JShell 验证未取得有效输出，不能记为通过。详细命令、范围和页面路径取证见 `research-page-multi-data-space.md`。

研读期间本仓 HEAD 从 `a7f2cf2e1` 推进至 `76d06b821`（同一分支），包含之前的工作树成果和 notes；本 agent 未执行 commit。继续以该提交为新基线保留成果，不据提交存在反推剩余实施已获批准。后端 HEAD 仍为 `37770101`，工作树干净。

## 正式设计写回前置复查

### F10 — P1：不完整的设计显示投影被接受为整份定义恢复前像

**位置**：`packages/spark-lowcode-api/src/platform/data-space/design/data-space-design-api.ts:219`、`:383`、`:411`，`design/data-space-design-mutation.ts` 的 DataSpaceDesignMutationCommand 与 prepareDataSpaceDesignMutation。

`readTable` 对四张正式定义表各发一次 GetData，resultRows 只取 Items，不保留 total，也不继续分页。modelFields 只保留 type 为空或 dataModel 的字段，排除 inputParams 类别；输出还丢弃 description、allowAIAdd 等正式属性。返回对象可用于当前部分展示，但不是完整正式记录。prepareMutation 仅校验空间/模型归属，就返回 `compensation.kind=restore-data-space-design-snapshot`，把这一投影当作恢复前像。

临时探针 `%TEMP%/spark-dataset-review-design-baseline.mts` 基于当前既有设计 API 测试夹具，调用真实 DataSpaceDesignApi.read/prepareMutation：令模型响应 total/Total=2002 但 Items 只有 2 条，添加一个 inputParams 字段及一个字段 description 标记。命令 `pnpm exec tsx --tsconfig tsconfig.json <probe>` 退出 0，断言结果如下：

```json
{"declaredModelTotal":2002,"returnedModelCount":2,"designReadRequests":4,"inputParameterFieldRetained":false,"originalFieldDescriptionRetained":false,"restoreDescriptorProduced":true,"writeRequests":0}
```

仓库生产消费者反查没有找到 prepareMutation 执行方。因此本发现证明的是设计写回的前置合同错误，未观察到线上数据被覆盖或恢复失败；不能据“已有恢复描述”宣称恢复链已实现。

**方案要求**：由设计 API 私有持有经过完整分页、总数/唯一键/归属核对的正式基线；展示快照仍是投影。差异保存只改明确编辑的字段和记录，不将 columns 的缺失当删除，也不将显示投影用作整份恢复。恢复按实际触及记录的完整前像及写后状态核对，结果未知先回读，不因命令带 idempotencyKey 就自动重试。正式定义操作仍经设计场景调用原 SPARK API；应用/租户留在请求层。

参考仓本轮定向验证：在 `E:/r/sparkproject/apps/appworks` 执行 `pnpm exec vitest run tests/data/data-space-design-baseline.test.ts tests/data/data-set-field-pagination.test.ts tests/data/api/data-model-field-changes.test.ts --pool=threads --maxWorkers=1 --reporter=dot`，退出 0，3 文件 16 项通过。它验证原定义基线、1001 字段分页和字段差异构造的测试合同；使用 mock，未证明真实后台写回或事务能力。未改生产/测试源码或 Java。

## 失效方案清理时保留的历史实施摘要

用户要求同步清理旧文档与旧逻辑，三份失效方案的执行步骤、结构示例和旧审核选项已退出现行入口。以下只转录原单空间计划中的实施记录，不是本轮重新执行的结果，也不推翻本报告 F1—F10 的复查结论：

- P1 曾记录：视图序列化保留显式 false、过滤部分远端行及权限字段；新增序列化与页面夹具测试。当时报告 spark-data 407 项、根 1322 项以及 typecheck/lint/verify:ai-codegen 通过。嵌套权限与 modelBinding-only 等缺口由本报告继续跟踪。
- P2a 曾记录：增加 scenarioId/modelBinding 与相关身份测试，更新三份相关 ClassModel 生成物；当时报告 spark-data 413 项、根 1328 项及四类检查通过。
- P2b 曾记录：改为一模型一表，移除按物理资源分组与旧查询身份路由，改写消费者测试；当时报告 spark-data 413 项、根 1329 项及四类检查通过。它固定 default 视图和 modelId 表名的实际做法仍须按当前场景/模型/多视图合同复核，不能成为新目标的限制。
- 原计划的授权记录仅明确 P1，并同时出现 P2 实施记录；此不一致已在交接时记录，不能据它推定后续实施获得授权。已有代码保留，未回滚、未重做。
- 原 P3—P8 的必要目标仍由当前草案承接：原 SPARK 查询/权限/保存实现、DataView 消费、同场景保存、表与 JSON 持久化、人工审核迁移、真实行为验收与文档/生成物清理。废弃方案不代表删减这些目标。

唯一现行方案为 `plan-scenario-dataview-extension-integration.md`，状态 draft。后续代码、测试、产品文档和生成物在各批准闭环一起替换；不以历史通过数字宣称目标完成。
