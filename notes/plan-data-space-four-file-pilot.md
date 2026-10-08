状态：implementing

# 数据空间目录四文件样板

## 任务目标

按用户“先搞一个页面转成成功，然后模仿”的指令，仅将数据空间目录页转换为本仓三工具文件与一个共享场景配置，真实打开并验证后再扩展其他页面。沿用已确认的当前底座、当前组件、admin 验收与低阶模型实施；主控负责验收。不重新展开全量迁移。

权限边界：用户明确“数据权限，没角色的概念”。页面仅消费本次后端查询返回的数据权限，通过 DataView 的字段访问和操作状态决定呈现/操作，保存沿用原查询 owner。不得新增角色模型、角色分支或 admin 特判。admin 仅是登录验收身份，不能据此推导允许操作。受限测试直接使用后端权限响应的不同数据事实。

## 已核实的调用链

- 应用 D99A1DCE9894698799101EFD70F8FC76，节点与场景 90A82E287930A234FEC3E687C94A93EA。
- 正式菜单入口仍绑定原生 DataSpaceCatalogPage.vue。开工时同 ID 三工具文件不存在；现已保存样板工具文件并经 `__tool` 路由打开，共享 pagedata.json 保留六个正式模型及 default 视图，增加三个独立命名视图。
- 目标为 PageTool + ScenarioViewFile → PageRuntime → DataSet/DataView → SparkPageRenderer。不嵌入整页 Vue，不把旧 owner 塞进脚本。
- 开工装配阻塞已解除：Base_DataSet 的 13 组不同 fieldId、相同正式语义输出现由统一解析消费，原始设计 fields 保留。真实六模型装配及三表只读查询通过。证据见 four-file-correction/pilot-*.json。

## 执行顺序与范围

1. 恢复稳定基线：仅撤回停止时留下的 D1d 原生 lifecycle 增量。精确路径、保留边界及开工前 SHA256 见 `notes/evidence/sparkproject-appworks-integration/four-file-correction/d1d-revert-scope.md`。不回滚 C2、D1c，不整体 checkout。已确认无开工前完整字节副本，因此主控批准按确定的 D1d 符号/代码块逆转，保留 C2 断言，由 diff、typecheck 和原导航测试验收；不能将这种恢复称为字节完全还原。若遇到无法区分归属的行为，单列报告，禁止删去既有测试来消除失败。首个动作即核对只移除已识别 D1d 块与相关符号，再继续同一撤回闭环。
2. 修复样板装配阻塞：完整读完模型消费点后，在本文补入精确路径与测试，才派工。同 canonicalName 仅在正式语义完全相同时消费为单列；冲突仍报错，原始设计 fields 不变、后端元数据不变、权限不变。
3. 落地单页四文件：保持共享场景既有模型，在独立命名视图上配置列表/选项。先用正式工具路由运行三文件，再接正式导航。资产路径、过滤和新增保存脚本接线经源码核验后补入本文。绝不把候选片段当验收成品。
4. 验收样板：页面渲染、名称或 ID 搜索、应用筛选、分页、可读标签、权限消费、新增保存后重开；随后验证相邻配置页/导航回归。未验证项保留未完成。

## 验证计划

### 第二项的已研读实施边界

- `packages/spark-lowcode-api/src/platform/data-space/design/data-space-design-api.ts`：在已有 DataSpaceDesignApi class 增加 `resolveOutputFields(model)`，保留输入 fields，仅按 canonicalName 折叠完全等价输出，顺序保持首次出现。比较 name/canonicalName/type/primaryKey/description/output/computed/order/orderType 及原始 Group/DISTINCT/Value/ValueFun/Expression，排除记录身份与记录审计元数据；冲突显式失败。主键等价判断复用同一语义比较。
- `src/lowcode/data-space/lowcode-data-space-assembler.ts`：列消费此唯一正式输出列表。
- `packages/spark-lowcode-api/src/platform/data-space/runtime/data-space-runtime-api.ts`：查询字段、排序、过滤、树字段映射使用同一列表。
- `packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context.ts`：正式主键、保存、回执及 ParentField 映射消费同一列表；按源 name 反查有多输出仍拒绝，保留主键/回执/父行凭据验证。不把返回行、权限或输入值做去重。
- 测试：`packages/spark-lowcode-api/src/platform/data-space/design/data-space-design-api.test.ts`、`packages/spark-lowcode-api/src/platform/data-space/runtime/data-space-runtime-api.test.ts`、`packages/spark-lowcode-api/src/platform/data-space/runtime/tests/data-space-model-alias.test.ts`、`tests/runtime/auth-nav/lowcode-data-space-runtime.test.ts`。已有目录/现有文件内增补，不新增公共类型或依赖。
- 首先增加真实等价重复及冲突的最小回归用例并运行，修复后依次 typecheck、聚焦测试、精确 lint；主控复验真实六模型装配和只读查询，再进入四文件资产。对应测试配置以包 vitest.config.ts 与根配置实际 include 为准。

