# 页面设计

> 本文件是 AI 编码知识，不替代源码合同。工具三文件使用PageTool；数据空间定义与运行数据使用DataSet/DataView，场景文件owner只在资源适配内部保存。当前事实与差距以[数据链路合同](../docs/architecture/DATAFLOW_ARCHITECTURE.md)为准。

### 工具三文件与场景配置分别编辑

- **场景**：AI 修改规则、脚本、样式或场景视图。
- **规则**：工具文件仅rule.json、script.js、style.css，使用本次请求的PageTool编辑。数据空间定义必须明确目标scenarioId，通过正式元数据DataView编辑、取消，由DataSet提交；ScenarioViewConfig负责配置校验。现行AI pageDesign仍直接编辑ScenarioViewFile，这是待迁移差距，不作为新代码模板；不能把场景配置塞回工具文件或修改正式物理模型定义。
- **违反后果**：混用工具和场景身份会覆盖共享场景或回生第二套数据定义。
- **发现来源**：原页面内存编辑记录；2026-10 按当前 PageTool/ScenarioViewFile 合同替换旧入口。

### 数据保存统一入口，回执才是持久化事实

- **场景**：编辑后需要确认文件已经保存。
- **规则**：数据空间定义通过DataSet/DataView保存；数据库和文件分别由资源适配确认真实回执。ProjectWorkspace/ScenarioViewFile只在场景文件适配内部承担原文、冲突检查和字节回读。工具三文件由PageTool管理。只有实际确认回执可以说明持久化成功；部分成功保留分项已写/已确认事实，不宣称整批回滚，也不清掉等待期间的新编辑。
- **违反后果**：把内存修改或上传候选当保存结果，会在刷新后丢失改动或错误报告交付。

### 清空 DataView 时同步清除 total

- **场景**：取消查询结果、重置视图或清空候选列表。
- **规则**：`DataView.clearAll()` 必须同时清零 `rows` 和 `total`；即使 rows 已为空，只要仍有非零 total，也应视为存在可清理状态并发出 `cleared`。启用 `DataViewMetaBar` 的空视图显示“总数 0”。
- **违反后果**：界面虽无行却残留旧总数，订阅者也可能因未发出清空事件而继续呈现过期状态。
- **发现来源**：2026-10-26 B1 AI 候选空态续接。

### requestId 隔离每次 AI 运行

- **场景**：同一工具同时有两个编辑器或两次 AI 请求。
- **规则**：pageDesign 的 Host、工作区上下文、getter、gate、交付回执和清理都以 requestId 定位，pageId/scenarioId 只表示本次目标。Host.ensure 保留首次工厂，因此每次运行使用独立 Host；不能用全局 pageId→workspace Map、动态 alias 或队列替代请求隔离。修改当前请求持有的编辑器，不假设所有同page编辑器都是同一Vue对象。
- **违反后果**：A 请求可能消费 B 编辑器，释放 A 时又删除 B 的上下文。
- **发现来源**：同page A/B 并发与释放回归。

### 组件树与蓝图树是不同合同

- **场景**：添加、移动或删除页面组件。
- **规则**：PageTool.editNodeTree 提供 SparkNodeTree，调用其命名参数的 addNode、removeNode、moveNode、setProps 等方法。组件树当前真源是单根 spark-page 及嵌套 children，写入由不可变重写和历史栈维护；不能套用蓝图 nodeId/parentNodeId 的记录结构。rule.json 可为单组件、组件数组或 spark-page，解析后统一为单根。
- **违反后果**：把蓝图平铺协议强加给组件树，会破坏组件子树与撤销重做。
- **发现来源**：原树编辑记录；2026-10 按 SparkNodeTree.fromRuleJson/公开写方法纠正。

### 运行调用不复用编辑数据

- **场景**：同一工具在不同场景或两个标签中运行。
- **规则**：PageRuntime 持有唯一 instanceId、明确 scenarioIds 和可选 mainScenarioId，独立装配每次调用的 DataSet。工具只提供三文件定义，不持有运行数据；关闭仅 dispose 本实例。SparkPageRenderer 消费 pageRuntime 与调用路由快照，脚本、样式与 Render 组件保持实例范围。
- **违反后果**：复用运行 DataSet 或按工具ID释放，会使两个调用串状态或互相销毁。

### 场景、稳定表名与正式模型分别定位

- **场景**：编辑多视图配置、关系或组件绑定。
- **规则**：后端正式模型提供字段和查询身份；动态单场景 SysForm/<scenarioId>/pagedata.json以及AppWorks四个仓内登记场景都通过modelBinding引用正式模型并配置稳定tableName、多DataView和viewCascades。页面完整绑定为scenarioId@modelName@viewId：正式模型名称取modelBinding.modelName，本地模型取自身tableName，重名拒绝；局部modelName@viewId只由明确mainScenarioId补全，不自动选第一个场景。仓内系统程序配置来源由`config/applications/appworks.json`声明；业务模型、应用/租户身份仍来自正式数据和请求scope，不进入业务JSON。
- **违反后果**：强制表名等于模型ID、推断场景或在配置重定义字段，会导致双真源及跨场景串用。
- **发现来源**：DataSet 整合 SPARK 数据空间语义审核及当前运行装配合同。

