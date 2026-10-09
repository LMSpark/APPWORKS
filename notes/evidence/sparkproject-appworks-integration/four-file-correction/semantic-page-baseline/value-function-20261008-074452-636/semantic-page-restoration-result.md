# 数据空间设计页恢复阶段结果

状态：implementing。层次复核已完成，模型表单及 Filter 编辑已通过本地集中验收；完整设计页和线上验收尚未完成。下文早期暂停及测试数量是阶段记录，以本节为当前状态。

## 主控集中验收（2026-10-08，模型层与过滤配置）

- 参考数据空间目前只使用模型层，不能等同本仓 DataSet。设计页自己的 DataView 编辑正式设计元数据，目标空间模型/字段/关系是被设计内容；场景视图配置和运行实例另有责任方。AGENTS.md 0.5 与总计划已明确这一边界。
- 模型请求配置、字段排序/分组、Filter 结构化编辑已接入四文件，保存沿既有 DataSet owner 和精确回读。真实 SparkPageRenderer 测试覆盖条件树应用 → 页面事件 → 模型保存 → wire Filter 回读，并证明没有改设计器自身 queryContext/filterExpression。
- 已修复主控发现的测试类型错误和实际模式错误。原始 Base_DataModel.Type 使用“接口”“视图”进入请求入参模式，“数据库视图”仍显示普通 Filter；不是来源目录的 interface/logicView 枚举。正确参考 SHA 为 842dec4f11b333df904b9a4e26b6566b0802bab8，旧末位 4 是记录错误，不存在参考仓对象缺失阻塞。
- Filter 窄控件当前事件为 `{contextKey,value}`，上下文包含模型/目标空间/设计场景/加载代次；旧事件拒绝。空间参数并入 SystemData 目录并保留内置项。控件 suite 为 5 项；旧段落中的字符串事件和 4 项是此前版本记录。
- API runtime 测试已改用公开 rows/primaryKey 查找，保留未找到返回 null 和原断言；没有开放 DataView 私有方法。该项快照在 semantic-page-baseline/packages-spark-lowcode-api-src-platform-data-space-runtime-data-space-runtime-api.test.ts.before-public-rows-fix。

本轮实际验证：

| 执行者 | 命令/范围 | 结果与证据 |
| --- | --- | --- |
| 主控 | pnpm run typecheck | exit 0；semantic-model-filter-acceptance-typecheck.log |
| 主控 | pnpm --filter @spark-appworks/spark-lowcode-api run typecheck | exit 0；semantic-model-filter-api-typecheck.log |
| 主控 | 三个设计页/过滤/图测试文件 | 48/48；semantic-model-filter-page-tests.log |
| 主控 | data-space-design-api.test.ts | 59/59；semantic-model-filter-api-design-tests.log |
| 执行者，主控已审代码 | data-space-runtime-api.test.ts | 95/95，精确 lint 通过；代理回报；主控随后独立通过包级 typecheck |
| 主控 | 本轮脚本、控件、API、测试与组件出口精确 ESLint | exit 0；semantic-model-filter-lint.log |
| 主控 | verify:pages-config / verify:ai-codegen / verify:dirs | 均 exit 0；semantic-model-filter-{pages-config,ai-codegen,dirs}.log |
| 主控 | 受影响 tracked 文件 git diff --check | exit 0；有 CRLF 提示，无空白错误 |

页面测试环境输出两次 jsdom 的 HTMLFormElement.requestSubmit 未实现提示，断言全部通过；这不等于浏览器原生表单或线上持久化已验收。没有部署或线上写入。ValueFun/来源入参映射、注册名改写、来源建模、数组/数据处理、关系/布局/预览、旁侧配置和整页正式入口仍未交付，整体任务保持 implementing。

## 当前落点

