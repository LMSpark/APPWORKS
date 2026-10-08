# 数据空间完整设计页恢复派工

## 当前优先约束：模型层与 DataSet 分开

用户最新明确：参考 sparkproject 数据空间目前只使用模型层，与本仓 DataSet 不完全一致。当前暂停后续扩展，保留阶段报告和已改文件；本节优先于下文“即可实施”。主控完成 `notes/research-data-space-page-semantics.md` 3.1 的映射复核后，再发续工指令。不得因暂停整体回滚。

只读复核应分开三层：被编辑的空间/模型/字段元数据；设计页自身用于读改存的 DataSet/DataView；被设计空间将来装配的 DataSet/命名视图与运行请求。核定正式元数据→DataTable 定义/绑定的映射，不将原空间整体当成本仓 DataSet。特别核对 Filter、ValueFun、模型入参和关系的持久语义，不因它们与运行配置同名而互换。已有元数据编辑使用 DataSet.saveChanges 可以复用，但须证实请求身份与行目标；现有 fixture 不作线上合同证据。

方案：`notes/plan-appworks-four-file-integration.md` 的“当前整页恢复派工”，状态 implementing。语义：`notes/research-data-space-page-semantics.md`。本目录 UI/data restoration-map 仅是源码定位和差距，不作为已实现事实。

## 任务与责任

### 模型层复核后的续工指令

主控已完成 `semantic-page-restoration-result.md` 的层次复核。上方暂停解除范围仅为以下明确合同，其余未核合同仍先报告；整页目标保持 D01-D15，不以本轮子集作为完成。

1. 完整读取当前四文件/页测试及固定源节点面板 Vue/TS，保留上一执行者的模型/字段表单；同一编辑链补齐模型 OutputType、parentField、hasChildField、selfType、topValue、cacheType，以及字段 OrderType、Order、Group 的结构化控件和查询字段。请求元数据在设计场景 `Base_DataModel` 行保存，字段配置在 `Base_DataModel_Field` 行保存；不改变编辑器 DataView 自己的查询参数。
2. 原枚举须从固定源核实：OutputType 为 Join/SelfRefData/HierarchyData/Navigation/Table；selfType 为 child/parent；cacheType 为 页面/浏览器/不设置；OrderType 为 ascending/descending 或显式清空。树相关选择使用当前模型正式字段，不用字符串猜字段；只读/隐藏/脱敏字段不能进入选项或可编辑值。已有未知值须保留并提示，不能渲染即写默认值。切换输出模式不自动抹掉已有树配置。
3. 字段 Order/Group 为非负整数；按真实源语义验证。取消仅丢本地编辑，保存必须精确修改目标行、按当前字段权限校验、核回执及回读。检查现有 helper 是否会携带白名单以外的意外编辑，若存在应在同一 helper 内拒绝，而非新增第二套保存系统。
4. 新增验证聚焦真实页面流程：选择模式和树字段/排序分组→编辑→取消零写或保存→检查正式请求字段及回读；至少有单字段不可写、目标切换、未知枚举原样保留的断言。不能只对函数自测，使用既有四文件 fixture。首次修改后立即运行相应最小用例，结束运行该页整套测试和精确 lint。主控本轮 typecheck 基线记录 `semantic-model-layer-typecheck.log`；确认通过后开工。
5. 本轮不写 Filter/ValueFun/Name 改名/来源/预览/关系图。它们是尚未完成的同页需求，由主控核合同后连续派工，不得从需求中删掉。不要新建 source/framework/文档树，不改计划，不另派代理，不部署、不写线上数据、不提交。

同一名低阶执行者持续负责把原数据空间设计业务恢复到本仓四文件，主控负责合同差异和验收。先完成节点元模型/请求配置与字段编辑的完整打开、选择、修改、取消、保存、回读流程，再在同一任务继续其余 D01-D15；不能把中间结果报成完整页面。S01-S05 是同空间旁侧配置，保留语义及关联，不因前端无角色而排除。

先完整读当前四文件、相关测试、原节点面板及其已分析符号，核实际 r-form/r-table/字段控件、DataView 编辑与保存合同。用当前代码报告精确落点后即可在下列既定范围实施，无需向用户重复提问。只有真实范围外依赖或多义合同才交主控裁定，不猜测。

## 文件边界

