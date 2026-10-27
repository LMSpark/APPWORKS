状态：superseded（2026-10-24）。本文保留历史研究，不再作为实施入口；当前范围、事实核销与完整整合计划统一进入[唯一台账](data-space-retirement-ledger.md)。下文 I 编号、完成标记及删除结论均须按当前源码重核，不能自动续做。

2026-10-24 核实：参考源码 HEAD 为 `791c464b8c6b3c7049ea36ab57546c3481e4d889`；102 个 feature Vue 文件含局部组件，本仓同路径32个，不能沿用96行矩阵推算完成度。`model-source` 下多类 session/draft 与外部API四个owner仍存在，历史“已删除”不成立。本次完整路径清单见 [reference-inventory.json](evidence/integration-convergence-20261024/reference-inventory.json)。

## 任务目标
把参考仓 appworks（`E:\r\sparkproject` master `packages/ui/domain/metadata/src`）全部业务能力按语义整合进本仓唯一系统，直到下文“完成定义”全部满足。

按语义整合的含义：
- 先梳理参考页的业务语义（目的、输入输出、数据归属、操作、取消/异常、下游），再映射到本仓概念：数据空间=DataSet、模型=DataTable、字段=columns、请求设置=DataView、两类关系；参考页的分区、接口和数据结构不是迁移目标，语义才是。
- 同一语义在参考中重复或错误的，合并或纠正；本仓已有同语义能力的，复用而不重建；AGENTS 要求而参考没有的（命名视图、数据级联），按语义补入。
- 文件落点沿用参考相对路径（AGENTS 0.2）；布局与操作顺序服从语义，参考页作为对照，不机械照抄。
- 数据只经 SPARK data 与标准组件，页面由配置驱动。

## 诊断依据（为什么不沿用 Codex 路线）
2026-10-19 三项只读审计：
- 设计器在 spark-data 之上另建命令框架：~11 个命令类各自 8 态状态机 + JSON 基线 + 回读/未知核验，重复通用逻辑约 2.5–4k 行；`#baseline/#expected/#staged/#changes` 与 ~10 张 static-data 表复制正式数据。同功能 ~25k 行，参考 ~7k 行（3.5×）。
- 配置驱动约 30%：queryContext 注入、工作区路由、选项级联（Vue 内 addCascade）、导航树、`:field-ids` 均在代码。
- 与参考非 1:1：入口为路由而非对话框；页签（元模型/请求设置/前端模型/数据处理）被改组；保存粒度、关系编辑、列表删除不同。
结论：结构错误，不再逐缺陷打补丁；以参考页为蓝本、spark-data 为唯一数据逻辑重建，旧代码只挑可复用部分。

## 硬约束（每次迭代都检查，违反即不通过）
1. 页面/页面专用 TS 不得出现：命令状态机（idle/saving/unknown/readback…）、JSON 快照/基线比对、正式数据的私有副本、复制正式数据的 static-data 表、手传记录数组/ID 列表 props。
2. 通用能力（草稿、取消、校验、保存回执、未确认结果、预览、刷新）只在 spark-data / 标准组件；缺则先补公共能力，再写页面。
3. 视图、查询上下文、级联、字段投影声明在场景 pagedata；页面代码只触发命令。
4. 规模信号：页面层（Vue + 页面专用 TS）明显超过参考同语义实现时，须说明哪部分是本仓新增语义，否则视为重复逻辑待收敛。
5. 参考仓、Java 只读；服务不支持的能力在 UI 明确提示，不前端伪造。
6. 不建前端角色判断（AGENTS 0.3）。

## 完成定义（全部满足即“完全移入”）
- 整页验收矩阵 96 行全部五列通过（语义/合同/页面/删除/实页）。
- vue-pages 无换路径包装；`src/views` 无参考已覆盖的旧自建页；`/data-space-design` 等自建短路径删除。
- 硬约束 1 的静态检查（迭代 1 建脚本）对 `src/views/features/**`、`src/lowcode/**` 零命中。
- typecheck、lint、全量 vitest、生产构建通过；全量实页走查一次通过。

## 迭代节奏（每次迭代相同）
1. 开工：记录参考 HEAD 与对照文件哈希；读参考页及其 data/api 调用链，写语义卡（输入/输出/模型/字段/操作/取消/异常/下游）入矩阵备注。
2. 合同：场景 pagedata 声明模型绑定、命名视图、级联；需要的数据层资源适配落 `spark-lowcode-api`。
3. 公共能力缺口：补 spark-data / 标准组件（带测试、刷新 ClassModel）。
4. 页面：原路径重建，标准组件 + dataViewKey；删除被替代代码。
5. 验证：定向测试 → 迭代末影响面回归 + 构建 + 实页（隔离 T=944DEE5A…）。
6. 收尾：矩阵更新、硬约束检查、一个迭代一组提交；无新风险不重跑大回归。
- 迭代时长目标 1–2 天；一次迭代只做一组页面，不开计划外补丁轮。
- v3 起迭代内**一次只闭环一页**，每页按下节七步走；迭代节奏 1–6 由七步具体化。