- `config/pages/data-platform/data-space-design/rule.json`：模型列表分开展示正式注册名 `Name` 与来源名 `MetaName`；新增模型、字段的 `r-form` 当前行编辑器、取消/保存入口和读取身份字段。`Name`、`MetaName` 与来源类型仍只读。模型表单目前允许编辑 `description`、`RequestComplete`、`IsBusiness`、`IsBusinessMain`；字段表单目前允许编辑 `description`、`AsName`、`IsOutput`。
- `config/pages/data-platform/data-space-design/script.js`：使用当前正式 `DataView` 行、字段访问状态和 `DataSet.saveChanges` 处理模型/字段本地编辑；保存前校验当前页面、目标空间、数据集、视图与行身份，保存后检查单行正式回执并按空间身份全量精确回读。业务标志及输出标志按正式 INT 字段将 checkbox 的布尔编辑值归一为 `0/1`。不确定保存结果会阻止重复提交。已有参数专用流程未被替换。
- `config/pages/data-platform/data-space-design/style.css`：为新模型、字段表单增加页面局部样式。
- `tests/runtime/page/design/data-space-design-four-file.test.ts`：扩展正式模型 fixture，区分 `Name`/`MetaName` 并补上请求配置字段；`IsBusiness`、`IsBusinessMain`、`IsOutput` 使用正式 INT 表达。补充模型配置保存回执及精确回读、字段取消不提交的用例。

本阶段没有改 `pagedata.json`、关系图组件或 graph 测试。`Name` 改名、请求 `Filter` 结构化编辑、输入参数字段映射、来源建模、前端模型/数组/数据处理、关系图持久化、预览和旁侧标签/授权流程均未完成；当前改动不是整页交付。

## 验证

- 基线：主控运行 `pnpm run typecheck`，session `21086`，exit code `0`，记录在 `semantic-page-baseline-typecheck.log`。
- 当前最小验证：`pnpm exec vitest run tests/runtime/page/design/data-space-design-four-file.test.ts`，exit code `0`，36/36 tests passed。该套件覆盖原用例及本阶段新增的模型配置保存/回读、字段取消用例。
- 本阶段未运行 typecheck、lint、graph 测试、整页验收或全量测试；不得据此宣称页面完整或通过整页验收。

## 仍待确认的概念和合同

1. **模型层与本仓 DataSet 的对应关系未确认。** 参考 AppWorks 数据空间设计消费模型与字段记录；不能据此假定原对象整体就是本仓 `DataSet`，也不能将模型行、场景 `DataView` 与被设计空间的运行数据混为一层。主控需确认正式页面数据映射与每个对象的持久责任后，才能继续建立其它编辑闭环。
2. **当前 `DataSet.saveChanges` 映射是否符合原设计模型业务保存语义，尚待主控核验。** 本阶段用本仓 `DataSet`/`DataView` owner 与测试 fixture 验证局部闭环；回执及回读证明的是当前实现路径的 fixture 行为，不单独证明线上设计 API 的端到端写入合同。
3. **`ValueFun` 的设计元数据语义待核。** 正式 `Base_DataModel_Field` 有 `ValueFun` 列，固定源页面的请求参数字段编辑包含该字段；当前固定版 `spark-api.md` 将运行时 canonical `inputParams` 限定为已求值的 `{name,value}`，并禁止把 `ValueFun` 就地转成调用参数。不得因此删除设计元数据编辑，也不得在概念与写入合同澄清前将其做成运行时映射。
4. **结构化请求 `Filter` 编辑未实现。** 当前公共 FilterExpressionEditor 的合同、规则渲染注册方式及它与正式模型 `Filter` 的映射需主控核验；不能用裸 JSON 输入替代原业务表单。
5. **`Name` 注册名改动尚未追踪所有引用。** 当前只读呈现 `Name` 与 `MetaName` 两列，未提供注册名改写。

正式字段类型证据见同目录 `semantic-live-contract-check.md`。以上未确认项在获得主控裁定前不继续编码，也不以临时视图或额外参数模型猜测。

## 主控层次复核（2026-10-08）