- `config/pages/data-platform/data-space-design/{rule.json,script.js,style.css,pagedata.json}`。
- `src/views/app/control/data-platform/data-space/design/graph/{DataSpaceDesignGraph.vue,DataSpaceDesignGraph.props.ts}`（只承担图交互，页面负责业务）。
- `tests/runtime/page/design/{data-space-design-four-file.test.ts,data-space-design-graph.test.ts}`。
- 你的交付报告仅写本目录 `semantic-page-restoration-result.md`，包含修改、测试命令/实际输出、未完成用例和精确阻点。不要修改总计划或本 brief，不派生代理、不登录浏览器。

## 必须保持

- 数据空间是前后端交换中心，上接页面业务语义形成前端数据结构，下接多种资源，旁接功能标签和授权配置。
- 配置驱动与开发流程标准化；复用当前 PageRuntime/DataSet/DataView 的公共查询、编辑、数据权限、保存能力，不复制另一套数据 owner 或通用草稿恢复框架。
- 前端无角色，无 admin 特例。模型/字段配置本身是受权限约束的数据。隐藏、脱敏、读写和必填分别消费正式接口。
- 业务 UI 放在 rule，业务差异编排放 script；不得把整页或整个属性业务面板搬成 Vue，不用 JSON 原文和连续 prompt 替代结构化业务表单。
- 旧源语义以固定参考 `E:/r/sparkproject@842dec4f11b333df904b9a4e26b6566b0802bab8` 为准；参考路径 dirty 时 git show 固定版本。现有模型 Name 与 MetaName 不同，改名必须核引用影响，不得猜；不可永久取消改名需求。
- 参数现有本地未签收增量不得覆盖删除；仅改本次必要块。每次写前重读当前文件，记录精确 baseline 到本目录 `semantic-page-baseline/`；不要整体还原混合工作树。
- 不新增范围外文件、公共 API、依赖、后端或 schema。发现真实公共能力缺口，回报最小调用链和建议，由主控核实后补范围。不要顺手改其他功能。
- 不 commit/push/分支/stash，不运行全量测试、不部署、不修改线上数据。

## 验证与回报

开工由主控跑一次 typecheck 基线，文件 `semantic-page-baseline-typecheck.log`；基线通过后写代码。首次实质修改后立即运行相应最小用例；业务测试用真实四文件 + assembler/DataView owner，核正常保存、取消零写、权限变化拒绝、上下文切换、未知/部分结果和精确回读，不用假的 save 返回 true 证明成功。整轮结束运行上列两个设计页测试，再 typecheck、精确 lint（脚本/JSON是否纳入按仓配置）。有失败只修当前范围，记录命令和结果。根负责独立 review，不自行派 reviewer。

开工回报只需：已读文件、现有公共能力落点、第一轮业务闭环与修改文件、真实阻点（若有）。然后实施；不重复输出主语义报告。

## 主控核定的过滤配置复用（独立文件实现，交给页面 writer 接线）

依据：固定参考 `packages/ui/domain/spark-api-ui/src/FilterBuilder.vue` 默认 storage=wire；节点保存将 requestFilter JSON 序列化到 Base_DataModel.Filter。目标公共 `FilterExpressionEditor` 已支持完整条件组与值函数；`packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-filter.ts` 是现有 wire 转换真源。只恢复模型元数据编辑，不将 Filter 应用到设计器自身的查询。

精确文件由总计划“本页实际阻点补范围”列出，共 7 个。不得修改四文件/页测试、协议 helper、共享函数目录或其他组件；不得复制解析器或条件树算法。先完整读受影响文件与直接调用方，再实施：

