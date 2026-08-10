# 研读：spark-lowcode-api 加中文注释

## 用户确认
- 研读理解已确认；用户指令「直接加，这个没难度」，授权跳过冗长反问，直接实施。

## 包职责
`@spark-appworks/spark-lowcode-api` 是 lowcode-jdk17 的前端领域 API：`LowcodeApi` 聚合 blueprint / catalog / dataSpace / design / permission / platform / realtime / session / application。

## 现状
- 生产源约 34 个 `.ts`（不含测试）。
- 中文 JSDoc 极少；错误消息多为中文；README 已是中文。

## 注释策略
- 只补生产源；测试文件不加。
- 文件头 + 公共 class/type/方法契约说明；解释约束与风险，不做逐行翻译。
- 禁止参数内嵌 JSDoc；不改逻辑、签名、导出面。