- 每轮一个闭环，首次实质修改后立即最小验证；根 `pnpm run typecheck` 必须先通过。
- D1d 撤回：目标 hash 对比；`pnpm exec vitest run tests/runtime/page/runtime/system-page-identity-tabs.test.ts tests/runtime/auth-nav/application/project-navigation-guard.test.ts`。
- 当前基线：typecheck 在 D1d 新增测试 416/417/611 行报三处 never 错误；不继续修废弃路线的测试。
- 配置由当前 SparkNodeTree、ScenarioViewConfig、正式模型装配与真实 SparkPageRenderer 验证。
- 在线使用已授权 admin；仅限当前样板配置保存和可识别试验记录，保存必须字节回读或后端行回读。旧目录页测试不充当四文件证据。
- 源码冻结后执行相关 lint、治理门禁与受影响测试；最终才跑一次全量和构建。

## 兼容性与风险

- 不 commit/push/建分支，不改后端模型，不覆盖并行工作。历史 URL、nodeId、参数和发布引用分别核对。
- 场景文件共享，不能用仅含三表的新文件覆盖六表原文件。
- 原 Vue 参考其余操作仍在总任务范围；本样板尚未通过之前不派其余页面。
- 每项通过必须有当前证据；不能承诺未覆盖功能“零回归”。

## 第三项资产落点与已核实接线

- 新增 `config/pages/data-platform/data-space-catalog/rule.json`、`script.js`、`style.css`、`pagedata.json`，作为可审查、可再次部署的单页源资产。前三文件保存到已有节点 ID 同名 pageId，场景文件仍保存原 scenarioId 路径。
- 新增 `tests/runtime/page/catalog/data-space-four-file.test.ts`，直接读取这四文件，检验配置装配、脚本真实行为与渲染。不得用旧 schema fixture 充当资产。
- rule 使用 PageTool 保存的规范单节点或节点数组，每个节点有稳定 id，页面样式放在真实 div 节点；`spark-page` 仅为读取时可接受的包装根，会在保存时解包，不能把样式留在它上面。布局、标题、工具栏、表格与普通字段列都用本仓已支持节点。少量自定义搜索/分页/关联标签可用页面内 Render 函数与 h，不能返回整页、引入 Vue/import/fetch/第二个 owner。
- 保留六个表和 default 视图，仅在 Base_DataSet/Base_AppSystemList/Base_UserInfo 上分别新增 catalog/catalogApps/catalogUsers；正式投影使用已核验 fieldId。主列表七字段，10 条起步，createtime desc。query/save 只用本次 `$page.resolveView` 的 DataView。
- 名称 contains OR rowid eq，再 AND 显式 sysid；搜索输入保持局部状态，向 executeFilter 传 DataViewFilterTree 字面量（脚本的 SparkData 不导出 DataViewFilter）；分页调用 setPage/setPageSize 并等待结果，失败保留错误。分页与搜索完成后查询当页创建人，再显示按权限投影后的标签。
- script 使用顶层 `async function __init__`，由 createSandbox 的语法树提取，必须 await 查询；对象表达式中的方法不会成为生命周期函数。
- 应用与创建人查询用各自视图 loadFromServer/allPages，复用原目录已证实的主键、别名与 h/m 规则。Render 的业务输入不能自动落为 DOM 属性泄露隐藏字段；测试检查输出 DOM。
- 新增先通过当前 `$page.selectEntities` 收集已授权应用候选，再用 `$page.showPrompt` 收集名称和描述。固定参考 createDefaultFormData/提交代码已确认 Type 固定 datasource。输入确认前不 append，不伪造未保存行的字段权限；输入齐全后再次检查 addActionState，再 addRow/saveChanges/回读。取消输入零写入。先 append 再用 r-form 编辑目前确有新行字段不可编辑的问题，本样板采用当前已有 prompt-append 所用的输入收集方式。
- 本地 pending-create 放弃与远端删除严格分开，只能取消本页明确新建且仍在 pendingCreateIds 的草稿；未知保存结果不得自动重发。编辑、删除、设计等参考其余操作保留总任务未完成项，不虚报样板已覆盖。
- 先在正式 `__tool/{pageId}?scenarioId={scenarioId}` 入口完成真实保存/加载/行为证据，再对正式导航切换单独审查 URL 兼容边界；三文件不存在且共享场景装配失败时不先动导航。

