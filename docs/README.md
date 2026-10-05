# SPARK AppWorks 文档入口

> 文档只保留当前能指导设计、开发、调试和评审的内容。历史计划、旧迁移记录、重复解释和过期博客不再保留。

## 一句话主线

SPARK AppWorks 是软件项目模型：一个项目由平铺项目节点组成，节点按类型分为模块、配置页、Vue 页面、动作、外链和引用；树只是节点集合的投影。

```text
ProjectModel (design + session)
  -> ProjectBlueprintNode 子类树 / ProjectBlueprintIndex
  -> ConfigPageNode (rule / dataSet / script / style)
  -> SparkPageRenderer / DevSystem / DTS ClassModel（内存 emit → JSON；Worker 按需加载）
```

后端记录仍叫 `Base_NavigationInfo`，但模型主语是 class 层级：`ProjectBlueprintDesign` 持有节点与配置页；`ProjectWorkspace` 负责设计操作与落盘。配置页内容在 `ConfigPageNode`，不是独立文件模型。

## 推荐阅读顺序

1. [guides/QUICKSTART.md](guides/QUICKSTART.md)：最短上手路径。
2. [architecture/system-architecture.md](architecture/system-architecture.md)：系统总览——定位、主线、包分层、启动与路由、页面渲染、数据与权限、AI。
3. [SPARK_APPWORKS_PROJECT_DEEP_DIVE_ZH.md](SPARK_APPWORKS_PROJECT_DEEP_DIVE_ZH.md)：项目整体认知。
4. [architecture/SPARK_PAGE_CONFIG_ARCHITECTURE.md](architecture/SPARK_PAGE_CONFIG_ARCHITECTURE.md)：项目模型、节点模型和配置页内容模型。
5. [architecture/DATAFLOW_ARCHITECTURE.md](architecture/DATAFLOW_ARCHITECTURE.md)：从项目节点到渲染运行时的数据流。
6. [../packages/spark-ai/docs/class-model-knowledge-system-zh-cn.md](../packages/spark-ai/docs/class-model-knowledge-system-zh-cn.md)：DTS ClassModel 生成口径；AI 代码生成规则见仓库根 [AGENTS.md](../AGENTS.md)。

## 目录边界

- [architecture/](architecture/README.md)：当前架构事实和跨包边界。
- [guides/](guides/README.md)：仍然可执行的操作指南。
- AI 相关文档在 [`packages/spark-ai/docs/`](../packages/spark-ai/docs)：ClassModel 知识体系、传输与会话、Agent Workflow。
- 包内 README / API / ARCHITECTURE：只说明该包自己的公共面和边界。
- [`.cursor/skills/`](../.cursor/skills)：随项目提交的 AI 技能（`appworks-*`），登记规则见 [DOCUMENT-GOVERNANCE.dm](DOCUMENT-GOVERNANCE.dm)；技能是工作方法，不是产品事实源。

## 写作规则

- 默认中文；英文只用于 API 名、文件名、命令、协议字段和第三方专有名词。
- 新文档必须先判断能否合并到现有文档。
- 计划类文档完成后删除；沉淀下来的规则合并进主文档。
- 不再新增 blog-series、历史迁移散篇、日期版文件名或 `DM-*.md`。
