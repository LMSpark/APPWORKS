状态：approved（2026-10-19 用户通过 §8 四项决定；I1—I13 按本书执行）

# AppWorks 按语义整合设计书

依据：参考仓 `E:\r\sparkproject` master `packages/ui/domain/metadata/src`（HEAD 09937a5d6）及其数据层 `packages/data/metadata/src/api/**`；本仓 AGENTS.md 0.2—0.7、[DATAFLOW_ARCHITECTURE.md](../docs/architecture/DATAFLOW_ARCHITECTURE.md) §0、§1.2；计划与 96 页矩阵 [plan-appworks-integration.md](plan-appworks-integration.md)。五份只读梳理（2026-10-19）汇总于此，细节以源码为准。

## 1. 整合原则

1. 语义优先：参考页的分区、接口、表结构只作证据；目标是本仓 DataSet / DataTable / columns / DataView / 两类关系 / 资源适配。
2. 同一能力跨页合并；参考已证缺陷不迁；角色模型与角色判断不迁（功能标签、FunctionNodeAuth 授权记录作为数据配置保留，运行权限本阶段暂缓）。
3. 每个能力 = 设计（配置）与数据维护分离（参考字典专题模板）；数据只经 spark-data 与标准组件；视图、queryContext、级联在 pagedata 声明。
4. 文件落参考相对路径；能力内部布局服从语义。
5. 后端只用实际服务；内置命令（注册服务器、表同步、缓存、恢复、编码、文件、工作流引擎）在 `spark-lowcode-api` 做资源适配，页面不直连。

## 2. 能力目录（96 页 → 44 个能力）

