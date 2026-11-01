# PDF 校验配置场景

场景 `A2D63AB2AAEF156E7727094A23AEA433` 只引用正式 `Base_FileInspectConfig`。目录查询摘要字段，选择身份使用其正式主键 `id`；不要求空间内不存在的用户模型。

`definition` 由宿主输入 `ruleId` 定位单个 `id`，按需查询 `rule_config`。标准 JSON 字段直接维护原文本；修改时校验 JSON 语法，取消和保存沿同一 DataView，提交只包含本次变更。名称单独修改不覆盖历史规则文本。数据库保存回执与实际 PDF 文件校验执行能力分别验证，不能由配置可保存推断校验命令可用。
