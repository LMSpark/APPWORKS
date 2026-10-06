# save-dataset 保存链路

save-dataset 是触发指定场景 DataSet.saveChanges 的声明式动作。正式场景由 PageRuntime 持有，业务提交沿 SPARK 原 query/save owner。

## 配置与作用域

```json
{
  "type": "r-button",
  "props": {
    "action": "save-dataset",
    "scenarioId": "SCENE",
    "label": "保存",
    "successMessage": "保存成功"
  }
}
```

scenarioId 必须是本次调用声明并已装载的真实场景。动作通过 ctx.getDataSet(scenarioId) 获取数据集，没有默认首空间；空身份明确拒绝，缺失数据集报告未就绪。

| 属性 | 作用 |
|---|---|
| scenarioId | 必须明确保存场景 |
| views | 可选视图/行选择；显式空、无效或不存在的选择拒绝整次保存 |
| applyEditingRows | 是否先应用编辑域，默认行为由 DataSet 合同提供 |
| successMessage/failureMessage/emptyMessage | 动作结果提示 |
| mode/requestId | 通用保存合同保留的选项；不能由它们推断场景 save 的后端事务保证 |

## 正式场景执行链

```text
rule -> SaveDataSetAction -> executeSaveDataSet
 -> PageRuntime.getDataSet(scenarioId)
 -> DataSet.saveChanges
 -> DataView 私有原 query context
 -> DataSpaceRuntimeApi.save
 -> 原 SPARK maplist 请求与回执 -> dirty 新基线
```

DataSet 先校验选择，按关系组织目标，再应用 editingRows 和收集差异。同模型多个 dirty 视图拒绝合存；同场景不同模型一次 save。正式场景不承诺事务，不使用页面虚构的 /data/transactions 作为 SPARK 保存路径。

API 持有正式模型 Name/AsName 映射和原 token。新增按正式 keyField/GUID 规则；_pk 与权限字段不从业务输入提交。E 是字段写白名单，R 必填限于 E；缺原上下文、作用域过期或 stale 均拒绝写入。应用和租户由请求 scope 提供。

失败保留未确认编辑；异步动作拒绝不执行 then。后端强签名验证保持，前端通过不表示后端写入必然成功。

## 通用内存/端点数据集

spark-data 还保留不带 scenarioId 的通用 DataSet，以及显式配置 endpoint 的 perView/transaction 保存。它们服务局部组件或独立端点，不是正式场景装配合同。transaction 需要显式 endpoint，事务、回滚、幂等与回执由该后端保证；AppWorks 不自动提供服务端。

历史事务页面位于 backend-api-contracts/characterization-fixtures，作用是旧行为对账，不能用作生产 fallback 或证明 lowcode 已有事务端点。

## 实现与验证

- [动作执行](../../packages/spark-component/src/page/actions/action-data.ts)
- [保存编排](../../packages/spark-data/src/dataset.ts)
- [视图编辑与原context保存](../../packages/spark-data/src/data-view.ts)
- [平台API合同](../../packages/spark-lowcode-api/README.md)

```bash
pnpm exec vitest run tests/component/zero-code-events.test.ts tests/data-view/dataview-crud-bridge.test.ts
pnpm exec vitest run packages/spark-data/src/tests/commit-mode.test.ts tests/page/transaction-config-pages.test.ts
```

需要额外验证真实场景中不同模型一次保存、同模型多视图拒合存、无效选择零写入、stale/dirty 保护、权限拒绝与原回执。focused 测试不能替代真实后端写入证据。