## 单页流程（v3，每页相同）

为什么：服务器管理页（2026-10-21）暴露的问题都来自缺流程——没读参考调用链把注册命令当插表；没核组件缺省值（`autoColumns`）导致无字段；夹具与线上模型不一致（`Password` output）测试恒绿；回执 200 当成功未按主键回读。

1. **读原代码**：参考页 `.vue` + `packages/data/metadata/src/api/**` 对应文件 + 内置能力执行器 `packages/data/spark-api/src/application/application-builtin-capabilities.ts`。产出语义卡（入口、操作、字段、校验、取消、异常、下游），记入台账本页条目。
2. **调用分类**：原页每个调用逐条归入下表一类（只看原代码，不看本仓现状）。
3. **映射 spark-data**：每类唯一落点（见调用分类表）；映射不到登记能力缺口，先补公共能力，不在页面绕过。
4. **查组件合同**：ClassModel 目录→概要→指南，核每个标准组件的属性缺省值、绑定、子组件。必核项见「流程改进记录 · 检查清单」。
5. **实现与删除**：原相对路径；标准组件 + `dataViewKey`；被替代逻辑同批删除；硬约束 1–6 不变。
6. **测试对齐线上**：夹具的模型字段（output/computed/只读）、权限参数、命令应答以实页抓到的真实请求/响应为准；断言看真实字段标题与值，不看元素数量。
7. **实页回读验收**：写操作 = 回执 + 按主键回读 + 重载仍在；删除回读后消失；测不了记「未测」不升矩阵。
8. **回写流程**：新发现的通用问题写入「流程改进记录」与检查清单；不追改已完成页，除非影响结果。

## 调用分类表（v3）

参考 metadata API 77 文件：模型查询 246 处；模型保存 create 42 / update 54 / save 46 / remove 35；内置能力约 26 处（DataBaseManage 8、services 6、StructuredConfig 3、SemiStructured 3、SystemSupport 3、APIManage 2、SafetyProtection 1）。

| 类别 | 原代码形态 | spark-data 落点 | 状态 |
| --- | --- | --- | --- |
| 模型查询 | `metadataSparkApiClient.query({metaName})` | DataView（场景装配 + `dataViewKey`） | 已有 |
| 模型保存 | `create/update/save/remove`，meta 为正式模型 | DataView 编辑 + `DataSet.saveChanges` | 已有 |
| 只读命令 | 内置能力查询（未登记库/表/视图、测试连接、缓存查询等） | `bindDataSetReadonlyCommandQuery` | 已有 |
| 写命令 | 内置能力 `create`（`serverRegister`、`dbOperateData`、`tableSyncMetaData`、`cacheDelete` 等） | `bindDataSetCommandSubmit`（命令视图新增行 → saveChanges → 回执；传输失败未确认、核验不重放） | 已有（2026-10-21 补齐，服务器注册首用） |
| 文件/其它资源 | `file`、`textFile`、`jsonData`、`apiCall` 等 | 既有文件/资源适配 | 到页核对 |

## 流程改进记录（v3，持续追加）

### 检查清单（每页开工前全部过一遍）
- [ ] 每个写操作先判类别：内置能力 `create` 是写命令，不能改成模型插表。
- [ ] `RendererTable` 的 `autoColumns` 缺省 false（文档写明须 true）；`RendererForm`/`RendererDetail` 文档称默认 true 但实现无默认值，Vue 布尔缺省同样为 false——无显式 children 时必须显式 `:auto-columns="true"`。
- [ ] 新增行初值只含视图实有列；不可输出字段（output=false）不能经模型视图写。
- [ ] 编辑目标按主键核对，不按行对象相等（保存被拒后数据层以新对象恢复同主键行）。
- [ ] 夹具字段属性与线上 `readModel` 一致；先在实页抓一次真实 GetData/保存请求再写夹具。
- [ ] 保存成功判定 = 回执 + 回读含该主键；否则明确报错，不提示成功。
- [ ] 新增/命令表单：自动字段会显示草稿行的系统主键；需隐藏时显式声明字段子组件（标签须写明，子组件不回退列 label）。
- [ ] 原页的密码、遮盖等输入形态先查标准组件属性，缺则扩展组件并刷新 ClassModel。
- [ ] 后端 AjaxResult：HTTP 200 + `Code` 非 0/200 是明确失败；网络中断/超时/5xx 才是结果未知，按主键核验、不重放。

