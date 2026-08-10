# spark-data 对接 lowcode 数据空间研读

## 研读状态

- 阶段：阶段 1 已确认
- 范围：AppWorks 前端 API、`spark-data`、`spark-lowcode-api`、项目蓝图、页面运行时与开发系统
- 外部后端：`E:\lowcode-jdk17` 永久只读，仅用于接口和行为考古
- 执行边界：本研读未修改后端、未调用任何 live mutation、未重建现有数据空间或前端模型身份

## 用户确认的核心语义

1. 数据空间对应 `DataSet`，这一层与当前 `spark-data` 结构接近，不应推翻重造。
2. `DataTable` 对应数据资源，而不是前端模型。
3. `DataView` 对应数据资源的一个前端消费视图；数据空间中的前端模型应落到 `DataView`，稳定 `modelId` 应作为视图身份。
4. 一个数据资源可以被多个前端模型引用，因此正确基数是一个 `DataTable` 下存在多个 `DataView`。
5. 页面只能消费数据空间，没有第二套页面本地数据定义。页面通过 `FormKey + dataSpaceId + modelId` 定位具体运行视图。
6. 物理数据资源、数据空间、前端模型和页面运行闭包是不同身份层。不得用物理表名、显示名称或相同字符串推断另一层身份。
7. 项目蓝图不是运行菜单。运行导航只是蓝图的一种授权后输出；数据空间绑定是页面节点运行闭包的一部分。

## 现有 spark-data 结构

### DataSet

`packages/spark-data/src/dataset.ts` 已具备：

- `tables` 容器；
- `resourceRelations` 表级关系；
- `viewCascades` 视图级联动；
- 数据加载、自动选择、跨视图事件及按关系顺序保存；
- `DataSet -> DataTable -> DataView` 的既有层次。

结论：`DataSet` 可以作为数据空间的前端运行实例，主要需要补充稳定数据空间身份和装配入口，无需重写其主体。

### DataTable

`packages/spark-data/src/data-table.ts` 当前负责：

- 字段结构 `columns`；
- `resourceType/resourceId/businessCategory`；
- 多个 `DataView`；
- 表级 `CrudApi`、`CrudService` 和校验器。

这已经接近“数据资源”的职责。但当前远程 API 由所有视图共享，而 lowcode 查询需要携带具体 `FormKey`、`modelId`、字段投影和模型过滤，因此表级 API 不能继续作为模型视图的唯一运行入口。

### DataView

`packages/spark-data/src/data-view.ts` 当前负责：

- 行、筛选、排序、分页、树形态、聚合、选择与编辑状态；
- `tableName + viewId` 运行身份；
- 视图请求编排和依赖过滤；
- `permissionSnapshot`，以及原子登记数据、原始行、总数和后端权限。

这与前端模型的运行职责吻合。当前缺口是：

- 没有模型字段投影、资源字段到视图字段的别名映射；
- 没有模型级输出、输入和查询配置；
- 远程请求仍委托给 `DataTable.crudService`；
- 不能让同一资源的多个模型视图拥有不同的 FormKey、查询和权限上下文。

## 现有 lowcode 前端 API

### 数据空间设计读取

`packages/spark-lowcode-api/src/platform/data-space/design/data-space-design-api.ts` 当前按已知 `dataSpaceId` 读取：

- `Base_DataSet`；
- `Base_DataModel`；
- `Base_DataModel_Field`；
- `Base_DataModel_Relation`。

现有合同把资源引用嵌入每个前端模型，并只保留字段 ID、资源字段名和别名。后端已存在但当前合同丢失的信息包括 `FieldType`、`IsOutput`、`Order/OrderType`、`Value/ValueFun`、`Expression` 等；这些信息不足以编译完整 DataView。

`DataSpaceResourceReference` 对数据库资源主要保存 `DbId/DbName/MetaName`，尚未证明一个可跨读取稳定复用的数据资源 ID。缺失时必须保持未解析并阻断装配，不能用表名生成身份。

