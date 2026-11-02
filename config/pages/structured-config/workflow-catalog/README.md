# 工作流目录场景

目录场景 `5E9676B1E38860B023921F48FB4370DE` 引用实际服务的 `Base_WorkflowDefinition` 和 `workflowStatus`，由统一场景加载器装配。名称、编码、状态和描述沿正式字段读取，不依赖本空间不存在的用户模型，不将执行应用身份当作 `sysid`。

此配置承接目录，设计在原导航身份下以标准对话框打开，数据来自独立设计场景；定义、节点、连线、布局等恢复范围及证据见workflow-editor/README.md和唯一实施台账，不能据此称整页完成。

正式新建尚未完成。固定参考先通过E06753D019382D5E479264B70258ADE0规则领码再插入定义，但实服规则绑定Base_WorkflowDefinition.rowid，而本地Java首次领码要求业务行已存在；部署服务的创建顺序及独立分配核验入口尚待确认。当前已删除随机UUID打开不存在设计的分支，点击新增明确提示能力缺口，不分配编码、不创建占位记录。不得使用前一轮烟测的手工短编码作为生产方案。只读证据为evidence/data-chain-smoke/2026-11-03-workflow-create-feasibility.json。
