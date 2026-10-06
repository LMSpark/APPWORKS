# 使用指南

这个目录只保留当前还能直接执行或直接指导开发的指南。历史计划、重复说明和过期专题已删除。

## 推荐顺序

1. [QUICKSTART.md](QUICKSTART.md)：安装、启动和最短认知路径。
2. [CONFIG_SYSTEM.md](CONFIG_SYSTEM.md)：应用配置、项目节点配置和页面内容配置的边界。
3. [DATA_MANAGEMENT.md](DATA_MANAGEMENT.md)：DataSet、DataView、绑定和联动。
4. [COMPONENT_DEVELOPMENT.md](COMPONENT_DEVELOPMENT.md)：组件注册、能力和渲染扩展。

## 专题指南

- [TREE_CAPABILITY.md](TREE_CAPABILITY.md)：树形场景、treeMode 和节点权限。
- [CONDITION_EXPRESSION.md](CONDITION_EXPRESSION.md)：过滤表达式与计算表达式。
- [SAVE_DATASET_ACTION.md](SAVE_DATASET_ACTION.md)：声明式保存动作。

## 维护约束

- 新增指南必须对应一个当前可执行场景。
- 能合并到现有指南时不新增文件。
- 计划、迁移、复盘类内容完成后删除；保留下来的规则合并进架构或指南。
- 涉及页面配置时区分 ProjectBlueprint 节点、PageTool 三文件、ScenarioViewFile 场景视图配置与 PageRuntime 调用。
