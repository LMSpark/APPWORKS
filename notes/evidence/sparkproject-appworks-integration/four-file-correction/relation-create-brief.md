# 关系新增：独立输入、唯一保存与恢复

状态：implementing。总计划 D11 的接续闭环。用户已授权低阶实施、主控派工验收和长期利益裁决；关系语义沿 relation-page-brief.md，当前源码与新增输入合同见 relation-create-research.md / create-input-contract-review.md。布局生命周期已冻结通过，不重做其实现。

## 主控裁定

1. 使用四文件配置的独立创建输入面板，新增按钮和图 connect 同入口；connect 只预填父子 ID，不立即写关系或图。父子显式选择，depType 初值空且须选正式字典，filter 初值空并由正式 Filter 控件校验；cascadeDel 固定源合同 0。Join 沿当前子模型正式数据与逐字段权限，三项全空或全填；另一父的 PId 不可借新增覆盖。允许同端点多个关系，始终按正式 ID 操作；parentTable/childTable 用正式 Name，保留完整过滤式，不产生输入级联。
2. 在打开独立输入时复用本次 PageRuntime 的不透明内容 owner 保存序列化创建命令。只有明确保存、全部输入与权限校验完成后才调用 DataView.addRow。选择此方案是因为保存回执后的待核验阶段已证需要 runtime 记录；用同一个记录同时保留输入，可避免把未授权新行混进正式查询结果、放宽 designVerifyRows 或再造一套待新增快照。DataView 入行前是可编辑候选，入行后候选冻结作本次提交的核验依据，真实业务状态/凭据/请求仍由原 DataView/DataSet 持有。
3. 最窄公共补充是命名本地文本草稿的读/写/清理桥，复用 PageRuntime.getContent/onContentChange，不新增缓存、存储类或业务 I/O。建议 `$page.getLocalDraft(name)` 返回只读 content（string|undefined）与 revision；`setLocalDraft({name,content,expectedRevision})`、`discardLocalDraft({name,expectedRevision})` 同步核本次 context 与版本。名称非空且规范，内部与布局键分域；首次写才 acceptRead(null) 初始化，读取不修改 owner，任何文本草稿使 runtime dirty。并发旧修订拒绝，旧 PageContext abort/reload/dispose 拒绝。清理只是本地动作，无保存成功含义，UI 不能在请求仍在途时开放清理。
4. 创建输入与已有关系编辑、参数/模型/字段编辑及布局草稿互斥；已有其他脏变更不混入。关闭输入等同明确取消，清本创建记录，无 HTTP，无新增行。重新挂载先检查记录：input 阶段可重读当前正式数据并恢复输入，候选/权限重新核对，不能从文本恢复旧授权；提交后阶段不自动重发新增，也不让普通全量加载覆盖 DataView pending。
5. 请求阶段由记录明确区分 input、staging、dispatched、metadata-confirmed/verification-required、layout-unconfirmed（具体同义命名可收束），保存精确目标、关系 ID、候选值、必要 Join 原值/提交值和阶段；不保存权限凭据或原查询私有对象。DataSet.saveChanges 是唯一 I/O owner，不用 PageContentRuntime.startWrite 假装关系文件写入，也不把关系流程移入 buildPageContext/project-model。记录在真正派发前必须有 DataView 分配的正式 ID；若 addRow 的 await 之前 context 已失效，不能发请求，恢复只能辨认唯一匹配该 staging 命令的 pending-create 并回到输入/明确取消，不猜多个候选的身份。
6. 复用既有明确 views/ids 的多视图保存、按操作/行数核回执、正式 readback 和布局 add 路径。原 `designSaveRelation` 中不可达且依赖新行 fieldAccess 的 isNew 支路应按这条合同收束，不保留两套新增保存。只新增关系没有 Join 变更时只提交 relation；Join 变更仍核已存子行实际 read/write/required。对 staging 后的当前性检查用已捕获 owner 与本命令 ID/行变化，不全局放宽正式行权限/完整性检查。
7. 明确“继续核验”动作在 DataView 不再 mutating 后才可执行：不重发 add/save；保留记录中的 ID/候选，按目标重读正式关系及必要子模型并逐字段核对，确认后只接续布局。因 pending 阻止查询时，先明确说明将丢弃本次本地待提交副本再读服务端（不等于回滚）；仅处理记录明确拥有的关系 ID/Join 字段，取消保留未知。不一致、无权、坏图、读取失败保持可定位的未确认结果，不报成功。元数据已确认但布局失败需单列提示；显式重新核验后只同步布局，不重发元数据。缺失布局沿已验语义不自动创建，明确告知无布局文件；关系新增结果仍按正式回读确认。
8. 记录要一直保留到对应正式回读及布局阶段得到明确结果；不能在 DataView 接纳回执时先清造成外层误判干净。旧 Renderer 失效后 DataSet 继续收束实际请求，新 Renderer 依据实际 mutating/pending 与记录提供恢复入口；提示不依赖旧脚本继续运行或定时轮询。图无法装配也保留页级创建恢复入口。同端点多关系可从关系表按 ID 选择，既有图按边 ID 选择，不为此扩建几何算法。
9. 未确认记录不能成为永久锁死：实际请求已不在途、完成同目标正式读取后，用户可明确“接受当前正式结果并结束本次操作”，确认仅丢本地记录，不回滚已发送请求、不证明旧请求成败，也不自动重试。匹配期望时继续后置布局；不同、缺失或第三方结果按实际读到的内容呈现。读取失败/无权/不完整或确认期间状态改变不能冒充已核验；保留记录和错误。采用与布局远端协调相同的诚实结果边界，不造事务/幂等保证。