### 数据空间运行查询

`packages/spark-lowcode-api/src/platform/data-space/runtime/data-space-runtime-api.ts` 当前可用 `FormKey + DataSpaceFrontendModel` 查询一个模型，并读取：

- 行数据；
- `allowAdd`；
- 行级 `lingma_sys_params`；
- `lingma_sys_key`；
- 总数和原始行。

`src/lowcode/lowcode-data-space-runtime.ts` 会把这一快照写入一个已存在的 `DataTable/DataView`，但目前没有调用者，且只处理单个模型，不能构建完整 DataSet 图。

### mutation

现有 design/runtime mutation 只生成包含 preimage、idempotency、journal、readback、compensation 声明的命令，并没有执行器。

lowcode 后端 `/api/DataOperation/BatchTableOperateRequestByCRUD` 对普通业务表使用事务，但平台系统表在该事务提交后再分别调用专用 service；源码未提供可由前端证明的统一幂等、写前镜像、journal、readback 和补偿闭环。因此：

- 运行业务数据写入可在完成 characterization 后单独设计；
- 蓝图和数据空间设计 mutation 不能仅凭现有批量 CRUD 宣称满足治理要求；
- 前端不得伪造后端缺失的原子性或幂等保证。

## 后端模型与 spark-data 的映射

| lowcode 后端事实 | AppWorks 运行语义 |
| --- | --- |
| `Base_DataSet.rowid` | `DataSet` 的 `dataSpaceId` |
| 被模型引用的数据资源 | 一个 `DataTable` |
| `Base_DataModel.rowid` | 对应资源下一个 `DataView.viewId` |
| `Base_DataModel_Field` | DataView 的字段投影、别名、类型、输出和排序定义 |
| 资源字段关系 | `resourceRelations` |
| `childModId/parentModId/depType` 模型联动 | `viewCascades` |
| `FormKey + dataSpaceId + modelId` | 页面到目标 DataView 的完整运行定位 |

`Base_DataModel_Relation` 同时包含资源名和模型 ID，不能整体粗暴映射到单一关系层。适配器必须分别提取经证据证明的资源关系与模型视图依赖。

## 页面与蓝图调用链

目标调用链应为：

1. 项目蓝图读取真实层次和页面交付信息；
2. 页面节点取得经 readback 验证的 `FormKey/dataSpaceId/modelId/componentKey/routePath` 闭包；
3. 数据空间 API 读取完整 DataSet、资源、前端模型、字段和关系合同；
4. AppWorks 适配层将数据空间装配为 `DataSet`；
5. 每个资源建立一个 `DataTable`；
6. 每个前端模型在对应 DataTable 下建立一个 `DataView`；
7. 页面以 modelId 定位 DataView，由视图级运行端口查询数据与后端权限；
8. 组件继续通过 `DataViewKey` 消费 DataView，不读取 lowcode wire payload。

当前蓝图类型已经含 `formKey/dataSpaceId/modelId`，但编辑 patch、部分转换和运行导航投影没有完整保留闭包；这些丢失点必须在实施方案中逐一封闭。

## pagedata.json 影响面

`pagedata.json` 不是孤立文件，而是当前本地 DataSet 真源，传播到：

- `spark-project-model` 的页面文件类型、`PageDataSetFile`、`ConfigPageNode` 和 `ProjectModel.editDataSet`；
- 开发系统页签、DataSet 设计器、撤销重做和保存；
- `SparkPageRenderer` 的 DataSet 初始化与预览；
- 页面缓存；
- AI page design/pageDataDesign prompt、工具和 selective save；
- 大量测试、生成的 ClassModel 和文档验证。

因此不能把页签改名后继续保留旧真源，也不能建立兼容薄壳。实施必须按最小闭环逐层用数据空间能力替换，并保持所有现有前端业务功能可用。

