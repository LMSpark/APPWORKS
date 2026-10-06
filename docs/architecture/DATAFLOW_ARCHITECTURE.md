# SPARK 数据流架构

当前调用链以 [模型层级主合同](../../packages/spark-project-model/src/MODEL-HIERARCHY.md) 与源码为准。项目节点、工具定义、场景视图配置、业务结果和运行实例分别持有自己的身份与状态。

## 设计与运行主线

```text
Base_NavigationInfo -> 正式蓝图 API -> ProjectBlueprint.design + session
                                  -> PageTool: rule.json/script.js/style.css
SysForm/<scenarioId>/pagedata.json -> ScenarioViewFile -> ScenarioViewConfig
正式 readModel/readRelations + ScenarioViewConfig -> loadScenarioDataSet -> DataSet
PageRuntime(tool, scenarioIds, loadScenario) -> 独立 DataSet Map
                                        -> materialize() -> SparkPageRenderer
                                        -> resolveView(binding) -> DataView -> UI
```

正式节点 DTO 是 nodeId/parentNodeId/projectId/kind/capability，加可选 navigation/dataSpace/prototype、source。children 只属于树投影。capability.description 与策划投影提供需求；工具不继承节点，多个节点可以指向同一 pageId。

## 场景装配

宿主先读取对应 ScenarioViewFile，再调用 `loadScenarioDataSet({scenarioId, config, designScenarioId?, assertCurrent?})`。loader 读取所引用模型的正式 readModel 与场景 readRelations，LowcodeDataSpaceAssembler 校验 modelId、查询模型 Name、稳定 tableName 和命名 views，绑定 API 查询执行器。

场景配置只声明单场景视图与 viewCascades。字段与关系来自正式模型，不能从资源物理字段猜测。可表达的正式等值关系自动生成级联，显式 viewCascades 优先。DataSet.scenarioId 与 DataTable 模型绑定只读。

PageRuntime 每次调用创建独立的数据集 Map。同一 PageTool 的两个调用也不共享编辑状态。load 失败释放已成功装配的兄弟场景；dispose 或 generation 改变后迟到结果不能回填。

## 查询与保存

```text
DataView.loadFromServer
 -> 共享 DataSpaceRuntimeApi.query
 -> 私有 DataSpaceQueryContext（原结果、权限、作用域）
 -> 去权限字段的业务行 -> DataView
DataView / DataSet 保存
 -> 原 query context 构造差异与凭据
 -> DataSpaceRuntimeApi.save -> SPARK maplist 封包
 -> 回执匹配 -> 新基线
```

API 持有正式 Name 请求与 AsName 输出映射，包括字段、过滤、排序、树键及保存回执。原签名快照保持原样；`_pk` 只用于前端计算定位，不提交。新增遵循正式 keyField/GUID 规则，不用 max+1、时间戳或猜测联合业务键。应用和租户来自既有请求 scope，不写入业务行。

字段 E 是写白名单；R 只对 E 内字段形成必填。h/m 根据模型与真实当前行共同消费；树 c 独立控制新增子行。组件通过 DataView.fieldAccess/动作状态读取权限，不消费可注入的公共快照。Java 强验证仍是后端底线。

dirty 视图拒绝结果与配置覆盖；查询失败进入 stale 并暂停编辑。相同模型的多个 dirty 视图拒绝合并保存；同一场景不同模型可以一次 save，该批次不承诺事务。

## 页面消费者

`SparkPageRenderer` 接收 PageRuntime 与调用 routeSnapshot，load 后 materialize 工具定义。PAGE_RUNTIME 传递本实例；容器提供 DATA_SOURCE、行作用域提供 DATA_ROW。视图键为 `#scenarioId@table@view`，局部 `table@view` 必须显式声明 mainScenarioId。无默认第一空间。

展示读取使用 dataViewKey + dataMember + dataField；动作集中调用 getDataSet(scenarioId)/resolveView(binding)。显式无效或空选择拒绝整次动作；异步拒绝不执行 then。脚本的 `$page` 使用同一调用入口，关闭后旧动作、timer 与迟到异步失效；Render 注册、CSS 和组件状态只属于 instanceId。

## 编辑与 AI

ProjectWorkspace 编排蓝图、工具与场景 IO。DevSystem 与 AI 先编辑内存模型，再分别保存工具文件或明确 scenarioId 的场景配置；工具 dirtyFiles、ScenarioViewFile.isDirty、PageRuntime.isDirty 分属三种编辑状态。

场景保存执行写前原文比较与写后字节回读；后端无 CAS，不能承诺原子并发保护或失败回滚。工具版本为真实 N__filename 快照；发布引用保存在 source.VersionId 的 rule/script/style 段，恢复工作文件不切换发布引用。

## 相关入口

- [模型架构](SPARK_PAGE_CONFIG_ARCHITECTURE.md)
- [系统总览](system-architecture.md)
- [权限](PERMISSION_SYSTEM.md)
- [数据 API](../../packages/spark-lowcode-api/README.md)
