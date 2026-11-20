# save-dataset 保存链路

save-dataset 是触发指定场景 DataSet.saveChanges 的声明式动作。本文只说明动作接入；持久来源、DataTable.api/crudConfig 和回执边界统一见[数据空间主合同](../architecture/DATAFLOW_ARCHITECTURE.md)。

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
| applyEditingRows | 是否先应用编辑域，DataSet 默认 true；DataView.saveChanges 本身不应用编辑域 |
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

DataSet 先校验选择，按关系组织目标，再应用 editingRows 和收集差异。同一DataTable多视图可保存不重叠的记录，分别保留查询签名、权限和回执；同记录跨视图提交及模型身份冲突在应用编辑前拒绝。DataView及请求层按正式主键复核，同场景一次save。正式场景不承诺事务，不使用页面虚构的 /data/transactions 作为 SPARK 保存路径。

API 持有正式模型 Name/AsName 映射和原 token。动作不能绕过[原查询数据权限](../architecture/PERMISSION_SYSTEM.md)，不能以页面可达或测试账号身份放行。

失败保留未确认编辑；异步动作拒绝不执行 then。后端强签名验证保持，前端通过不表示后端写入必然成功。

来源明确报告原提交未知时，DataSet本轮只核验所选视图的原捕获，暂不应用新编辑或提交其他视图。`hasUnconfirmedSave`是视图的只读恢复状态，不能从一般`mutatingError`推断。本轮成功表示相应回执已确认；页面或自动交付仍须核对目标视图有无剩余修改，才能提示全部完成，不能自动补交保存期间产生的新编辑。

标准动作在调用前捕获本次视图及`ids`范围，回执后读取原视图的未确认提交、已暂存变更和编辑域。范围内仍有修改时提示“本轮保存已确认，目标范围仍有修改待保存”，不发成功通知，也不采用`successMessage`；`applyEditingRows: false`留下的编辑同样如此。未选视图和未选行不计入本次待存；选择器省略`viewId`只对应`default`，省略整个`views`才覆盖全部视图。保存期间调用方更换选择不改变本次提示范围，后续保存须显式触发。

## 通用内存/端点数据集

spark-data 还保留不带 scenarioId 的通用 DataSet，以及显式配置 endpoint 的 perView/transaction 保存。它们服务局部组件或独立端点，不是正式场景装配合同。transaction 需要显式 endpoint，事务、回滚、幂等与回执由该后端保证；AppWorks 不自动提供服务端。

历史事务页面位于 backend-api-contracts/characterization-fixtures，作用是旧行为对账，不能用作生产 fallback 或证明 lowcode 已有事务端点。

## 实现与验证

- [动作执行](../../packages/spark-component/src/page/actions/action-data.ts)
- [保存编排](../../packages/spark-data/src/dataset.ts)
- [视图编辑与原context保存](../../packages/spark-data/src/data-view.ts)
- [平台API合同](../../packages/spark-lowcode-api/README.md)

```bash
pnpm exec vitest run tests/ui/component/zero-code-events.test.ts tests/runtime/data-view/dataview-crud-bridge.test.ts
pnpm exec vitest run packages/spark-data/src/tests/crud/commit-mode.test.ts tests/runtime/page/transaction-config-pages.test.ts
pnpm exec vitest run tests/runtime/page/save-dataset-recovery.test.ts
```

需要额外验证真实场景中不同模型一次保存、同模型不同记录合批及重复记录拒合存、无效选择零写入、stale/dirty 保护、权限拒绝与原回执。focused 测试不能替代真实后端写入证据。