| 组 | 能力 | 参考规模 | 本仓现状 | 处理 |
| --- | --- | --- | --- | --- |
| 数据空间 | D1 空间目录（含删除） | ~0.4k | 列表页同路径，缺删除 | 重建 |
| 数据空间 | D2 设计器（结构/请求方案/字段呈现/数据处理/关系/级联/参数/布局/预览/复制API） | ~6.6k | 16.5k，平行命令框架 | 重建（见 §4） |
| 数据库 | B1 服务器管理 | ~0.65k | `DBMS.vue` 换路径包装 | 重建，删包装 |
| 数据库 | B2 表/视图目录与设计（字段、关系、同步、预览、注册） | ~5.1k | `DBMS.vue` 局部 | 重建；表关系用 filterExpression 承接，不把 Base_TblRln 当本仓关系 |
| 结构化 | C1 字典（设计∥数据） | ~1.7k | 已同路径，专题样板 | 按新约束复核 |
| 结构化 | C2 业务编码方案 | ~3.6k | 无 | 新建 |
| 结构化 | C3 逻辑视图（后端视图资源，≠本仓命名 DataView） | ~2.2k | 无 | 新建 |
| 结构化 | C4 数据工作流定义（≠本仓 AI WorkflowDesigns） | ~6k | 无 | 新建 |
| 半结构化 | H1 Excel 导入方案 | ~5.4k | 无 | 新建 |
| 半结构化 | H2 文件核验方案 | ~2.2k | 无 | 新建 |
| 半结构化 | H3 JSON 资源 | ~0.6k | 无 | 新建 |
| 应用 | A1 应用目录与库关系 | ~1.7k | `AppList.vue` 换路径包装 | 重建；去硬编码 RoleId |
| 应用 | A2 功能/蓝图导航设计 | ~4.8k | ProjectBlueprint/DevSystem 已有 IO | 重建 UI；导航树只留一份真源（本仓蓝图），DB 导航表为投影 |
| 应用 | A3 导航宿主（DataMenu） | ~1.1k | 无 | 新建 |
| 应用 | A4 企业应用授权申请/审核 | ~1.1k | 无 | 新建（无角色显隐） |
| 应用 | A5 企业注册治理 | ~2.1k | 平台租户页部分 | 重建，对齐 Base_Enterprise_Info 审核链 |
| 治理 | G1 脱敏规则 | ~0.6k | 无 | 新建 |
| 治理 | G2 导航功能授权配置（含原角色功能授权的 FunctionNodeAuth 部分） | ~3.1k | permission-design-api 合同 | 新建 UI，主体选择不以角色为中心 |
| 治理 | G3 角色分类/CRUD、G5 角色-用户 | ~2.3k | — | 不迁 |
| 治理 | G6 用户应用权限只读 | ~0.3k | — | 后置（I13 判定） |
| 集成 | I1 外部接口管理 | ~3.2k | 已同路径 DataView 样板 | 按新约束复核 |
| 集成 | I2 报表管理 | ~1.6k | 无 | 新建（设计器外链） |
| 集成 | I3 AI 助手传输 | ~0.1k | ai-turn-bridge/sse | 对齐，不迁 Dify 绑定 |
| 组织 | O1 组织架构（部门/岗/任岗） | ~1.7k | 无 | 新建 |
| 组织 | O2 岗位 | ~0.7k | 无 | 新建 |
| 组织 | O3 用户（无角色弹窗） | ~1.1k | 无 | 新建 |
| 组织 | O4 人员/部门选择器 | ~3.4k | FieldUserPicker/DeptPicker 预设 | 补标准组件 |
| 组织 | O5 请假（流程样板） | ~1.7k | 无 | 新建，去硬编码 flowid/假额度 |
| 工作流 | W1 流程模型目录 | ~0.4k | 无 | 新建 |
| 工作流 | W2 BPM 流程设计器 | ~5.3k | 无（WorkflowDesigns 为 Agent） | 新建 |
| 工作流 | W3 流程办理/详情 | ~4.6k | 无 | 新建 |
| 工作流 | W4 待办工作台 | ~1.5k | 无 | 新建 |
| 工作流 | W5 追加办理人 | ~0.4k | 无 | 新建 |
| 系统 | S1 登录、S6 会话、S7 全局消息 | ~0.75k | LoginView/session/sse 已有 | 对齐 |
| 系统 | S2 服务端缓存 | ~0.4k | CacheManager 为前端缓存 | 新建同路径页；CacheManager 换路径条目删除 |
| 系统 | S3 数据恢复 | ~0.85k | 无 | 新建（严格回执） |
| 系统 | S4 流程监控 | ~0.4k | 无 | 新建（依赖 W3） |
| 系统 | S5 BUG 管理 | ~0.6k | 无 | 新建 |

（表内合并后计 44 项含不迁/后置；矩阵 96 行逐行映射到上表能力 ID，I1 开工时回填矩阵备注。）

## 3. 公共能力（先于业务页；均放 spark-data / spark-component / spark-lowcode-api）

| ID | 能力 | 依据 | 首个消费者 |
| --- | --- | --- | --- |
| P1 | 结构性保存命令：影响预览 → 应用到原 DataView → saveChanges → 未知结果只回读核验（不重放）；无私有基线 | 设计器 11 个命令 FSM 合一 | D2 改名/删除/来源替换/数组/新增 |
| P2 | 声明式 queryContext 父绑定：pagedata 声明从父视图 currentRow / 调用参数取值 | view-design.ts 794/872/924 代码注入 | D2、B2、O1 |
| P3 | 声明式选项级联：设计态与运行态共用 field-cascade，pagedata 声明 | Vue 内 addCascade 5 处 | D2、A2、W2 |
| P4 | 内置命令资源适配框架（命令即 DataView 资源，回执统一） | 服务器注册、表同步/预览、缓存、恢复、编码、JSON 文件、工作流引擎 | B1、B2、S2、S3、C2、H3、W3 |
| P5 | 文件资源（上传/内容读写）统一适配 | Excel 模板、报表模板、JSON、设计文件 | H1、I2、H3 |
| P6 | 标准组件：业务表/库选择器、人员/部门选择器、过滤表达式编辑器（复用现有）、图编辑窄组件（数据关系/逻辑视图/工作流/BPM 共用宿主） | 多专题重复 | B2、O4、C3、C4、W2 |
| P7 | 预览确认 UI 合同（摘要 + 核验入口，不持草稿） | 设计器各命令预览 | D2 |
| P8 | 硬约束静态检查脚本（状态机字面量、JSON.stringify 基线、static-data 复制正式表、记录数组 props） | 计划硬约束 1 | 全部 |

