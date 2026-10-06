# 页面设计

> 本文件是 AI 编码知识，不替代源码合同。2026-10 场景整合已更新下列旧四文件及继承入口规则；历史发现来源保留，当前入口以 PageTool、ProjectWorkspace、ScenarioViewFile、PageRuntime 为准。

### 工具三文件与场景配置分别编辑

- **场景**：AI 修改规则、脚本、样式或场景视图。
- **规则**：pageDesign 的 this 是本次请求的 ProjectWorkspace；`this.project.openPageDesign(pageId)` 返回 PageTool。工具文件仅 rule.json、script.js、style.css，通过 `setFileText` 或 `editNodeTree` 编辑。场景配置通过显式 `loadScenarioViews({scenarioId})` 返回 ScenarioViewFile，再用 `setText` 编辑经 ScenarioViewConfig 校验的内容；不能把场景配置塞回工具文件或修改正式物理模型定义。
- **违反后果**：混用工具和场景身份会覆盖共享场景或回生第二套数据定义。
- **发现来源**：原页面内存编辑记录；2026-10 按当前 PageTool/ScenarioViewFile 合同替换旧入口。

### 保存由工作区编排，回执才是持久化事实

- **场景**：编辑后需要确认文件已经保存。
- **规则**：ProjectWorkspace 的页面与场景保存分别执行实际 IO，保留原文、冲突检查和字节回读。只有实际确认回执可以说明持久化成功；多个文件部分成功时保留逐文件已写/已确认事实，不宣称整批回滚，也不清掉等待期间的新编辑。
- **违反后果**：把内存修改或上传候选当保存结果，会在刷新后丢失改动或错误报告交付。

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
- **规则**：后端正式模型提供字段和查询身份；单场景 SysForm/<scenarioId>/pagedata.json 通过 modelBinding 引用模型并配置稳定 tableName、多 DataView 和 viewCascades。完整绑定为 #scenarioId@tableName@viewId；局部 table@view 只由明确 mainScenarioId 补全，不自动选第一个场景。应用/租户留在请求scope和后端可信目录，不进入业务 JSON。
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
