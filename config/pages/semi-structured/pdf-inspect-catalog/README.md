# PDF 校验配置场景

场景 `A2D63AB2AAEF156E7727094A23AEA433` 的规则目录引用正式 `Base_FileInspectConfig`。目录查询摘要字段，选择身份使用其正式主键 `id`。

`PdfInspectionHistory` 是服务端分页的只读投影。目录点击「核验历史」后读取任务编号、请求编号、规则编号和处理状态，翻页由绑定的 DataView 管理。

`PdfInspectionLimits`、`PdfInspectionResult` 和 `PdfInspectionRecovery` 是执行工作区的按需查询视图。结果接收原 `inspectJobId`，恢复接收原 `requestId`，两者均保留服务返回的逐文件和逐规则证据。

「核验准备」通过 `executionRule` 按选中 `ruleId` 回读原规则。只有唯一、启用且规则配置可读并有效时，才从 `PdfInspectionLimits` 读取当前服务限制。

`definition` 由宿主输入 `ruleId` 定位单个 `id`，按需查询 `rule_config`。标准 JSON 字段直接维护原文本；修改时校验 JSON 语法，取消和保存沿同一 DataView，提交只包含本次变更。名称单独修改不覆盖历史规则文本。数据库保存回执与实际 PDF 文件校验执行能力分别验证，不能由配置可保存推断校验命令可用。
