# 研读：冗余过时代码清理（A–D 全选）

## 用户确认
- 用户对候选范围回答「全部」，随后授权「直接清除，跳过一问一答」，并要求「继续」。

## 实施收束（代码事实）
- **已做（波次 1）**：A 蓝图/项目模型机械注释清除与文件头收束；D 包索引补 `spark-lowcode-api`、收口 purge 计划、根 README 主线补全。
- **已做（波次 2）**：page/content 机械注释清除；`lowcode-design-api` 去重注释；`MODEL-HIERARCHY.md` 旧类型名与 `blueprint/` 路径表收束；`TREE_CAPABILITY.md` 标明 Java NavigationController 已退役并改调用链说明。
- **未做（有消费者）**：不删 `backend-api-contracts/`；不合/删双蓝图包；不移除 `sub-page`。
- **未做（大文档）**：`MODEL-HIERARCHY.md` 内 mermaid 仍有部分历史 `Navigation*`/`ProjectNode` 图示名，需单独一轮对照源码全文改图，避免半改半留。

## 复杂度
复杂；实际交付为安全清除子集，分波继续。
