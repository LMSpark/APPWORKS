# 研读：SSOT 本批 G7/G8

## 策略
零兼容、无薄转发、删断再改。

## G7+G8 结案（2026-08-10）
- G7：去掉 FieldRender*/LoggerApi/LogLevel 纯再导出；PermissionActionContext 保留（组件增广）
- G8：`LowcodeAjaxResult` → `AjaxResult`；台账对齐必填 Code；`verify:ajax-result-parity` 接入 `verify:rules`
- 未做：`SparkNode`/`SparkNodeChildren` 仍从 spark-component 再导出（下一批）

## 下一批候选
- G7b：`SparkNode` 公共面改直连 spark-data
- contracts `JsonObject` vs spark-json-document
- 其它桶薄导出扫尾