## 权限边界

后端运行响应是权限唯一决策出口：

- `allowAdd` 属于资源/视图查询结果；
- 行级删除使用 `lingma_sys_params.d`；
- `r/e/h/m/d` 是五个稀疏集合，不是互斥枚举；
- 字段读与写独立；
- 批量操作按全部选中最小单元取交集，再与业务可用性相交；
- 前端只渲染和构造受约束 mutation，不重算岗位、角色、机构或用户授权。

权限快照已经位于 `DataView`，这进一步证明前端模型应对应 DataView，而不是 DataTable。

## 推荐的分层落位

1. `spark-lowcode-api`：拥有 lowcode wire、完整数据空间设计/运行合同和行为 characterization，不依赖 `spark-data`。
2. `spark-data`：保持后端无关；补充 DataView 字段投影及视图级运行端口等通用能力，不出现 lowcode 表名、FormKey 请求头或 wire 类型。
3. `src/lowcode`：拥有数据空间到 `DataSet/DataTable/DataView` 的装配器、页面运行闭包解析器和 lowcode 运行端口实现。
4. `spark-project-model`：移除页面本地 DataSet 真源，页面模型只保留页面交付文件和已验证数据空间绑定。
5. `spark-component`：渲染器接受装配完成的 DataSet；组件继续消费 DataView 与后端权限快照。
6. 开发系统：把 `pagedata.json` 工作面替换成数据空间/前端模型视图工作面；蓝图工作面继续负责项目蓝图，不把蓝图降格成运行菜单。

## 影响范围与风险

- 这是跨 `spark-lowcode-api`、`spark-data`、`spark-project-model`、`spark-component`、应用运行时、开发系统和 AI 页面设计链的复杂重构。
- 现有工作树包含大量用户改动，后续方案必须精确列出文件并按最小闭环实施，禁止覆盖或混入无关内容。
- 最大风险不是 DataSet 本身，而是身份闭包丢失、DataView 模型投影不足、表级 API 与视图级权限冲突，以及删除 pagedata 真源后的 AI/预览/缓存传播。
- 不采用大爆炸切换；但每个完成闭环内部不保留双真源或薄壳转发。

## 复杂度分级

复杂。依据：跨多个公共包和运行链、涉及公共合同与破坏性语义替换、影响文件远超三个，并包含权限、身份、运行查询、mutation 治理和浏览器验收。进入方案前需要完成 8 至 10 个真实决策问题的一问一答确认。

## 已确认实施决策

1. 数据资源只接受后端返回的稳定 `resourceId`；缺失时阻断装配，不从表名、库名或组合字段生成身份。
2. `DataTable.columns` 保存资源字段；`DataView` 正式承载前端模型字段投影、别名、输出和排序配置。
3. 运行调用入口是 `DataView`；共享能力由 `DataTable.crudService` 定义，DataView 通过查询参数提交 FormKey、dataSpaceId、modelId、投影、筛选、分页和排序上下文。
4. `Base_DataModel_Relation` 的资源证据和模型证据分别生成 `resourceRelations` 与 `viewCascades`，两层独立验证。
5. 新数据空间读取、装配、渲染和开发工作面闭环验证通过后，删除对应 `pagedata.json` 真源及旧实现，不保留双真源或兼容壳。
6. 首个实施计划只做读取闭环；所有业务数据、蓝图和数据空间 mutation 均排除在外。
7. 开发系统展示完整 `DataSet -> DataTable -> DataView` 层次，并突出当前蓝图页面绑定的 modelId。
8. 验收包含包级合同测试、当前项目真实只读集成，以及全部具有完整绑定的 Vue 页面逐导航、逐主页面、逐只读按钮黑盒测试。
9. AI 数据设计改为读取真实数据空间、诊断并生成结构化 dry-run 建议；首阶段不写本地文件，也不调用后端 mutation。

