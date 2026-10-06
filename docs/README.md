# SPARK AppWorks 文档入口

SPARK AppWorks 用项目蓝图表达需求与节点关系，用页面工具表达可复用界面，用场景视图文件表达业务数据视图，用运行实例表达一次页面调用。

```text
ProjectWorkspace -> ProjectBlueprint (design + session)
                    -> 蓝图节点、PageTool (rule / script / style)
ProjectWorkspace -> ScenarioViewFile -> ScenarioViewConfig
PageRuntime -> PageTool + 多个独立场景 DataSet -> SparkPageRenderer
```

后端 `Base_NavigationInfo` 记录经正式 API 映射为 nodeId、parentNodeId、projectId、kind、capability，以及可选 navigation/dataSpace/prototype 和 source。nodeId、工具 pageId、场景 scenarioId、运行 instanceId 各有独立职责。多个节点或调用可以使用同一个工具。

## 推荐阅读顺序

1. [guides/QUICKSTART.md](guides/QUICKSTART.md)：安装与启动。
2. [模型层级主合同](../packages/spark-project-model/src/MODEL-HIERARCHY.md)：领域身份、文件 owner、生命周期与版本。
3. [architecture/system-architecture.md](architecture/system-architecture.md)：系统分层与启动路由。
4. [SPARK_APPWORKS_PROJECT_DEEP_DIVE_ZH.md](SPARK_APPWORKS_PROJECT_DEEP_DIVE_ZH.md)：项目整体认知。
5. [architecture/SPARK_PAGE_CONFIG_ARCHITECTURE.md](architecture/SPARK_PAGE_CONFIG_ARCHITECTURE.md)：项目、工具、场景与调用边界。
6. [architecture/DATAFLOW_ARCHITECTURE.md](architecture/DATAFLOW_ARCHITECTURE.md)：真实装配、查询和保存链。
7. [DTS ClassModel](../packages/spark-ai/docs/class-model-knowledge-system-zh-cn.md)：知识生成与按需消费。

## 目录边界

- [architecture/](architecture/README.md)：产品架构事实与跨包合同。
- [guides/](guides/README.md)：可执行操作指南。
- [spark-ai 文档](../packages/spark-ai/docs)：AI 知识、传输、会话与工作流。
- 包内 README/API：该包的公共入口与边界。
- [AI 技能](../.cursor/skills)：工作方法，登记见 [DOCUMENT-GOVERNANCE.dm](DOCUMENT-GOVERNANCE.dm)，不替代产品事实。
- [AGENTS.md](../AGENTS.md)：AI 编码工作流。

正文中的类、路径与行为以当前源码为准。新增说明先判断能否合并到现有文档；计划、历史调研与目标草案不能被当作运行合同。