## 当前闭环验收进展

- 四文件真实查询、名称/ID 搜索、应用与关键词 AND 组合、分页与大小切换、标签和权限负例已通过。真实新增 `97DCB03F75AADEAE6B102B062DB71CEA`（四文件样板验收-20261007）后总数 1184 → 1185；整页重开按 ID 查询仍为 1 行，应用和创建人正确显示。试验记录保留，不自动删除。
- 收尾仅限原四文件范围：搜索控件归为一个横向可换行容器，查询按钮复用页面按钮样式，新增按钮不拉满整行；rule 采用已保存 PageTool 的规范文本。行为不变，以既有聚焦测试和浏览器操作验收，不增加布局镜像测试。
- 正式导航切换与参考页删除、设计、复制 API、查询绑定尚未完成；现有行编辑已按第四项验收通过，不能将新增和编辑闭环称为整页完整迁移或全任务零回归。
- 新增闭环冻结版本验证通过：typecheck；样板 3 项；根 192 文件/2262 项；API 包 3 文件/150 项；root lint；ai-codegen 982 文件；dirs；pages-config；完整 build。这组全量/构建证据先于第四项编辑，不冒充编辑后复跑。首轮 lint 的历史快照扫描失败和文本存档后复验均留证，未改门禁。精确权限和底座缺口见 `pilot-remaining-operations.md`；未纳入当前编码范围的操作不提前派工。

## 第四项：现有行编辑（用户“继续”后实施）

### 修改文件与技术决策

- `config/pages/data-platform/data-space-catalog/script.js`：增加 `editCatalogEntry` 与工具栏编辑按钮，改为新增/编辑共用忙碌和未知保存结果锁。查询及分页在操作中拒绝重入。只编辑本次 `Base_DataSet@catalog` 当前持久行的 Name/description；sysid、Type、身份和审计字段不进入业务 patch。
- `config/pages/data-platform/data-space-catalog/style.css`：仅为两个操作按钮增加工具栏布局。
- `tests/runtime/page/catalog/data-space-four-file.test.ts`：扩展现有真实 assembler/runtime fixture 的 Changed 回执与存储回读，覆盖成功、权限双通道、取消/无改动、切行/重新查询/页面失效、拒绝和未知保存结果不重发。
- rule/pagedata 不变，不新增宿主 API、组件、原生页、依赖或公共导出。既有 `$page.showPrompt` 提供本仓输入交互，输入全部确认前不修改 DataView。当前 `buildPageContext` 在每次异步交互后检查 abort/runtime generation；编辑另捕获同一 view/当前行对象并在每次 await 后检查，防止切行或重新查询后错误写入。
- 行编辑取 `editActionState`；每个字段取 `fieldAccess.write`。read 与 write 独立：h/m 不当作撤销写权限；不可读的原值不进入 prompt 默认值或提示。可见字段只提交实际变化；可见描述原 null/undefined 且输入空保留原值。不可读但可写字段输入代表明确的新值，绝不从不可读原值推断默认值。
- Name trim、非空、最多100；description trim、最多500；同时消费被编辑字段的 `fieldAccess.required`，后端必填字段不接受空串。输入完成后重新核验目标和变更字段权限，然后 `editRowById(id, patch)`，只提交 `saveChanges({views:[{tableName:'Base_DataSet',viewId:'catalog',ids:[id]}]})`。无变化不提交。未知结果在内部保留记录 ID、阻止新增/编辑重发；编辑错误提示不输出原始主键。成功后沿用当前筛选刷新；同一 ID 可能因名称变化退出当前结果，这不等于刷新失败，应提示保存成功且记录不在当前列表。真实验收再按同一 ID 查询并整页重开回读。刷新失败与保存失败分开呈现。