## DataView 身份与两层关系补充研读

### DataView 已有稳定 ID

`DataView` 已有实例属性 `viewId`，构造函数接受明确的 `viewId`；`DataTable.views` 以该值为键，`DataViewKey` 使用 `tableName@viewId` 定位视图，查询参数、保存目标、事件和关系索引也都携带该值。因此不应新增 `modelId` 平行身份字段：lowcode `Base_DataModel.rowid` 直接映射为 `DataView.viewId`。

`DataTable` 构造时创建的 `default` 是 spark-data 的通用默认视图，不是 lowcode 前端模型。lowcode 装配器只把真实 `modelId` 建为命名 DataView，页面和 lowcode 关系不得绑定空的 `default`；`default` 可作为框架内部通用视图保留，但不能复制任意主模型形成双身份。

### 当前丢失点

1. 内部 `DataRelation`、关系索引、`CascadeDelegate` 和 `DataView.requestData()` 已支持 `parentViewId/childViewId`。
2. 公共 `ViewDependency` 却只有 `parentTable/childTable`，没有父子视图 ID。
3. `expandRelations()` 把所有依赖硬编码为 `default -> default`，导致后端 modelId 在展开时丢失。
4. 依赖新增、更新、删除和 `DataSetCrudTool` 只按父子表定位；同一资源对上的多个模型依赖会被误判重复或命中第一条。
5. `Base_DataModel_Relation` 已有稳定 `relationId`，但 `expandRelations()` 当前仅按父子表匹配 `TableRelation`；同一资源对存在多条字段关系时，后写关系覆盖前一条。
6. `DataView.requestData()` 会启动空闲父视图请求，但没有等待父请求完成就立即计算子过滤条件；真实异步请求可能读取空行或旧行，现有同步 mock 测试掩盖了该问题。

### 修正后的两层合同

- `TableRelation` 继续只描述资源级关系，并可携带后端稳定 `relationId`；父表/子表分别使用父资源 ID/子资源 ID，字段使用真实资源字段名。
- `ViewDependency` 描述模型级联动，携带 `parentViewId/childViewId`，并以 `tableRelationId` 精确引用资源关系。
- 对 lowcode 关系的方向映射固定为：`parentModId -> parentViewId`、`childModId -> childViewId`、父模型资源 -> parentTable、子模型资源 -> childTable。
- 对未提供视图 ID 的通用 spark-data 配置，`default` 仍是一个真实可定位的视图；lowcode 装配路径必须始终显式提供 modelId，不使用该省略形式。
- 对未提供 `tableRelationId` 的通用配置，仅当父子表之间恰好存在一条资源关系时允许解析；存在多条时必须 fail-fast，禁止按数组顺序选择。
- 显式 `viewCascades` 必须被视为完整列表，不再为未覆盖的 `resourceRelations` 自动补造默认视图依赖；资源关系本身不等于界面联动。
- 依赖唯一键和 CRUD 选择器必须覆盖资源、视图和所引用资源关系，支持同一资源对上的多个模型视图及多个字段关系。
- 关系装配完成后必须验证父子 DataTable、父子 DataView 和被引用 TableRelation 全部存在；任一身份缺失立即阻断。
- 子视图首次请求必须等待所有空闲父视图完成，再生成关系过滤；父加载失败或无满足依赖的数据时显式失败，不使用陈旧状态。

### 级联筛选字段

资源关系字段使用后端物理资源字段名，而 DataView 字段投影可通过 alias 改变输出字段名。lowcode 运行适配器必须把 spark-data 的规范化筛选树转换为 `/DataOperation/GetData` 所需的 `Type/Filters/Field/Operator/ValueFun` wire 结构；`Field` 使用资源字段名，不能把显示别名直接发送给后端。该转换属于 `spark-lowcode-api`/AppWorks lowcode 适配边界，不进入后端无关的 spark-data。