- 已按用户纠正将模型层、场景视图配置、DataSet/DataView 运行实例分开，依据见主语义报告 3.1；原空间不整体等于本仓 DataSet。
- 当前 `pagedata.json` 的 scenarioId 是设计场景，modelBinding 指向该场景正式的 `Base_DataModel` / `Base_DataModel_Field`，没有将目标空间的模型记录直接作为本页 DataTable 定义。
- `script.js` 的 `designSaveEditingRow` 从 `designSnapshot.designDataSet` 保存指定 table/view/单行 id，并校验 `$page.getDataSet(designScenarioId)` 身份；目标空间 ID 用于校验元数据归属和 `dataSetId` 回读过滤。该代码路径未把目标空间 ID 当作设计页运行 DataSet 的身份。
- 当前 editableFields 仅含模型的 description/RequestComplete/IsBusiness/IsBusinessMain，及字段的 description/AsName/IsOutput；尚未加入 Filter/ValueFun/请求参数映射。因此已实现部分不因“空间不等于 DataSet”这个纠正而直接判废。未新增线上写入证据，保存等价性和整页验收仍待完成。
- `captureDataSpaceViewQuery` 以当前 DataView 的 modelBinding 与 DataSet.scenarioId 发请求，以 context/queryContext 形成当次 inputParams。未来编辑模型 Filter/字段 ValueFun 时，应把它们作为设计记录内容保存，不修改设计器自身的查询配置来冒充保存。
- 本轮只做文档纠偏与源码复核，没有继续修改生产/测试文件，也未重复运行 36/36 测试。整页任务未完成；续工须遵守已更新的分层合同，不能恢复原等同假设。

## 过滤控件（2026-10-08）

- `DataSpaceDesignApi.parseFilter` / `serializeFilter` 通过现有 `decodeDataSpaceFilter` / `encodeDataSpaceFilter` 转换模型元数据 wire 字符串；空白/null/undefined 仅表示未配置，损坏 JSON 或非法 wire 明确报错。
- `FilterExpressionEditor` 已由 spark-component 组件 barrel 与包根导出。新增窄适配控件读取序列化值、消费 DataColumn 和可选值函数目录，只在应用/显式清空时发出 `change(serializedString)`，不做 I/O 或保存。损坏值保留在父值中并阻断编辑；模型值、禁用态、字段或函数上下文变化会重建编辑器，废弃旧草稿。
- GetUserMasterId 的新建目录只提供部门分支，不提供角色分类字段。已有 role 取值以“已有存量值”形式保留，编辑上下文可原样应用，不丢旧协议值；正常函数目录仍可用。
- 验证：`pnpm --filter @spark-appworks/spark-lowcode-api exec vitest run src/platform/data-space/design/data-space-design-api.test.ts`，59/59 passed；`pnpm exec vitest run tests/runtime/page/design/data-space-filter-editor.test.ts`，4/4 passed；精确七文件 `pnpm exec eslint ...` exit 0。主控已记录基线 `pnpm run typecheck` exit 0（`semantic-model-layer-typecheck-after-fix.log`），本轮未重复全仓类型检查。
- 此交付只提供公共控件及 API 转换入口，尚未接入四文件模型编辑器；整页的 Filter 字段编辑与保存/回读仍待页面 writer 接线和验收。

## 模型请求与字段排序表单续工（2026-10-08）

- 修改 `config/pages/data-platform/data-space-design/rule.json`：在既有模型/字段 `r-form` 中加入 OutputType、父字段、子数据标志、自引用类型、顶层父级、缓存类型，以及字段排序类型/顺序/分组控件；增加未知配置提示。控件仍绑定设计场景当前 `DataView` 行。
- 修改 `config/pages/data-platform/data-space-design/script.js`：模型与字段查询/回读增加本轮配置字段；模型父字段候选只取当前模型、目标空间内且 Name/关联身份可见的正式字段，隐藏/脱敏字段不进入候选。未知枚举显示保留提示并作为未改字段原样保留。保存 helper 拒绝白名单外的编辑，校验当前字段写权限、模型枚举、父字段候选、Order/Group 非负安全整数及 OrderType 清空/升降序；路由目标改变会令页面快照失效。`selfType` 保留源控件 clearable 行为，允许显式清空，不自动写回默认值。
- 修改 `config/pages/data-platform/data-space-design/style.css`：增加局部未知配置提示样式。
- 修改 `tests/runtime/page/design/data-space-design-four-file.test.ts`：扩展模型/字段正式模型 fixture；TS7053 通过 `isRecord` 与 `Array.isArray` 收窄修复。新增模型请求设置与树字段候选保存/回读、字段排序与分组/清空/负值拒绝、未知枚举保留、无字段写权限拒绝和目标切换阻止等四条页面夹具用例。
- 未改 `pagedata.json`、关系图 Vue/props、graph 测试。未写线上数据。

验证结果：