### 记录
| 日期 | 页面 | 发现 | 回写 |
| --- | --- | --- | --- |
| 2026-10-21 | service-management-page | 注册是 `/Db/registerServer` 命令；autoColumns 缺省；夹具 Password 不一致；回执当成功 | 检查清单 1–6；缺口 1 |
| 2026-10-21 | service-management-page（写命令重走） | 自动表单把草稿行主键当只读字段显示；字段子组件标签不读列 label；密码输入无标准能力；命令视图首次查询前不能 discard；AjaxResult 业务失败是 HTTP 200 + Code≠200 | 检查清单 7–9；`r-text` 补 `showPassword` |
| 2026-10-21 | table-and-view-page | 清单 2 命中：五个 RendererTable 与两个对话框表单均缺 autoColumns，旧测试只数 th 未发现；实页受正式模型未登记阻塞 | 无新清单项；页面测试一律断言表头文本与行值 |
| 2026-10-21 | table-design（表和视图页） | 参考「同步元数据」是写命令 `POST /Table/SyncMetaData/{dbid}/{tableid}`，不是字段 save；未登记视图是只读 `GET /View/getUnregisteredView/{dbId}` | 复用 `bindDataSetCommandSubmit`；`attachCatalogCommandViews` 拆成幂等分片 attach |
| 2026-10-21 | service-management-page | 参考列表只展示 ServerName/ip/Port/Type/createuser/createtime/description，autoColumns 会带出账号密码列 | 显式 `DATABASE_SERVER_LIST_FIELDS` children |
| 2026-10-22 | table-and-view（写命令） | 参考 register-dialog 的 saveRegisterTable/View 走内置 `tableRegister`/`viewRegister`，POST 体为 `table_name` 数组，不是 _Base_TblList 插表 | `databaseCatalogRegisterTables/Views` + 两命令视图；页面结构待用户定稿后再接 register-dialog |
| 2026-10-22 | table-design-dialog | 参考 `saveTableRelation` 是 Base_TblRln 模型保存，不是写命令；关系 UI 须走 staged addRow/editRowById + saveChanges | `database-catalog-relation-form-ops` + `table-relation-dialog.vue`；语义卡见 `research-database-management-i5-table-design.md` |
| 2026-10-22 | table-design-dialog（预览） | `getTablePreviewData` = 同 FormKey 的 GetData 物理表描述（dbId+表名+字段元数据），不是 hub 再选服务器 | `database-catalog-preview-view-ops` + 表设计「数据」页签 |
| 2026-10-22 | table-design-dialog（工作流） | 参考按 tblid 查 `Base_WorkflowDefinition`；设计按钮为 stub | `database-catalog-workflow-view-ops` + 表设计「数据流」页签；`DataViewFilter.group` 须用 plain 条件对象 |
| 2026-10-22 | table-design-dialog（收束） | 工作流顶栏筛选 + 「设计」暂未实现；#9 AI 无 I5 宿主 | 调用分类 #1–#8 通过；#9 登记能力缺口 |
| 2026-10-22 | view-design-dialog | 参考三页签 + `getViewPreviewData`→GetData Type=数据库视图；应用=Base_AppSystemList | `research-database-management-i5-view-design.md`；application-option-dialog |
| 2026-10-22 | table-and-view-page（hub） | 载体页汇总子能力；register 全链路 vitest | `research-database-management-i5-hub.md` + register-dialog v3 |
| 2026-10-22 | copy-table / register-database / 表关系 UI | 语义卡 + page 关系/库注册 vitest | copy-table-v3、register-database-v3；夹具 T3 |
| 2026-10-22 | service-management-page | 页面级 registerServer 确认 vitest | 正向注册与 ops 测试互补 |
| 2026-10-22 | 目录删除（I5） | 表/视图/服务器 page 删除确认 + delete-v3 research | `research-database-management-i5-delete.md` |
| 2026-10-22 | database-management-hub | tier resolve + 默认 catalog 面板 vitest | `research-database-management-i5-management-hub.md` |
| 2026-10-22 | table-design 同步/删关系 | SyncMetaData + 关系 tab 删除 page vitest | table-design-v3 / delete-v3 回写 |
| 2026-10-22 | 设计 save / 预览 / 应用 | 表头 save、表/视图数据页签 GetData、应用选择 vitest | view-design-v3 / table-design-v3 回写 |
| 2026-10-22 | add-table / service 编辑 | 目录插表确认 + 服务器编辑/测连 page vitest | add-table-v3、service-management-v3 |
| 2026-10-22 | 表设计字段网格 save | 双击 cnname → 设计工具栏保存 page vitest | table-design-v3 |
| 2026-10-22 | I5 DB v3 收束 | 视图输出字段 save、注册视图、工作流设计 stub、AI 缺口卡、矩阵/ hub 收束声明 | hub-v3 / view-design-v3 / ai-capability-gap-v3 |
| 2026-10-22 | I5→I6 交接 | I5 入口文档刷新；formal-gap 写 vitest 84 基线；启动字典 I6 研读卡 | i5-entry / dictionary-i6-v3 |
| 2026-10-22 | 字典目录→数据维护 | openData 无 tenant 回退 feature 路径；catalog vitest 设计/导航 | dictionary-i6-v3 |
| 2026-10-22 | 字典 I6 布局/语义卡 | 目录/数据页头+高亮；三页 list/setting/data v3 研读卡 | dictionary-i6-v3 |
| 2026-10-22 | I6 structured-config 收束 | 16 行 Vue+lowcode+40 vitest；字典实页 blocked JSON；Code/ViewData/Workflow HTTP 部分未实服核 | plan-structured-config-i6-full |
| 2026-10-23 | I7 semi-structured 波 0 | hub + plan draft + api-gaps；pdf 未进 reference inventory | research-semi-structured-i7-hub-v3 |
| 2026-10-23 | I7 semi-structured 波 1–4 | 10 Vue + lowcode staged DataView；5 导航页；vitest 116（registry+I6+I7）；HTTP 仅在 ops | plan-semi-structured-i7-full |
| 2026-10-23 | I7 烟测 partial | typecheck/lint/page-thin 绿；全量 verify 阻断于 ai-codegen(152)/docs/dirs/class-model/contracts；见 live-pilot-semi-structured-mvp.json | plan-semi-structured-i7-full |