### 验证与边界

- 基线 `pnpm run typecheck` 留存 `pilot-edit-baseline-typecheck.log`。首个 RED 用例后最小实现，运行 `pnpm exec vitest run tests/runtime/page/catalog/data-space-four-file.test.ts`；其后 typecheck、精确 eslint。
- 主控审查 diff 后将工具文本按写前基线比对、正式工作区保存、逐字节回读部署。真实编辑仅使用此前创建的样板记录 `97DCB03F75AADEAE6B102B062DB71CEA`，随后整页重开查询回读；不修改其他业务记录，不改变后台权限。
- 本轮不派删除/设计/复制 API/查询绑定；该页所有操作仍逐项闭环，不将编辑通过外推为全页完成。全量/构建留在需要收尾签署的冻结节点运行，局部修复仅运行覆盖测试以控制消耗。

### 第四项验收结果（2026-10-07 22:24）

- 低阶实施代理 gpt-6-luna 完成三个范围内文件，主控进行两轮差异审查和浏览器验收。最终 typecheck、精确 ESLint 通过；主控独立复跑样板测试 14/14 通过，日志 `pilot-edit-review-tests.log`。未为局部修正重复全量或构建。
- 写前远端基线一致；通过 ProjectWorkspace 仅保存 script.js/style.css，四文件逐字节回读一致，rule/pagedata 未变。证据 `pilot-deploy-edit.json`。
- 真实取消编辑：0 保存请求、原名称/描述未变。真实编辑：1 次 POST，仅一行 Changed，业务字段为 Name/description，另有原 rowid 和正式 owner 凭据；Added/Deleted 均为 0。不留存凭据值。证据 `pilot-edit-cancel.json`、`pilot-edit-saved.json`。
- 试验 ID `97DCB03F75AADEAE6B102B062DB71CEA` 改名为 `四文件编辑验收-20261007`，描述为 `四文件样板编辑验收：仅修改名称与描述，保留应用和类型。`。原名称过滤刷新后为 0 行，提示保存成功且当前记录不在列表中；按原 ID 查询并整页重开后为 1 行，新值、datasource、元数据管理、系统管理员及原创建时间均回读正确。浏览器 error 日志为空。证据 `pilot-edited-reopened.json/png`。
- 数据权限负例由实际 assembler/query/save 管线的后端响应 fixture 覆盖：拒绝、隐藏可写、后端必填、隐藏主键错误提示、未知结果禁止重发。在线使用 admin 实验记录，不把此身份当权限判定条件，也不声称在线修改或验证了受限账号权限。
- 待确认沉淀：不可读但可写字段必须独立处理输入与原值；筛选后消失与保存失败必须区分。暂留计划备注，不自动写 knowledge。

## 第五项：当前行删除（用户再次“继续”后实施）

### 修改范围与研读结论

- `config/pages/data-platform/data-space-catalog/script.js`：增加当前持久行删除动作和单个删除按钮，复用忙碌/结果未知锁、目标身份检查、现有 showConfirm、原 DataView/removeRow 与指定单行 saveChanges。
- `config/pages/data-platform/data-space-catalog/style.css`：仅增加删除按钮危险操作配色，沿用既有工具栏。
- `tests/runtime/page/catalog/data-space-four-file.test.ts`：沿用真实 assembler、buildPageContext、query/save owner fixture，增加后端 d 权限、Deleted/maplistdelete 回执、删除后查询和必要分页数据；不新增测试目录或宿主接口。
- 固定参考页 handleDelete 的流程为当前行权限 → 确认 → 原 catalog.remove → 删除末页唯一行时页码减一 → 重查。本仓 removeRow 是 staged 删除，先移出本地 rows 并保留 pendingDelete snapshot；saveChanges 的原 owner 从原查询基线生成 Deleted 并校验正式主键回执。不能把本地行消失当远端删除成功，不手工拼请求或伪造原 owner。

