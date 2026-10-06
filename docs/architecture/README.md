# 架构文档

本目录说明当前源码中的产品合同。领域细节以 [模型层级](../../packages/spark-project-model/src/MODEL-HIERARCHY.md) 为主入口。

## 阅读导航

- [system-architecture.md](system-architecture.md)：系统定位、启动、包分层、路由与 AI。
- [SPARK_PAGE_CONFIG_ARCHITECTURE.md](SPARK_PAGE_CONFIG_ARCHITECTURE.md)：蓝图、页面工具、场景文件和运行实例。
- [DATAFLOW_ARCHITECTURE.md](DATAFLOW_ARCHITECTURE.md)：配置装配与 query/save 数据流。
- [PLATFORM_TENANT_ROUTING.md](PLATFORM_TENANT_ROUTING.md)：平台、应用、企业与路由边界。
- [PERMISSION_SYSTEM.md](PERMISSION_SYSTEM.md)：原查询上下文中的权限消费。

## 当前术语

| 对象 | owner 与职责 |
|---|---|
| ProjectBlueprint | 项目根，组合设计聚合与编辑会话 |
| ProjectBlueprintDesign | 正式节点索引与页面工具索引；树是投影 |
| ProjectSession | 选中节点、活动工具、草稿和 dirty 状态 |
| ProjectBlueprintNode | nodeId 身份的正式蓝图节点，kind 与 capability 表达领域语义 |
| PageTool | pageId 身份的可复用工具，只持 rule/script/style |
| ScenarioViewFile | scenarioId 身份的场景 pagedata 编辑、基线与撤销 owner |
| PageRuntime | instanceId 身份的一次调用，持工具与多个独立场景 DataSet |
| ProjectWorkspace | 蓝图、工具、场景和引用 IO 编排 |
| RuntimeNavigation | 后端授权事实与蓝图投影形成的应用壳导航合同 |

节点的短需求是 capability.description，策划消费者读取模型投影。组件不从导航记录推断模型、字段或权限；运行调用不从全局活动页面取数据。

## 治理顺序

```text
理念 > 逻辑 > AI 生成代码规则 > SSOT || SOLID > 该删则删 || 该合则合 || 该拆则拆 > 迁移便利
```

架构变更需同步本文档与真实消费者。门禁输出只证明其检查范围，不替代源码或浏览器行为证据。