## 迭代清单
| 迭代 | 内容 | 退出条件 |
| --- | --- | --- |
| I0 | 语义整合设计书：①全量语义清单——96 页按业务能力归并（同一能力跨页去重），每项写目的/输入输出/数据归属/操作/下游；②语义映射——每项落到本仓 DataSet/DataTable/columns/DataView/关系/级联/资源适配，标出复用本仓已有能力、需补公共能力、参考缺陷需纠正；③设计器专项：参考页签语义→本仓归属、入口方式、保存粒度、现有 41 类“保留/合并/删除”清单；④据此修正 I1—I13 分组（按能力而非目录） | 用户审批 |
| I1 | 公共能力：spark-data 设计类命令（预览→确认→saveChanges→回执，未知结果核验）一份通用实现；硬约束静态检查脚本；pagedata 级联/queryContext 声明能力补齐 | 公共测试通过；脚本可跑 |
| I2 | 数据空间列表页：1:1（含删除、设计对话框入口） | 矩阵 1 行通过 |
| I3 | 设计器骨架：概览/画布/节点面板/关系面板按参考布局；元模型+请求设置页签 | 实页保存/重开 |
| I4 | 设计器：前端模型、数据处理、输入参数、复制API；命名视图与级联（AGENTS 增补） | 设计器 3 行通过；旧 src/lowcode/data-space 命令类删除 |
| I5 | database-management 6（替换 DBMS.vue） | 6 行通过，DBMS 包装删 |
| I6 | structured-config 16 行（data-code 8 + dict 3 + logic 2 + workflow 3） | **收束**（vitest 98；实页 blocked JSON；见 I6 hub） |
| I7 | semi-structured 10 | 10 Vue 已落盘；catalog+设计走 SPARK data；**实页 blocked**；烟测 partial（verify 未全绿，116 vitest 绿） |
| I8 | application 24（替换 AppList.vue 包装） | 24 行 |
| I9 | governance 6 + integration 8（report 5、api 3 复核） | 14 行 |
| I10 | organization 10 | 10 行 |
| I11 | system 6（替换 CacheManager.vue 包装） | 6 行 |
| I12 | workflow 11 | 11 行 |
| I13 | 1010 独有 ~15 文件判定；全量回归、构建、全量实页走查；删除残余旧页与台账收档 | 完成定义满足 |

## 风险与控制
- 重建期间旧设计器仍是线上入口：I3/I4 在原路径替换，旧实现保留到 I4 退出条件满足后一次删除。
- 后端缺口（字典计算字段、逻辑来源 rowid、DISTINCT 排序）：I3/I4 中 UI 提示，记入矩阵备注，不阻塞迭代。
- 参考仓 HEAD 漂移：每迭代开工记录；漂移影响已完成页时记入下一迭代复核。
- 规模：93 页；若某迭代超时，按页拆分但不跨组混做。

## 遗留事项（v3）
- 2026-10-22 表和视图 **I5 v3 代码收束**：hub/子页 vitest 主路径齐（注册表/视图、设计 save、预览、关系、复制/删除、服务器编辑/测连）；AI #8/#9 见 `research-database-management-i5-ai-capability-gap.md`；add-table 字段批与实页 formal-model-gap **仍开放**（非本周期前端可关）。
- 2026-10-21 直接插表疑似遗留两条不可见 `i5-pilot-discard`（`4490A9FA…`、`4D4FC71D…`）：未加载记录不经 DataView 删除，待后端核实清理。
- 注册命令方案 [`plan-database-server-register-command.md`](plan-database-server-register-command.md) 已并入本方案（缺口 1），原文件 superseded。