- `pnpm run typecheck`（TS7053 修复后、表单续工前）：exit 0；日志 `semantic-model-layer-typecheck-after-fix.log`。
- `pnpm exec vitest run tests/runtime/page/design/data-space-design-four-file.test.ts`（当前最终源码）：exit 0，40/40 passed。
- `pnpm exec vitest run tests/runtime/page/design/data-space-design-graph.test.ts`：exit 0，1/1 passed。
- `pnpm exec eslint config/pages/data-platform/data-space-design/script.js tests/runtime/page/design/data-space-design-four-file.test.ts`（含 selfType 清空修正后）：exit 0。
- `pnpm run verify:pages-config`：exit 0；`pnpm run verify:ai-codegen`：exit 0；`pnpm run verify:dirs`：exit 0。
- `pnpm run typecheck`（表单续工后）：exit 2。当前输出指向并行 Filter 控件实现 `src/views/app/control/data-platform/data-space/design/expression/DataSpaceFilterEditor.vue` 和 `tests/runtime/page/design/data-space-filter-editor.test.ts` 的导出/类型问题；该执行者正在修复，本轮没有改动其文件，也没有重复类型检查。

剩余工作：本轮仅关闭模型请求/字段排序分组局部闭环，不代表数据空间设计整页完成。Filter 编辑器接线、ValueFun/模型入参字段映射、注册名改写影响追踪、来源建模、数组/数据处理、关系维护/持久化、预览、S01-S05 旁侧标签与授权流程及整页正式入口/线上回读验收仍待连续派工和主控核验。

### 过滤控件复核补充

- 修正前述存量 role 描述：可编辑目录严格只提供 refType=dep，不提供 role 选项或 roleClassId；既有 role 原文保留，若尝试应用则显示停用分支提示并拒绝 change。
- 编辑器事件绑定捕获当时 revision；modelValue、disabled、columns 或 functionContext 变化后，旧子组件即使迟到触发事件也不会提交。
- 最终验证：API suite 59/59、控件 suite 4/4、精确 ESLint exit 0；`pnpm run typecheck` exit 0。本轮没有改四文件，也没有完成页面接线。

## Filter 元数据编辑器页面接线续工（2026-10-08）

- `config/pages/data-platform/data-space-design/rule.json`：模型表单接入 `data-space-filter-editor`，事件由页面规则交给模型 Filter 编辑缓冲处理；组件实际从 Renderer 注册名解析。
- `config/pages/data-platform/data-space-design/script.js`：过滤值由 `designModelFilterEditorBeforeRender` 读取当前正式行/同一编辑缓冲，绑定包含设计场景、目标空间、模型 rowid 与 `designLoadRevision` 的上下文身份。变更事件重新校验当前选择、快照及 Filter 读写权限后，调用既有 `DataView.updateEditingValue`；模型保存白名单仅增加 `Filter`，保存和回读继续由既有 DataSet owner 负责。模型字段目录同时要求字段名与 FieldType 可读；`FieldType` 按真实值小写归一（如 `INT`→`int`），名称隐藏时不提供表引用。空间参数按参数元数据进入 `functionContext.systemParams`；不混作模型来源入参或运行 queryContext。`Type` 不可读时保守隐藏编辑器；来源类型 `interface`、`logicView` 隐藏普通 Filter 编辑器并保留原 Filter。
- `tests/runtime/page/design/data-space-design-four-file.test.ts`：新增真实 SparkPageRenderer + 已注册 DataSpaceFilterEditor 夹具，经结构化条件树应用、页面 change 事件、模型保存按钮、CRUD Filter wire 与 DataView 精确回读闭环；测试 `INT` 大于比较的数值 GetConstValue wire、空间参数 systemParams、过滤编辑不改变 DataView queryContext/filterExpression、无 Filter 写权限拒绝、本地取消零写、模型切换及 reload generation 的旧事件拒绝，以及 interface/logicView/Type 不可读/Name 不可读边界。
- 未改 `style.css`、`pagedata.json`、Graph 组件/API、新 Filter 控件文件；未接模型来源入参映射、ValueFun 设计字段、Name 注册名变更、来源建模等范围外事项；未做线上写入。此子闭环不代表数据空间设计完整页完成。

验证：