1. DataSpaceDesignApi 增静态 `parseFilter(text: string | null | undefined): DataViewFilter | undefined`，仅 null/undefined/空白为空；其余调用已有 decodeDataSpaceFilter，损坏 JSON/非法 wire 必须报错。`serializeFilter(filter: DataViewFilter | undefined): string` 用已有 encodeDataSpaceFilter，显式清空为 ''。不做 I/O、不增加泛化 facade。API 用例证明嵌套/值函数/空值往返及损坏值拒绝。
2. 从现有 components/index 和包根显式导出 FilterExpressionEditor（不要导出无消费者的 props/draft 类型）。包根已有 exports/路径别名无需新增；新控件通过正式根包 import，测试证明导入可用。
3. DataSpaceFilterEditor.props.ts 定义 `modelValue?: string | null`、`columns: readonly DataColumn[]`、`functionContext?: DataViewFilterFunctionContext`、`disabled?: boolean`。Vue 复用 FilterExpressionEditor；将已解析树作为 modelValue，仅用户应用/清空时 emit `change(serializedString)`，不开 HTTP，不保存元数据。无法解析时展示错误、保留原值并禁用修改，不能当空过滤；父值/disabled/columns/context 变化后旧弹窗不得提交旧草稿，必要时用内部 revision/key 重建既有子组件。渲染/打开/取消不 emit change。
4. 不向前端引入角色分类：现有 GetUserMasterId 定义兼含部门与角色分类。通过该控件实际 functionContext.definitions 的既有扩展机制，提供仅部门 refType=dep 的同名定义（复用现有字段定义，不复制整个函数目录），移除 roleClassId/角色选项并验证部门分支；不删正常部门能力。旧协议值不得静默删除或写回，未知/旧值未编辑时继续保留；不要改全局默认目录或按 admin 放行。其他函数由已有上下文控制，调用方只供应可读取目录。
5. 真实 Vue 测试（ElementPlus + 真共享编辑器）覆盖：渲染/打开/取消零 change，嵌套条件原样应用/清空，损坏原文保持且不能改，disabled/父值变化使旧草稿无法发事件，正常值函数与角色分类入口不出现。用包根导入覆盖公共入口。允许现成条件树编辑器的可选 JSON 辅助模式，但不能以 JSON 原文取代结构化条件树。
6. 首次 API 修改后运行 `pnpm --filter @spark-appworks/spark-lowcode-api exec vitest run src/platform/data-space/design/data-space-design-api.test.ts`；控件完成跑 `pnpm exec vitest run tests/runtime/page/design/data-space-filter-editor.test.ts`；精确 lint。主控合并验收时集中 typecheck，不重复全量。结果追加 semantic-page-restoration-result.md 的独立“过滤控件”节；只在报告追加，不覆盖其他作者。

### 过滤控件接线验收补充（主控审查后的当前合同）

相同 Filter/列内容不能代替目标身份。窄控件 props 增必填 `contextKey: string`（由设计场景、目标空间和模型行 ID 组成），与其他输入一起使编辑会话失效；`change` 当前合同改为一个对象 `{ contextKey: string, value: string }`，contextKey 必须来自打开该编辑会话时的捕获值。这个对象是本地事件，不是运行 inputParams。验证保存旧事件监听函数，在 contextKey 变化但字段/过滤内容不变时直接调用旧监听，必须零 change；不能仅用已卸载 Vue 实例的 `$emit` 证明 token 有效，因为框架本身可能丢弃该事件。正常结构化条件树交互至少一例，不只用 JSON 模式。

页面 writer 接线仍只改四文件与既有页测试：模型表单加入 `data-space-filter-editor`，beforeRender 构造 contextKey、当前可读模型字段列/空间参数及模型字段引用的函数上下文，modelValue 取本行编辑缓冲中的 Filter（未编辑取当前正式行），disabled 按该字段读写权限。处理 change 时精确匹配 contextKey 与当前设计场景/目标空间/模型行，重新核当前查询/字段权限，再调用同一 DataView.updateEditingValue；取消和保存走现有表单同一入口。过滤保存仅修改 Base_DataModel.Filter，不能改 designModels.filterExpression/queryContext。interface/logicView 的请求入参配置另行恢复，按原面板在其入参模式下不显示普通模型 Filter 编辑器，不删除原值。

页面 fixture 验证实际窄组件可从规则渲染、编辑后同一模型行 Filter wire 保存与精确回读、取消零写、权限拒绝、相同空值切换模型后旧事件拒绝。当前列定义/类别字段须从正式查询补齐（特别 `type`），不得给不可读字段拼造名称。审查期间发现的功能缺口在本页闭环内修，不写线上数据。

## 当前接续指令：字段值函数与来源入参映射

总计划“当前续工：D05/D06”已列精确公共组件/API范围，另一执行者负责；四文件 writer 只改原四文件和已有 page test，并在语义结果报告追加本轮结果。不开新计划，不新增第二草稿或运行 owner。参考 SHA 仍为末位 bab8；模型 Type 使用原值“接口”“视图”，不要使用来源目录英文枚举。