## 精确修改范围

- `packages/spark-component/src/runtime/app-services.ts`：本地草稿 DTO/能力合同；不是 host service，不让每个宿主实现内存方法。
- `packages/spark-component/src/runtime/script-context-types.ts`：接入实际脚本能力。
- `packages/spark-component/src/page/context/buildPageContext.ts`：限定本 runtime 的命名草稿桥，只有不透明文本及修订，无关系/HTTP/权限算法。
- `packages/spark-component/API.md`：同步当前公开合同及内存边界。
- `config/pages/data-platform/data-space-design/script.js`、`rule.json`、必要时 `style.css`：创建命令输入、现有 Filter/Join 复用、原 DataSet 保存、恢复编排和入口门禁。`pagedata.json` 不变；不新建 Vue 页或私有数据集。
- `tests/runtime/page/runtime/page-script-lifetime.test.ts`：本地草稿桥修订、隔离、旧 context 与同 runtime 新 context、dirty/清理。
- `tests/runtime/page/design/data-space-design-four-file.test.ts`：真实输入/提交/回读、权限、同端点多关系、恢复与重挂载。
- `tests/runtime/page/catalog/data-space-four-file.test.ts`、`packages/spark-component/src/tests/runtime/createSandbox.test.ts`：仅当新强类型能力要求时补现有夹具。

不改 project-model/content owner、DataView/DataSet/查询权限、Pool/App/导航、图组件、表达式 codec、底层上传、依赖、参考仓或后端。不在线写，不建分支/提交/重置；超范围先向主控列准确事实。

## 实施与验证

修改前重读文件、记录 git 状态并保存上述现有文件原始字节副本/哈希；根类型紧邻通过基线为 layout-lifetime-final-typecheck.log。先完成本地草稿桥最小红绿，随后新增 UI 与保存动作逐闭环验证，禁止一口气扩散所有分支。

必须验证：真实四文件创建输入与 Filter 原值保存；add 禁止/途中权限或目标改变；同端点两个 ID 不合并；另一父 Join 保留；取消零请求；仅 relation 与 relation+Join 多视图准确回执/回读；失败/回执不符/回读失败锁重复；metadata 成功 layout 失败只续后段；真实 Renderer 同 runtime input 重挂载、请求中重挂载和回执后回读前失效（显式恢复不再次新增）；其他编辑保留。

最后冻结后根 typecheck、精确 lint、design/page-script-lifetime/实际改动夹具集中跑一次；主控 pages/ai/dirs。未改的表达式、图几何、布局底层和全包大套不重复。交付 relation-create-result.md：实际文件/函数、命令/退出码、原始证据、修订次数及未完成边界。不得以局部通过称完整设计页或线上零回归。