### 版本快照不等于发布指针

- **场景**：创建、列举或恢复文件快照。
- **规则**：裸文件保存工作内容；历史来自后端真实 N__filename 和 lastModified，summary 为 version/fileName/lastModified|null。候选编号仅用于快照创建，上传禁止覆盖且核对最终filePath和字节回读后才可更新发布引用。正式发布读取 source.VersionId 的 rule/script/style 分段；恢复写回工作文件不切发布指针。
- **违反后果**：用最大版本推断current、伪造时间或恢复时切指针，会改变已发布行为。

### 树子新增不能复用表级凭据

- **场景**：模型正式定义包含自引用ParentField，新增记录的父身份不是TopValue或空根。
- **规则**：私有查询上下文从正式Name映射父字段，要求原查询唯一父行、明确c=true和原父行token；未回执或回执未提供c/token的新父行须重新查询。不得从树组件配置猜父身份，或回退表token走旧页面兼容分支。后端仍负责验签及强校验。
- **违反后果**：呈现有c按钮却出站表token，子行保存不符合正式父凭据合同；用公开行重建授权会丢失真实签名基线。
- **发现来源**：2026-10-07对照DataPermissionAspect、DataSpaceQueryContext及17项真实runtime owner回归。

### 结构删除暂存后仍须核对正式引用

> 以下三条已于2026-11-05由用户再次确认全部沉淀；维护既有条目，不另建重复规则。

- **场景**：用户预览并暂存节点删除，另一客户端随后新增共享模型消费者、连线、字段引用，或改变删除权限、布局。
- **规则**：结构删除命令在实际派发前，通过原 SPARK data 查询链重读本命令已捕获的依赖和当前权限，并与暂存前正式快照比对；变化时拒绝旧范围，保留可取消的原暂存。私有查询必须释放，不刷新覆盖页面草稿，不把此检查扩大成普通保存的全量依赖扫描。跨请求重读不能替代服务端条件写或事务。
- **违反后果**：仅检查本地暂存或在删除后回读，可能已删除新消费者仍使用的模型；事后报错不能恢复完整性。
- **发现来源**：2026-11-04用户确认沉淀；`src/lowcode/resources/structured-config/workflow-definition/node-removal.ts`、`tests/runtime/page/structured-config/workflow/workflow-node-removal.test.ts`及同日 concurrency-runtime 实服证据。

### 执行校验保持首轮合同，不能随页面刷新重置

- **场景**：操作输入使用祖先输出；校验等待模型、字段或物理来源期间，正式节点、连线、共享消费者发生变化，页面也可能同步刷新。
- **规则**：显式操作校验先捕获本次流程定义、节点、连线的不可变投影和查询合同，后续正式重读前后及末轮均比较同一捕获，同时维持目标身份与草稿守卫。只比较“当前页面等于当前服务”不够；两端同步变化也必须使本次校验失效。快照是命令校验依据，不是第二份可编辑真源；最终查询之后的服务竞态仍需后端能力约束。
- **违反后果**：值函数已按旧祖先校验，末轮却接受新图，可能按已经失效的祖先输入执行编辑或删除。
- **发现来源**：2026-11-04用户确认沉淀；`execution-context.ts` 的首轮合同及 `workflow-query-model-create.test.ts` 的六种正式变化反例，尤其读取物理来源期间删除连线并等待页面刷新的一例。

### 合并输入顶层身份与字段身份分别解释

- **场景**：删除节点时检查保留的 merge 节点 `input_mapping`，其中顶层表项和嵌套 `Fields` 都含 `rowid`。
- **规则**：先核实际映射结构：顶层表项 `rowid` 是节点引用，须核目标被删或删除后失去祖先的情况；`Fields[].rowid` 是字段身份，不按节点引用处理。按完整身份精确比较，不能截断后缀、猜测重挂或递归把所有同名属性解释为同一种引用。
- **违反后果**：漏检顶层引用会保留失效合并输入；误认字段身份则会阻止合法删除。
- **发现来源**：2026-11-04用户确认沉淀；`node-removal.ts` 引用检查及删除/失去祖先拒绝、字段同名允许的配套回归。

### 多领域命令绑定必须合并内层映射

- **场景**：同一 `PageRuntime` 场景由多个领域工厂提供 `commandBindings`。
- **规则**：先收集各工厂返回的 `commandBindings`，再合并映射后交给场景 assembler；不能仅对工厂返回对象做连续展开，因为同名顶层属性会被后一个工厂整个覆盖。
- **违反后果**：场景虽声明多个命令表，assembler 只收到最后一个工厂的 binding，装配在缺少命令 owner 处失败。
- **发现来源**：2026-11-10 工作流首发接线发现 `assembleLowcodeRuntimeScenario` 的多个领域 command factory 覆盖问题；由正式场景双命令装配回归验证。