1. designFields 保持全空间查询，新增正式投影 type/ValueFun 并纳入单行保存回读。增加字段分类展示；普通字段在当前字段表单接入 `data-space-value-function-editor`。组件 props：contextKey:string、modelValue?:string|null、functionContext、disabled:boolean；change 为 `{contextKey:string,value:string}`。把事件写入当前 DataView 的 ValueFun 编辑缓冲，保存仍用既有 DataSet.saveChanges/精确回读；不执行值函数或修改运行 queryContext。
2. 模型请求区在“接口/视图”模式使用当前 Element Plus 的 el-select-v2（Renderer 已支持 global-el），由 options/modelValue/on['update:modelValue'] 控制；源码复核发现 r-select 无字段时默认不可编辑，不能用它伪绑定业务字段。候选来自同一 designFields 当前行集，筛 dataSetId、dataModelId、type=inputParams，逐项核 rowid/关联字段/type/Name 读取权限；选择后 setCurrentRow 到同一个原行对象。随后显示绑定该 designFields 当前行的来源入参详情/值函数/保存/取消表单，且必须属于当前所选模型。不新建 filtered DataView 或给 r-table 塞假 rows；同模型其它 DataView 状态不应受影响。
3. 来源入参只改 ValueFun；名称、说明、FieldType 展示只读，输出/别名/排序/分组不作为入参编辑入口。普通字段保持已有有效控件。type 不可读时不得猜成普通字段开放类型相关编辑；不改变未编辑的原值。保存端依字段类别核白名单与当次字段权限，不能只靠按钮隐藏。
4. 值函数上下文：tables 为字段所属当前模型及关系祖先，relatedFields 仅祖先；按正式注册 Name 和字段 Name 构造值，AsName/description 只在可读时作标签。每个模型/字段/关系先校验空间归属、身份和相应字段 read=visible；祖先遍历防环。普通字段可供空间参数 inputParams；来源入参只供 systemParams。公共 helper 会合并内置 SystemData 并排除角色分类，无 admin 分支。不要读取实际业务记录求值。
5. contextKey 包含设计场景/空间/字段模型/字段行/当前模型选择/加载代次，变更事件重新计算一致性、类别及 ValueFun 读写权限；切字段、模型、目标空间、reload或禁用后旧回调必须拒绝。打开/取消零保存；显式清空是 ValueFun=''，不能用空对象。损坏/未知原文未主动修改时须保留；组件负责提示和明确修正，不把原文默认为空。
6. 测试使用真实 Renderer 和新窄组件，证明选择来源入参→结构化 SystemData 参数选择/确认→相同行 ValueFun 保存/回读、取消零HTTP、普通字段保留既有编辑、隐藏字段不入选项/权限拒绝/上下文过期/模型关系祖先目录。断言设计器 queryContext 不被改。API/共享控件自身测试由另一执行者负责，不重复全量。先当前最小测试再本页suite/精确lint；最后根统一typecheck。

ValueFun 后端求值及预览实际执行仍未证，本段只恢复合法定义的编辑与正式保存，不声称完成D07预览或整页。当前形态先恢复语义，之后按整页对照补齐原列表/交互细节。

## 公共事件纠错限定任务（独立 writer）

本页真实 ElSelectV2 点击已确认发出 update:modelValue，但 SparkComponentRenderer 的 toListenerPropName 抹掉冒号，页面处理器未收到。只修改 `packages/spark-component/src/components/SparkComponentRenderer.vue` 和 `tests/ui/component/spark-component-renderer.test.ts`；报告交回主控消息，由主控记入结果，避免与页面 writer 同写报告。先完整阅读这两个文件与相关事件绑定调用；保留当前字节基线，不改其他文件。

先增加真实 Vue 组件发事件的失败验证，再以最小代码修正 listener 名称转换，冒号须保留，既有 click、row-click 与 camelCase 行为不回归；覆盖注册组件和 global-el 分支，以及 update:modelValue、update:model-value。复用本地 Vue 现有公共 helper 或等价最小修正，不新增依赖/模块/公共API。测试不得手工调用渲染后的 handler。运行 `pnpm exec vitest run tests/ui/component/spark-component-renderer.test.ts` 和精确两文件 ESLint，回报红绿证据和 diff 范围。页面 writer 负责其真实选择到保存测试；不要编辑四文件或页测试，不派生代理、不提交。