## 整页验收矩阵（参考 master 09937a5d6，96 页面级 Vue）

状态列：语义 / 合同 / 页面 / 删除 / 实页，未开始记“—”。v3 新增：调用分类（原页调用是否全部归类并有落点）、流程（本页发现已回写流程改进记录，或注明无新发现）。

能力归属列只表示参考语义映射到已列目录ID，不代表本仓实现或验收通过。O4人员/部门选择器是跨页面能力，在组织及选人消费者处为候选；S6会话、S7全局消息属于平台壳能力，当前不分配具体矩阵页。设计书称44项，但按其显式合并ID拆分当前只能辨识41项；差额3项保持未定义，不补造ID。

| 阶段 | 参考页面（features/ 下） | 本仓现状 | 语义 | 合同 | 页面 | 删除 | 实页 | 调用分类 | 流程  | 能力归属（审核候选） |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | ---  | --- |
| 1 | data-platform/data-set-management/design/ui/data-set-design-page.vue | 已同路径；I3 五页签+请求方案；I4 §4.3 11 类命令已删（`*-session.ts`+Handle，view-design Map 保留） | 部分 | 部分 | 部分 | 部分 | — | — | —  | D2 |
| 1 | data-platform/data-set-management/ui/data-set-auth-page.vue | 缺 | — | — | — | — | — | — | —  | 未映射：数据空间权限 |
| 1 | data-platform/data-set-management/ui/data-set-list-page.vue | 已同路径；对话框设计入口+删除+去短路径（工作区） | 通过 | 通过 | 通过 | 通过 | — | — | —  | D1 |
| 2 | data-platform/database-management/table-and-view/ui/add-table-dialog.vue | 目录插表 + 未登记表名只读命令；字段在表设计 | 部分 | 通过 | 部分 | — | — | 部分（#2 与参考 saveAddTable 字段批差距） | —  | B2 |
| 2 | data-platform/database-management/table-and-view/ui/register-dialog.vue | 未登记表/视图多选 + registerTable/registerView；默认字段选项 | 部分 | 通过 | 部分 | — | — | 通过 | 回写 1 条  | B2 |
| 2 | data-platform/database-management/table-and-view/ui/table-and-view-page.vue | tiered hub；子对话框同 DataSet（见 hub-v3 research） | 部分 | 部分 | 部分 | 通过 | 阻塞（正式模型未登记，见 live-pilot-formal-model-gap.json） | 通过（子页分 research；add-table 字段批差距） | 回写 5 条  | B2 |
| 2 | data-platform/database-management/table-and-view/ui/table-design-dialog.vue | 表头+字段+关系+预览+数据流（筛选）；Base_TblRln 增删改；同步元数据写命令 | 部分 | 通过 | 部分 | 通过（关系 tab 删除 vitest） | — | 通过（#9 缺口已登记） | 回写 2 条  | B2 |
| 2 | data-platform/database-management/table-and-view/ui/view-design-dialog.vue | 三页签（设计/输出/数据）；GetData 数据库视图预览；应用选择；输出字段 save | 部分 | 通过 | 部分 | — | — | 通过（#8 AI 缺口已登记） | 回写 2 条  | B2 |
| 2 | data-platform/database-management/ui/service-management-page.vue | 列表/刷新/编辑；registerServer + 页面注册/删除 vitest；列表 7 列 children | 部分 | 通过 | 部分 | 通过 | 部分（tier JSON serverPageCycle + serverRegisterCommand） | 通过（模型查询/保存、只读命令测连、写命令注册/删除） | 回写 12 条  | B1 |
| 2 | data-platform/semi-structured/excel-import/ui/excel-import-editor-page.vue | 已同路径；layout/rules→designJson staged save | 部分 | 部分 | 部分 | — | 阻塞 | 部分（Read/WriteDesign 待实服） | —  | H1 |
| 2 | data-platform/semi-structured/excel-import/ui/excel-import-list-page.vue | 已同路径；catalog DataView | 部分 | 通过 | 部分 | — | — | 通过 | —  | H1 |
| 2 | data-platform/semi-structured/excel-import/ui/excel-import-sheet-layout-lookup-dialog.vue | 已同路径；占位对话框 | 部分 | — | 部分 | — | — | 部分 | —  | H1 |
| 2 | data-platform/semi-structured/excel-import/ui/excel-import-sheet-layout-pane.vue | 已同路径；editor 子面板 | 部分 | — | 部分 | — | — | — | —  | H1 |
| 2 | data-platform/semi-structured/excel-import/ui/excel-import-transform-rule-dialog.vue | 已同路径；占位 | 部分 | — | 部分 | — | — | 部分 | —  | H1 |
| 2 | data-platform/semi-structured/excel-import/ui/excel-import-transform-rules-pane.vue | 已同路径；editor 子面板 | 部分 | — | 部分 | — | — | — | —  | H1 |
| 2 | data-platform/semi-structured/json-data/ui/json-data-page.vue | 已同路径；目录+JsonContentEdit refresh/save | 部分 | 部分 | 部分 | — | 阻塞 | 通过（GetJson/SaveJsonData 在 lowcode ops） | —  | H3 |
| 2 | data-platform/semi-structured/pdf-inspect/ui/pdf-inspect-editor-page.vue | 已同路径；规则 JSON staged save | 部分 | 部分 | 部分 | — | 阻塞 | 部分（reference 未进 inventory） | —  | H2 |
| 2 | data-platform/semi-structured/pdf-inspect/ui/pdf-inspect-list-page.vue | 已同路径；catalog | 部分 | 通过 | 部分 | — | — | 通过 | —  | H2 |
| 2 | data-platform/semi-structured/pdf-inspect/ui/pdf-inspect-rule-form.vue | 已同路径；editor 子表单 | 部分 | — | 部分 | — | — | — | —  | H2 |
| 2 | data-platform/structured-config/data-code/ui/code-class-edit-dialog.vue | 已同路径；stub 对话框 | 部分 | 部分 | 部分 | — | — | 部分（SaveCodeDesign/分配 API 见 api-gaps） | —  | C2 |
| 2 | data-platform/structured-config/data-code/ui/code-class-selector-dialog.vue | 已同路径 | 部分 | 部分 | 部分 | — | — | 部分 | —  | C2 |
| 2 | data-platform/structured-config/data-code/ui/code-init-dialog.vue | 已同路径 | 部分 | 部分 | 部分 | — | — | 部分 | —  | C2 |
| 2 | data-platform/structured-config/data-code/ui/data-code-editor-page.vue | 已同路径；CodeName save MVP | 部分 | 部分 | 部分 | — | — | 部分（#1 目录查询 #2 Get/SaveCodeDesign） | —  | C2 |
| 2 | data-platform/structured-config/data-code/ui/data-code-list-page.vue | 已同路径；catalog 装配 | 部分 | 通过 | 部分 | — | — | 通过（catalog DataView） | —  | C2 |
| 2 | data-platform/structured-config/data-code/ui/parent-code-dialog.vue | 已同路径 | 部分 | 部分 | 部分 | — | — | 部分 | —  | C2 |
| 2 | data-platform/structured-config/data-code/ui/sequence-selector-dialog.vue | 已同路径 | 部分 | 部分 | 部分 | — | — | 部分 | —  | C2 |
| 2 | data-platform/structured-config/data-code/ui/time-string-dialog.vue | 已同路径 | 部分 | 部分 | 部分 | — | — | 部分 | —  | C2 |
| 2 | data-platform/structured-config/data-dictionary/ui/data-dictionary-list-page.vue | 已同路径；catalog + 设计对话框 | 通过 | 通过 | 部分 | — | 阻塞（live-pilot-dictionary.json） | 通过 | —  | C1 |
| 2 | data-platform/structured-config/data-dictionary/ui/dictionary-data-page.vue | 独立数据维护；heading vitest | 通过 | 通过 | 部分 | — | 阻塞（同上） | 通过 | —  | C1 |
| 2 | data-platform/structured-config/data-dictionary/ui/dictionary-setting.vue | 设计/workspace；workflow vitest | 通过 | 通过 | 部分 | — | 阻塞（同上） | 通过 | —  | C1 |
| 2 | data-platform/structured-config/logic-view/ui/logic-view-design-page.vue | ViewData JSON MVP | 部分 | 通过 | 部分 | — | — | 通过（GetView/SaveView） | —  | C3 |
| 2 | data-platform/structured-config/logic-view/ui/logic-view-list-page.vue | 已同路径；catalog | 部分 | 通过 | 部分 | — | — | 通过 | —  | C3 |
| 2 | data-platform/structured-config/workflow-definition/design/ui/workflow-design-page.vue | JSON 节点/边 MVP | 部分 | 部分 | 部分 | — | — | 部分（read/write 未实服核） | —  | C4 |
| 2 | data-platform/structured-config/workflow-definition/ui/workflow-definition-page.vue | 已同路径；catalog | 部分 | 通过 | 部分 | — | — | 通过 | —  | C4 |
| 2 | data-platform/structured-config/workflow-definition/ui/workflow-trigger-table-dialog.vue | 已同路径；触发表 stub | 部分 | 部分 | 部分 | — | — | 部分 | —  | C4 |
| 3 | application/application-context/ui/application-database-relations-page.vue | 缺 | — | — | — | — | — | — | —  | A1 |
| 3 | application/application-context/ui/application-function-route.vue | 缺 | — | — | — | — | — | — | —  | A2 |
| 3 | application/application-function-management/ui/application-function-page.vue | 缺 | — | — | — | — | — | — | —  | A2 |
| 3 | application/application-manager/ui/application-database-dialog.vue | 缺 | — | — | — | — | — | — | —  | A1 |
| 3 | application/application-manager/ui/application-manager-form-dialog.vue | 缺 | — | — | — | — | — | — | —  | A1 |
| 3 | application/application-manager/ui/application-manager-list.vue | 缺 | — | — | — | — | — | — | —  | A1 |
| 3 | application/application-manager/ui/application-manager-page.vue | 换路径→tenant/AppList.vue | — | — | — | — | — | — | —  | A1 |
| 3 | application/application-manager/ui/application-relation-dialogs.vue | 缺 | — | — | — | — | — | — | —  | A1 |
| 3 | application/data-menu/ui/data-menu-dialog.vue | 缺 | — | — | — | — | — | — | —  | A3 |
| 3 | application/data-menu/ui/data-menu-list.vue | 缺 | — | — | — | — | — | — | —  | A3 |
| 3 | application/data-menu/ui/data-menu-page.vue | 缺 | — | — | — | — | — | — | —  | A3 |
| 3 | application/enterprise-app-auth-application/ui/apply-app-auth-content.vue | 缺 | — | — | — | — | — | — | —  | A4 |
| 3 | application/enterprise-app-auth-application/ui/apply-app-auth-page.vue | 缺 | — | — | — | — | — | — | —  | A4 |
| 3 | application/enterprise-app-auth-application/ui/enterprise-app-auth-application-audit-dialog.vue | 缺 | — | — | — | — | — | — | —  | A4 |
| 3 | application/enterprise-app-auth-application/ui/enterprise-app-auth-application-list.vue | 缺 | — | — | — | — | — | — | —  | A4 |
| 3 | application/enterprise-app-auth-application/ui/enterprise-app-auth-application-page.vue | 缺 | — | — | — | — | — | — | —  | A4 |
| 3 | application/enterprise-app-auth-application/ui/my-app-auth-request-list.vue | 缺 | — | — | — | — | — | — | —  | A4 |
| 3 | application/enterprise-app-auth-application/ui/my-app-auth-request-page.vue | 缺 | — | — | — | — | — | — | —  | A4 |
| 3 | application/enterprise-regist-manager/ui/enterprise-app-auth-dialog.vue | 缺 | — | — | — | — | — | — | —  | A5 |
| 3 | application/enterprise-regist-manager/ui/enterprise-audit-dialog.vue | 缺 | — | — | — | — | — | — | —  | A5 |
| 3 | application/enterprise-regist-manager/ui/enterprise-config-dialog.vue | 缺 | — | — | — | — | — | — | —  | A5 |
| 3 | application/enterprise-regist-manager/ui/enterprise-password-dialog.vue | 缺 | — | — | — | — | — | — | —  | A5 |
| 3 | application/enterprise-regist-manager/ui/enterprise-regist-manager-list.vue | 缺 | — | — | — | — | — | — | —  | A5 |
| 3 | application/enterprise-regist-manager/ui/enterprise-regist-manager-page.vue | 缺 | — | — | — | — | — | — | —  | A5 |
| 3 | governance/desensitization-rule/ui/desensitization-rule-page.vue | 缺 | — | — | — | — | — | — | —  | G1 |
| 3 | governance/navigation-permission/ui/navigation-permission-page.vue | 缺 | — | — | — | — | — | — | —  | G2 |
| 3 | governance/role-management/ui/role-auth-page.vue | 缺 | — | — | — | — | — | — | —  | G2；嵌入数据空间权限（见151，未映射） |
| 3 | governance/role-management/ui/role-management-page.vue | 缺 | — | — | — | — | — | — | —  | G3（不迁） |
| 3 | governance/role-management/ui/role-user-page.vue | 缺 | — | — | — | — | — | — | —  | G5（不迁） |
| 3 | governance/user-app-authorization/ui/user-app-authorization-page.vue | 缺 | — | — | — | — | — | — | —  | G6（后置） |
| 3 | integration/api-management/ui/api-config-page.vue | 已同路径(待按语义验收) | — | — | — | — | — | — | —  | I1 |
| 3 | integration/api-management/ui/api-interface-list-page.vue | 已同路径(待按语义验收) | — | — | — | — | — | — | —  | I1 |
| 3 | integration/api-management/ui/api-management-page.vue | 已同路径(待按语义验收) | — | — | — | — | — | — | —  | I1 |
| 3 | integration/report/ui/report-form-dialog.vue | 缺 | — | — | — | — | — | — | —  | I2 |
| 3 | integration/report/ui/report-management-list.vue | 缺 | — | — | — | — | — | — | —  | I2 |
| 3 | integration/report/ui/report-management-page.vue | 缺 | — | — | — | — | — | — | —  | I2 |
| 3 | integration/report/ui/report-model-dialog.vue | 缺 | — | — | — | — | — | — | —  | I2 |
| 3 | integration/report/ui/report-version-dialog.vue | 缺 | — | — | — | — | — | — | —  | I2 |
| 4 | organization/job-management/ui/job-management-page.vue | 缺 | — | — | — | — | — | — | —  | O2 |
| 4 | organization/leave-management/ui/leave-form-aside.vue | 缺 | — | — | — | — | — | — | —  | O5 |
| 4 | organization/leave-management/ui/leave-form-page.vue | 缺 | — | — | — | — | — | — | —  | O5 |
| 4 | organization/leave-management/ui/leave-management-page.vue | 缺 | — | — | — | — | — | — | —  | O5 |
| 4 | organization/organization-structure/ui/organization-structure-page.vue | 缺 | — | — | — | — | — | — | —  | O1 |
| 4 | organization/user-management/ui/user-form-dialog.vue | 缺 | — | — | — | — | — | — | —  | O3 |
| 4 | organization/user-management/ui/user-management-list.vue | 缺 | — | — | — | — | — | — | —  | O3 |
| 4 | organization/user-management/ui/user-management-page.vue | 缺 | — | — | — | — | — | — | —  | O3 |
| 4 | organization/user-management/ui/user-permission-dialog.vue | 缺 | — | — | — | — | — | — | —  | G6（子页消费） |
| 4 | system/bug-manage/ui/bug-manage-page.vue | 缺 | — | — | — | — | — | — | —  | S5 |
| 4 | system/cache-management/ui/cache-management-page.vue | 换路径→tenant/CacheManager.vue | — | — | — | — | — | — | —  | S2 |
| 4 | system/data-recovery/ui/data-recovery-page.vue | 缺 | — | — | — | — | — | — | —  | S3 |
| 4 | system/flow-monitor/ui/flow-monitor-page.vue | 缺 | — | — | — | — | — | — | —  | S4 |
| 4 | system/login/ui/login-page.vue | 缺 | — | — | — | — | — | — | —  | S1 |
| 4 | workflow/flow-append-user/ui/flow-append-user.vue | 缺 | — | — | — | — | — | — | —  | W5 |
| 4 | workflow/flow-model/design/ui/flow-design-page.vue | 缺 | — | — | — | — | — | — | —  | W2 |
| 4 | workflow/flow-model/ui/flow-model-list-page.vue | 缺 | — | — | — | — | — | — | —  | W1 |
| 4 | workflow/flow-runtime/bus-detail/ui/bus-flow-detail-page.vue | 缺 | — | — | — | — | — | — | —  | W3 |
| 4 | workflow/flow-runtime/detail/ui/flow-run-detail-page.vue | 缺 | — | — | — | — | — | — | —  | W3 |
| 4 | workflow/flow-runtime/run-page/ui/flow-run-page.vue | 缺 | — | — | — | — | — | — | —  | W3 |
| 4 | workflow/flow-runtime/run-page/ui/flow-run-page-mobile.vue | 缺 | — | — | — | — | — | — | —  | W3 |
| 4 | workflow/flow-workbench/ui/flow-workbench-todo-mobile.vue | 缺 | — | — | — | — | — | — | —  | W4 |
| 4 | workflow/flow-workbench/ui/flow-workbench-todo-panel.vue | 缺 | — | — | — | — | — | — | —  | W4 |

## 迭代记录

### I1 公共能力（2026-10-19，完成）
- P8：`tools/verify-page-thin.mjs` + 基线 `tools/page-thin-baseline.json`（34 文件：command-status 82、static-copy 23、json-baseline 17、hand-passed-ids 5），接入 `verify:rules`；只许收紧。
- P2：`queryContext.<键名>` 单键级联目标（`query-cascade-inputs.ts`、`types.ts`），保留其他键，撤销删键，禁止与整体 queryContext 混用。
- P1：`DataSet.saveChangesInPhases`（`dataset.ts`）有序分阶段提交，失败/未确认即停，重试从首个未完成阶段继续，不重放；不提供事务。
- P3：现有 viewCascades 字段级联即可承接，无新代码；I3 迁移 Vue 内 addCascade 时落地。P7：随 I3 首个消费者实现，不预建。
- 验证：typecheck、改动文件 lint；spark-data 42 文件 938 项；数据空间运行链与 lowcode-api 31 文件 1292 项；ClassModel 正式生成。
