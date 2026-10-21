# I4 研读：输入参数命令类与 P1 对齐

## 现状

- `LowcodeDataSpaceInputParameterEdit`（`src/lowcode/data-space/input-parameters/lowcode-data-space-input-parameter-edit.ts`）已是 **DataView 编辑 + applyEditingRows + DataSet.saveChanges + 精确 readback** 路径，不持独立 JSON 草稿。
- 仍保留 **5 态流程 FSM**：`idle | pending | unsubmitted | unknown | readback`，与 P1b 后 `DataView.hasUnconfirmedSave`（`DataSpaceRuntimeApi`）在语义上重叠：`unknown` ≈ 已 dispatch 但回执/回读未闭环；`readback` ≈ 回执已确认但精确回读失败。
- 宿主：`LowcodeDataSpaceDesignSession.getInputParameters()` 懒建单例；`data-set-design-page.vue` 用 `parameterBaseline` + `save`/`reload`/`getState().status !== 'idle'` 控制取消与核验按钮。
- 领域保留：`DataSpaceDesignApi.prepareInputParameters` / `readInputParameters`；引用扫描在 `lowcode-data-space-input-parameter-references.ts`（§4.3 保留）。

## 测试锚点

- 页面：`data-space-design-page.test.ts` 6322+（对话框、取消、保存重开、verify/save readback 后工作台标题不丢）。
- 元数据：`lowcode-data-space-metadata.test.ts` 大量 `getInputParameters().save/reload/getState` 契约（含 `unknown`/`readback`/`pending` 与 `loseNextResponse`）。
- 链：`data-space-chain.test.ts` 抽样使用 `getInputParameters()`。

## 与 §4.3 删除清单的关系

`input-parameter-edit` 在 11 类删除列表中，但实现已接近目标形态；I4 试点应是 **去掉类内 `#status`，改由 `hasUnconfirmedSave` + 少量瞬态（`mutating`/`RequestState.Loading`）驱动 UI**，`save` 失败后的核验走 `DataSet.saveChanges` 恢复路径或 `reload` 包装 `verifyUnconfirmed`，而非双轨状态。

## 风险

- `save` 成功后的 **字段级精确 readback**（临时 query view）与运行时 **按主键 IN 核验** 不是同一合同；合并前须证明参数单行 `inputParams` JSON 在两种路径下等价，或保留 readback 为领域步骤、仅删除与 `hasUnconfirmedSave` 重复的 `unknown`。
- `reload({discardPending:false}, refresh)` 与共享 `Base_DataSet` 行标题保护（台账 2026-10-18）仍须回归。

## 关系/级联（I4 其余，未展开）

- 设计页已有 `DataSpaceRelationEditor`、`DataSpaceCascadeEditor` 与导航节点；仍经 view-design 会话与 pagedata 定义视图，无单独命令类名在 §4.3 删除表，但边面板/级联保存链仍依赖会话 pending 与定义 DataView，待单独差距清单对照参考 depType/联表 UI。
