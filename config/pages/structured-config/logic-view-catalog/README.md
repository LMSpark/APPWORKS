# 逻辑视图目录与编辑目标

`EB720370EF06A5A656838F87E0716D6B` 使用数据库正式模型绑定。目录 `default` 与单目标 `editorTarget` 独立；装配不查询业务行，PageRuntime 注入本次 `viewId` 后才查询目标。

设计编辑使用本场景正式声明的 `LogicViewDesignEdit` 文件资源（`logic-view-design`），目标由 PageRuntime 注入的 `queryContext.viewId` 决定，执行器由装配按声明接线，读写经 GetView/SaveView。参数与四类来源通过同一个按需装配的 `8D1AB14DD8277F3E7017CD38F77B09FD` 访问，参数使用 `logicViewParameters`，来源使用已有 `sourceCandidates/sourceDetails`；不复制模型定义或另建来源查询 owner。

当前仅证明正式装配及只读消费。SaveView 后发布正式输出字段、独占设计保存重开和删除仍须验证，不能把文件回执当作运行模型可消费的证明。参考列表创建时间尚未恢复；正式输出字段为 `createtime`，没有 `crttime`，不得加入旧字段别名兼容。