## 两类关系必须独立持久化（用户修正）

前述“从 `Base_DataModel_Relation` 分别提取 `resourceRelations/viewCascades`”的建议被本节取代。

### 后端旧关系的真实含义

只读 Java 源码证明 `BaseDataModelRelation` 在一个对象中同时保存：

- `parentTable/childTable`；
- `parentModId/childModId`；
- `filter`；
- `depType`；
- `cascadeDel`。

同一个表还被后端权限模型树、导出模型树和工作流连接条件复用。它是后端历史形成的“模型组合关系”，不是独立的数据资源关系，也不是独立的 UI 输入级联合同。继续把它一拆为二会把后端偶然字段结构冒充 SPARK 领域事实。

### AppWorks 自身也存在残余混合

当前 spark-data 虽然公开了 `TableRelation` 和 `ViewDependency`，但随后又由 `expandRelations()` 合并成内部 `DataRelation`：

- 计算列和保存排序消费表级 `TableRelation`；
- DataView 请求和 `CascadeDelegate` 消费合并后的 `DataRelation`；
- ViewDependency 本身没有独立输入绑定，只能借用 TableRelation 的 parentField/childField。

这会强迫每个 UI 级联都依附一个资源外键关系，无法表达“父视图字段传给子模型输入参数”或“不对应物理外键的筛选联动”。因此 AppWorks 原型也要完成最后一步分离，不能只给旧 `DataRelation` 补 ID。

### 新的持久 SSOT

在平台数据库中新增两类 SPARK 配置资源，由通用模型 API 管理；不修改 lowcode-jdk17 代码：

1. `SPARK_DataResourceRelation`：数据资源之间的结构关系。
2. `SPARK_UiInputCascade`：DataView/UI 输入之间的运行联动。

两张表都必须包含 `rowid`、`sysid`、`dataSpaceId`、启用状态、排序号、版本和描述；租户继续由现有数据库路由隔离，`sysid` 表示项目作用域。字段类型只使用字符串、整数、布尔和受控 JSON 文本，保持 MSSQL、MySQL、达梦可移植。

建议的资源关系核心字段：

- `relationKey`：稳定业务键；
- `parentResourceId/childResourceId`：稳定资源身份；
- `fieldBindingsJson`：父资源字段到子资源字段的一个或多个映射；
- `cascadeUpdate/cascadeDelete`：资源生命周期语义，默认 false。

建议的 UI 输入级联核心字段：

- `cascadeKey`：稳定业务键；
- `sourceModelId/targetModelId`：DataView 的稳定 modelId；
- `triggerType`：currentRow、selectedRows、allRows、pagedRows 等父视图触发源；
- `inputBindingsJson`：源字段到目标 filterField 或 inputParameter 的映射、操作符和空值策略；
- `autoLoad`：输入变化后是否自动重新查询目标 DataView。

UI 输入级联不引用或复制资源关系。两者字段恰好相同时也保持两个独立配置事实，以免资源结构调整意外改变 UI 行为。

### 运行链

1. 两张 SPARK 配置表作为平台数据库持久 SSOT，通过一次性种子建立对应的系统前端模型。
2. AppWorks 使用现有 `/DataOperation/GetData` 模型查询能力读取这两个配置模型，不增加专用后端 Controller/Service。
3. 数据空间业务模型仍按现有模型表和 FormKey 查询；后端旧 `Base_DataModel_Relation` 只保留为后端自身模型组合证据。
4. 前端适配器把 `SPARK_DataResourceRelation` 装配成 spark-data 资源关系。
5. 前端适配器把 `SPARK_UiInputCascade` 装配成独立 DataView 级联；级联触发时生成目标模型 filter 或 inputParams，再调用原模型运行 API。
6. 后端继续负责最终数据权限；前端关系适配不能扩大可见数据或自行重算授权。