## 4. 设计器专项（D1/D2）

### 4.1 页签语义归属

| 参考 | 本仓归属 | 持久 |
| --- | --- | --- |
| 1.1 元模型：来源、字段 Name/AsName/IsOutput/ValueFun/Order/Group、数组、批输出、PK | DataTable + columns | DB（saveChanges） |
| 1.2 请求设置：OutputType、Filter、树参、cache、RequestComplete、来源入参值 | 命名 DataView（DataViewDefinition）；来源入参声明仍在字段 ValueFun | pagedata |
| 1.2 中 IsBusinessMain/IsBusiness | 模型属性（DataTable） | DB |
| 2 前端模型：Expression、allowAIAdd | 同一字段列（非第二模型） | DB |
| 3 数据处理 add/update/deleteApi | 模型配置；跨目标执行合同未核，保持只读原值并在 UI 标注 | DB 原值保留 |
| 边面板 depType/联表 | 原生关系 filterExpression（pagedata）；DB Base_DataModel_Relation 保留只读、经适配显示 | 两者分存 |
| 无（本仓增补） | 数据级联 DataViewCascadeDefinition、命名视图多实例 | pagedata |
| 输入参数 | Base_DataSet.inputParams | DB |
| 画布保存 | 布局文件（明确标“保存布局”，不冒充全量） | 文件 |

目标页签：1.1 模型结构 → 1.2 请求方案（选命名视图）→ 2 字段呈现 → 3 数据处理；边面板、输入参数、级联、预览为独立入口。保存按来源分开（DB / pagedata / 布局），每个保存只提交该来源捕获的变更，不承诺跨来源事务。

### 4.2 入口（2026-10-19 可行性核验后修正）

采用列表页内对话框 + 目标 ID prop（与参考语义一致）；删除 `/data-space-design`。

原“URL 入口”不可行：系统页实例 owner 只由导航树节点生成（`packages/spark-app/src/router/dynamic.ts` 455-486 → `system-page-identity-resolver.ts` 148-154 按 path 过滤），设计页蓝图路径在 `vue-pages.json` 为 hidden、远程“元数据管理”导航树无此节点，跳转必报“当前路径没有可用的导航身份”。`/data-space-design` 之所以能开，是它非 hidden 被并入导航树，正是侧栏变成本仓系统页列表的原因。

对话框方案的约束：设计页改为接收唯一目标 ID prop（仍校验非空/非法字符/单一身份），不再读 `route.query`、不 watch `route.fullPath`；`useSystemPageDirtySource` 注入到列表页实例，未保存修改阻止关闭对话框与离开列表；切换目标 = 关闭后重新打开（会话随组件卸载释放）。需在 AGENTS 0.5 补一句：“设计页的唯一目标 ID 由宿主明确传入（列表对话框 prop）；不得同时接收第二个空间身份”。

### 4.3 现有代码处理（43 + 大文件）