- `pnpm exec vitest run tests/runtime/page/design/data-space-design-four-file.test.ts`：exit 0，42/42。
- `pnpm exec eslint config/pages/data-platform/data-space-design/script.js tests/runtime/page/design/data-space-design-four-file.test.ts`：exit 0。
- 本轮未重跑 `pnpm run typecheck`；由主控集中执行。既有 TS7053 修复后 typecheck 日志仍是 `semantic-model-layer-typecheck-after-fix.log`，不是本轮测试结果。
- 固定参考版本 SHA 更正为 `842dec4f11b333df904b9a4e26b6566b0802bab8`（此前误写末位为 `4`）。`git -C E:\r\sparkproject cat-file -t 842dec4f11b333df904b9a4e26b6566b0802bab8` 返回 `commit`；通过该版本 `git show` 复核原节点面板及 hook：`isInterfaceOrViewType` 只把 `接口`、`视图` 作为请求入参模式；该模式隐藏普通 Filter Builder 并保留原 Filter，同时呈现来源 `inputParams` 行；普通模型 Filter Builder 以当前模型正式字段构造条件目录，空间入参合入值函数上下文的 `systemParams`。固定源 `FilterBuilder` 的普通条件值经规范化形成 `ValueFun`，保存模型时 Filter 属于模型记录数据。当时发现页面 `designModelUsesInputParameters` 使用 `interface`、`logicView` 字面值，与固定源 `Type` 值不一致；对应页测试也使用英文值。该模式差异已在后续“Filter 请求入参 Type 枚举对齐”节按主控授权修正。

### 页夹具 TypeScript 收窄修复及固定版合同复核（2026-10-08）

- 根据主控 `semantic-model-filter-acceptance-typecheck.log` 修复页夹具：对条件节点同时检查存在性与 `kind === 'condition'`；对 callback 返回值使用 `isRecord` 与逐字段类型 guard；`DataRow` 动态键改用 `['rowid']`；`setCurrentRow` 前检查 `find` 结果。没有新增断言。
- 固定版 `842dec4f11b333df904b9a4e26b6566b0802bab8` 由 `git cat-file -t` 确认为 commit；按固定版 node panel/hook 核对 Filter 与输入参数模式，已更正上文错误 SHA/不可读的报告说明。
- 固定版实际把 `接口`、`视图` 作为请求入参模式；普通 Filter 编辑器在该模式隐藏，旧 Filter 保留，参数行仍显示。当前页面脚本/夹具用英文 `interface`、`logicView`，与该源枚举不一致；脚本未纳入主控本轮限定的改动路径，差距已单独交主控裁定。
- 修复后 `pnpm exec vitest run tests/runtime/page/design/data-space-design-four-file.test.ts`：exit 0，42/42；`pnpm exec eslint config/pages/data-platform/data-space-design/script.js tests/runtime/page/design/data-space-design-four-file.test.ts`：exit 0。未重跑全仓 typecheck，等待主控统一复核。

### Filter 请求入参 Type 枚举对齐（2026-10-08）

- 按固定参考 `842dec4f11b333df904b9a4e26b6566b0802bab8` 的 `isInterfaceOrViewType` 将 `designModelUsesInputParameters` 改为匹配正式元数据原值 `接口`、`视图`；没有增加英文别名。主控复核 `Base_DataModel.Type` 是原始元数据字段，未走来源选择器归一化。
- 同一固定版的来源分类和模型类型标签映射区分普通视图/逻辑视图与数据库视图：`databaseView` 显示为 `数据库视图`，`data-set-design-state.ts` 同时保留 `数据库视图` 原文标签。按主控指定，fixture 使用元数据原值 `数据库视图` 并断言普通 Filter 编辑器可见；`接口`、`视图` 用中文正式 Type 测试入参模式隐藏且原 Filter 保留。
- 本轮仅修改 `script.js`、同页 fixture 与本结果报告；没有改来源目录枚举、窄组件、公共 API 或 ValueFun 功能。
- 最终验证：`pnpm exec vitest run tests/runtime/page/design/data-space-design-four-file.test.ts` exit 0，42/42；`pnpm exec eslint config/pages/data-platform/data-space-design/script.js tests/runtime/page/design/data-space-design-four-file.test.ts` exit 0。全仓 typecheck 由主控随后执行。