本研读仅确定合同与落位。建表、注册资源、创建系统模型和写入种子数据都属于后续独立受治理 mutation，不在当前只读阶段执行。

## 方案 2：纯前端反腐适配（最终方向）

上一节提出的两张 SPARK 配置表方案被用户否决。最终边界是：

- 不新增数据库表；
- 不增加数据库字段；
- 不修改 lowcode-jdk17；
- 不改变后端现有模型关系结构和运行方式；
- AppWorks 前端 API 负责把一条混合旧关系投影成两个互不混用的前端领域对象。

### 原始关系只是一份后端记录

`Base_DataModel_Relation` 在前端 API 中保留为 `LowcodeModelRelationRecord` 一类的原始合同，字段包括 rowid、dataSetId、parentModId、childModId、parentTable、childTable、filter、depType 和 cascadeDel。该对象不进入 spark-data，也不直接暴露给页面组件。

适配器对每条原始记录执行一次严格解析：

1. 通过 parentModId/childModId 找到两个真实前端模型。
2. 通过模型已解析的 resourceId 找到两个 DataTable；原始 parentTable/childTable 只做名称 readback 交叉校验，不作为身份。
3. 从 filter 的 `GetTableField` 条件提取父资源字段到子资源字段的映射。
4. 生成独立 `DataResourceRelation`，只供资源结构、聚合和保存顺序使用。
5. 生成独立 `DataViewCascade`，只供 DataView 触发和目标过滤输入使用。
6. 两个投影都保留同一 `sourceRelationId` 作为追踪证据，但运行时不互相引用，也不再合并成 `DataRelation`。

### 能力边界

现有旧关系能够证明的 UI 级联只有：父 DataView 的 currentRow/selectedRows/allRows/pagedRows 等状态，通过已解析字段映射生成子 DataView 的 filterField 条件。

现有结构没有独立 target input parameter 名称和绑定类型，因此不能可靠生成 `inputParameter` 级联。遇到无法解析的 filter、模型缺失、资源名称 readback 不一致、字段不存在或未知 depType 时，适配器必须返回诊断并阻断该关系，不能猜测或退回 default 视图。

### 运行与设计边界

- 运行时：spark-data 只消费适配完成的 `DataResourceRelation[]` 和 `DataViewCascade[]`；业务数据继续调用现有模型 `/DataOperation/GetData`。
- 设计时：开发系统可以分两个视图展示资源关系与 UI 级联，但必须标注它们来自同一条后端关系记录。
- mutation：当前计划不实现。以后若允许编辑，必须读取整条旧关系 preimage，把两侧修改重新合成为同一条后端记录，执行一次受治理写入和 readback；不能宣称后端存在两个独立 mutation。
- 权限：关系过滤只是请求约束，不能扩大后端返回的数据或权限；最终权限仍完全来自后端运行响应。

### 模型也必须经过反腐适配

用户进一步确认模型和关系采用相同边界原则。AppWorks 不允许 DataSet 装配器直接读取 lowcode 原始模型并顺手创建 DataTable/DataView，否则 wire 字段解释、资源去重、模型身份和关系解析会再次混在一个类里。

最终前端适配层分为三步：

1. `LowcodeFrontendModelAdapter`：`Lowcode model -> ResourceDescriptor + DataViewDescriptor + diagnostics`。它独占 resourceId/modelId、资源字段、模型字段投影、别名、查询配置和输入参数的解释权。
2. `LowcodeModelRelationAdapter`：只消费已经验证的模型/资源索引和原始关系，输出两套关系投影。
3. `LowcodeDataSpaceAssembler`：只组合两个适配结果并实例化 DataSet，不包含 lowcode wire 分支。

相同 resourceId 的多个模型必须合并到一个 DataTable，并各自形成以 modelId 为 viewId 的 DataView；资源字段 readback 冲突、重复 modelId 或模型引用未解析资源时由模型适配器 fail-fast，不能留给装配器兜底。
