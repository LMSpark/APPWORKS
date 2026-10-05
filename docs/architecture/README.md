# 架构文档

这个目录只放当前仍然成立的架构事实，不再保存历史迁移记录和一次性方案。

## 保留文档

1. [system-architecture.md](system-architecture.md)：系统总览——定位、主线、包分层、启动与路由、页面渲染、数据与权限、AI、SSOT 与门禁。
2. [SPARK_PAGE_CONFIG_ARCHITECTURE.md](SPARK_PAGE_CONFIG_ARCHITECTURE.md)：`spark-project-model` 的项目模型、节点模型和配置页内容模型。
3. [DATAFLOW_ARCHITECTURE.md](DATAFLOW_ARCHITECTURE.md)：项目节点、DataSet、DataView、Renderer 的数据流。
4. [PLATFORM_TENANT_ROUTING.md](PLATFORM_TENANT_ROUTING.md)：平台、企业、项目蓝图和运行路由边界。
5. [PERMISSION_SYSTEM.md](PERMISSION_SYSTEM.md)：权限快照、字段权限和动作权限。

## 当前术语

| 术语 | 含义 |
|---|---|
| `ProjectModel` | 软件项目根；持有 `design` 与 `session` |
| `ProjectBlueprintDesign` | 蓝图节点与配置页设计内容聚合；平铺 `nodesById` + 配置页 Map |
| `ProjectSession` | 设计过程态：选中节点、活动页、蓝图 dirty；不落盘 |
| `ProjectBlueprintNode` | 非配置页的蓝图节点 class；按 `nodeKind` 区分运行交付形态 |
| `ConfigPageNode` | 配置页节点；聚合 `rule` / `dataSet` / `script` / `style` 四个子模型 |
| `ProjectWorkspace` | 设计门面：持有 `ProjectModel` 并编排蓝图与页面文件 IO |
| `PageNodeLike` | 运行态只读页面：`load()` + `toRenderConfig()` |
| `RuntimeNavigation` | 应用壳唯一导航合同；蓝图记录与授权证据装配后的输出 |
| `description` | 节点功能描述，也是用户需求的单一真源 |
| DevSystem | 项目模型消费层；通过 `ProjectWorkspace` 对接 lowcode，六阶段工作区 `BlueprintWorkspace` 直连 `lowcodeApi` |

## 治理顺序

```text
理念 > 逻辑 > AI 生成代码规则 > SSOT || SOLID > 该删则删 || 该合则合 || 该拆则拆 > 迁移便利
```

架构文档先说明理念和边界，再说明结构和调用链。类名、路径和函数名必须能在源码中找到；`verify:docs` 不检查这一点，修改架构相关代码时请同步更新这里。