- 保留并瘦身：assembler、runtime、metadata、catalog、model-relation-adapter、layout、view/relation/cascade-metadata、view-layout、view-fields、query-preview、field-value、field-output、primary-key、array-configuration、array-draft、model-source-reader、source-catalog、model-dependencies、全部 *-migration、*-references、rename-tools（转为无状态函数或薄适配）。
- 合并进 P1：data-space-definition-save。
- 删除（由 DataView 编辑 + P1 取代）：field-edit、model-edit、source-input-edit、array-edit、model-rename、model-remove、field-remove、model-create、model-source-edit、field-create、input-parameter-edit；view-design.ts 删除私有状态与命令编排，只留薄会话。
- 页面：data-set-design-page 去本地树逻辑与 `:field-ids`；layout-edit 并入布局 DataView；其余 Vue 只做标准组件绑定。
- 目标规模：设计相关 ~16.5k → 5—7k（spark-data 增量 0.4—0.8k）。

## 5. 不迁与边界清单

- 角色：G3、G5，以及 A1 新建应用写 RoleUser、W2 角色候选作授权源、O3 角色弹窗。
- 参考缺陷：硬编码 flowid/formkey、假请假额度、Base_TblRln/Base_DataModel_Relation 直接当本仓关系、字典设计与数据同存、Excel 双路径、UserID≠ROWID 混用、删除只删主表。
- 服务缺口（UI 明确提示，不前端伪造）：字典计算字段 ValueFun 不执行、逻辑来源 rowid 缺失、字典 DISTINCT 与非输出排序冲突。
- 不同概念勿混：本仓 WorkflowDesigns（Agent）≠ 数据工作流 C4 ≠ BPM W2；本仓命名 DataView ≠ 后端逻辑视图 C3。

## 6. 迭代重分（按能力与依赖）

| 迭代 | 能力 | 依赖 |
| --- | --- | --- |
| I1 | P1、P2、P3、P7、P8 | — |
| I2 | D1 空间目录 + D2 入口（URL、删短路径） | P8 |
| I3 | D2 结构/请求方案/字段呈现/数据处理 | P1—P3、P7 |
| I4 | D2 关系/级联/参数/布局/预览；删除旧命令类 | I3 |
| I5 | P4、P6（表/库选择器、图宿主）；B1、B2；删 DBMS 包装 | P4 |
| I6 | C1 复核、H3、C2、C3 | I5 |
| I7 | P5；H1、H2；I2 报表 | P5 |
| I8 | A1、A3、A5；删 AppList 包装 | I2 |
| I9 | A2、A4、G1、G2；I1 复核、I3 | I8 |
| I10 | P6 人员/部门选择器；O1、O2、O3 | — |
| I11 | W1—W5、C4（共用图宿主与 P4 工作流引擎适配）；O5 样板 | I10 |
| I12 | S1/S6/S7 对齐、S2、S3、S4、S5；删 CacheManager 换路径 | I11（S4） |
| I13 | G6 判定、1010 独有文件判定、全量回归/构建/实页走查、收档 | 全部 |

## 7. 可行性逐项核验（2026-10-19，语义与逻辑，依据源码）