### 实施步骤与兼容性

1. 当前行且 deleteActionState(row) 为 enabled 才呈现按钮；直接调用也复核。隐藏/脱敏名称不出现在确认文本，使用通用“当前数据空间”；原始主键不进入提示。无角色/admin 分支。
2. 确认前不暂存；取消零写。确认后再次核对 $page 当前 view、行引用/成员资格/正式 ID 与删除权限；切行、重新查询、页面失效均取消。确认期间拒绝查询、分页、新增、编辑和重复删除重入。
3. removeRow(id) 成功后，只保存 `{tableName:'Base_DataSet',viewId:'catalog',ids:[id]}`。不批量删除、不混入其他视图或已有未保存行。失败或缺失正式回执保留未知结果锁，持久错误文案明确“删除结果未知”，不自动刷新/回滚/重发，保留 pending-delete 供重开核对。
4. 已确认删除后清锁；按操作前 page 与 rows.length 判断是否退一页，否则 refresh。保留当前筛选；确认刷新中不含目标 ID，再查询创建人标签。刷新失败明确“已删除，刷新失败”，不能反称删除失败或再提交。
5. 只在原三个文件内实施，rule/pagedata 不变，新增/编辑保持已验收行为。不存在恢复入口的在线永久删除，需到真实确认对话框后取得用户本次确认再执行；此前只做取消验收。

### 验证计划与风险

- 类型基线 `pilot-delete-baseline-typecheck.log`；先 RED 后最小实现，首次实质修改后立即运行对应用例。最终 typecheck、精确 ESLint、样板完整聚焦测试；冻结后主控复验、审查差异，并运行一次根回归。
- 必测：后端 d=false 零确认/零保存；d=true 单行 Deleted，无 Added/Changed；取消；隐藏/脱敏确认文案；确认中切行/查询替换/页面失效；末页唯一行删除退页且保留筛选；未知回执禁用全部写入与自动重发；保存成功但刷新失败的正确提示。
- 线上先部署并回读三工具文件、核对共享场景未变，再验证删除取消零写。真实删除候选仅此前试验记录 `97DCB03F75AADEAE6B102B062DB71CEA`（四文件编辑验收-20261007），在执行时确认后删除并按原 ID 重开回读为 0；未确认时保留记录并明确实际删除待验收。
- 删除实现风险在 staged 行消失早于回执、未知结果重发以及异步确认目标过期；以状态提示、统一锁、当前目标核验和真实 owner 回执测试控制。设计/复制 API/查询绑定/正式导航仍留后续闭环。

### 第五项当前验收进展（2026-10-08 00:22）

- gpt-6-luna 实施与独立定向审查；一次集中修复后，回读仍含旧 ID 的错误提示、未知结果第二行三个写入口锁、确认期间 executeFilter/refresh 替换目标均通过复审。结果 `pilot-delete-result.md`，审查 `pilot-delete-review.md`。
- 最终样板 22 项由实施代理验证通过；主控独立运行 `pnpm run test:run`：192 文件/2281 项通过，主控 typecheck 与精确 ESLint 退出 0。日志 `pilot-delete-root-tests.log`、`pilot-delete-final-typecheck.log`、`pilot-delete-final-lint.log`。保留既有 esbuild/oxc 非阻断提示，本轮不重复构建。
- 仅部署 script.js/style.css；远端写前基线一致，四文件字节回读一致，rule/pagedata 不变。真实页面有新增/编辑/删除三个入口；删除确认取消后 0 保存请求、原行仍在，三个按钮均恢复可用。证据 `pilot-deploy-delete.json`、`pilot-delete-cancel.json`。
- 实际删除尚未执行。页面停在试验记录 `97DCB03F75AADEAE6B102B062DB71CEA` 的确认框；已向用户请求本次不可撤销删除的执行时确认。取得确认后只删除这一条，再验证单行 Deleted、原 ID 过滤保持、整页重开为 0。确认截图 `pilot-delete-confirm.png`。未确认不得把删除回读记为通过。
- 待确认沉淀：staged delete 先移出 rows，未知结果锁测试需保留第二条可操作记录；回执成功与刷新仍含原 ID 是独立状态。候选只留本计划，未写 knowledge。