| 项 | 结论 | 依据 | 方案调整 |
| --- | --- | --- | --- |
| 设计器入口 URL | 不可行 | 见 §4.2 | 改对话框 + prop；AGENTS 0.5 补述 |
| P1 结构性保存 | 可行，且比原估计小 | `DataSet.saveChanges`（`packages/spark-data/src/dataset.ts` 1446-1546）已支持一次提交 DB 与文件资源视图、逐视图回执、`hasUnconfirmedSave` 只恢复未确认视图（1448-1450）、原捕获交原执行器核验（`data-view.ts` 2682-2758），并明确不提供事务（1563） | P1 只做：领域计划 → 应用到原视图 → saveChanges；必须支持按来源分阶段（DB 确认后再写文件引用，如改名、删除），即两次 saveChanges 的有序编排，不合成一次 |
| P2 声明式 queryContext | 部分可行，需扩展 | `query-cascade-inputs.ts`：`filterBindings` 可把父字段映射为子过滤（eq/in/contains）；`inputBindings` 的 queryContext 目标只能整对象替换且源值须为 JSON 对象（25、135-136） | 新增按键合成目标（如 `queryContext.modelId` 取父 currentRow 字段，`dataSpaceId` 取调用参数）；能用 filterBindings 表达的改用过滤，不扩 queryContext |
| P3 声明式选项级联 | 可行 | viewCascades 已有字段级联定义与校验（`scenario-view-config.ts` 148-155）；C 已声明 modelFieldOptions 等选项视图 | 把 Vue 内 5 处 addCascade 改为 C 的 viewCascades；前提是选项来自 C 已声明的正式视图，而非页面临时表 |
| P4 内置命令适配 | 可行但无现成模式 | `spark-lowcode-api` 无 builtin 适配（检索 0 命中） | 新建；每个命令开工前先核实际服务端点（服务器注册、表同步、缓存、恢复、编码、文件、工作流引擎），未证实的列服务缺口，不猜协议 |
| P5—P8 | 可行 | P8 为纯静态检查；P6 复用现有 Field*/过滤编辑器 | 无 |
| 删除 11 个命令类 | 逻辑可行 | 命令中的真实领域语义（引用扫描、PK 耦合、级联删除计划、来源差异）已在 *-references、primary-key、model-dependencies、source-reader 等可保留文件 | 删除的是状态机与私有副本；领域规则改为无状态计划函数，输出对原视图的变更 |
| 页签归属（§4.1） | 语义成立 | AGENTS 0.5 元模型/前端模型合并为一个 DataTable、请求设置归 DataView；Expression/allowAIAdd 为 Base_DataModel_Field 列 | 无 |
| A2 导航“两套真源” | 原判断有误 | `ProjectBlueprintApi`（`project-blueprint-api.ts` 71-91）本身就读 `Base_NavigationInfo`，两者是同一来源 | 不存在二选一；A2 直接维护 `Base_NavigationInfo`。另发现该 API 自带 updateNodeFields + GetData 读回，是 DataView 之外的保存路径，A2 中收敛到 DataView |
| D1 列表删除 | 待核语义 | 删除空间会遗留模型/字段/关系/pagedata（AGENTS 0.2 删除完整性） | I2 先核参考 deleteDataSet 与服务端级联行为，再定删除范围与确认提示 |
| W1—W5 工作流 | 高风险 | 本仓无 BPM 运行时；`workflow.runtime` 端点仅见参考前端 | I11 开工前先做服务端点实测；不成立则该组只登记缺口 |
| 角色不迁 | 成立 | AGENTS 0.3 | 无 |

总体：除入口与 A2 判断需按上表修正、P2/P4 规模上调外，方案语义与逻辑成立。

**I2 实施中更正（2026-10-19）**：上表 P1 “未确认结果交原执行器核验”只对实现了 `hasUnconfirmedSave` 的执行器成立。全仓仅文件资源执行器实现（`packages/spark-project-model/src/scenario/scenario-definition-resource.ts` 60、146）；数据库记录执行器 `DataSpaceRuntimeApi` 未实现，写入后网络中断时 spark-data 不知道结果可能已生效。这正是旧命令类各自自建 unknown/readback 状态机的原因。新增 P1b：在 `DataSpaceRuntimeApi` 的保存执行器实现未确认标记与按主键回读核验（新增按 rowid 存在、修改按字段比对、删除按不存在），由 DataSet.saveChanges 的既有恢复路径统一消费；页面与命令不再自建。P1b 完成前，任何改为“读取 DataView 状态”的数据库保存页面都有重复提交风险。

## 8. 待用户审批的决定

1. 设计器入口采用列表对话框 + 目标 ID prop（§4.2），并在 AGENTS 0.5 补述目标 ID 由宿主传入。
2. 数据处理 add/update/deleteApi：保持只读原值并标注，不在本轮恢复执行。
3. A2 直接维护 `Base_NavigationInfo`（与 ProjectBlueprint 同源），收敛其 API 自带的保存读回路径到 DataView。
4. 迭代分组按 §6；I5/I11 开工前先做服务端点实测。
