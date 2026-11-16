# D99 workflow：lingmacn 表模型 PrimaryKeyFields 修复清单

**背景**：`loadLowcodeRuntimeScenario` → `readModelBatch` 对「数据库表」模型校验 `Base_DataModel.PrimaryKeyFields` 与 `View_TblList` 来源主键。lingmacn 上下列模型 **PrimaryKeyFields 为空**，导致流程模型列表、设计伙伴、工作台伙伴、办理/详情页装配失败（与 pagedata `queryConfig.fields` 无关）。

**探测**：`node tools/workflow/probe-workflow-formal-pk.mjs` 或 `node tools/workflow/read-workflow-model-ids.mjs`（看 `formalTablePrimaryKey`）。

**修复步骤（元数据管理 / 数据空间设计）**

1. 打开对应 **数据空间 ID**（`scenarioId` 列）。
2. 选中 **modelName** 表模型，在模型属性中设置 **PrimaryKeyFields = `rowid`**（若物理表主键为其他单列，与 `View_TblList` 一致）。
3. 保存模型；对来源库 `EBEFF17BBB6443B185D6FB32FF69F0BB` 上同名物理表，确认 `Base_TblField` **仅一个** `IsPKey=1` 且非 `lingma_sys_ent`（否则报「正式来源必须有且仅有一个非租户主键」）。
4. 全部完成后：`probe-workflow-formal-pk.mjs` **exit 0** → 5273 四格 → `workflow-r16-close-loop.mjs`。

**明细探测（2026-11-16）**：`node tools/workflow/probe-workflow-formal-pk-detail.mjs` → `workflow-formal-pk-detail-20261116.json`；**分级清单**：`workflow-formal-pk-repair-tiers-20261116.md`（建议先做完 Tier A 再测 SPA）。

- 多数缺口 **字段层已唯一 `rowid`/`ROWID`**，仅需在模型上补 **`PrimaryKeyFields=rowid`** 即可解除 `projectFormalModel` 失败（如 `87F0 WFM_FLOW_MODLE`、`WFOBJ_*` 多数表）。
- 例外须先收敛 **IsPKey** 或物理表主键：`FunctionNodeAuth` / 部分表出现 **`rowid` + `lingma_sys_ent`** 双主键；`Base_UserInfo`、部分 `WFM_*` 字段主键为 **`ID`/`ROWID`** 但模型未声明，且 **View_TblList 来源主键链仍未唯一**（见 `repairHint` 列）。
- lingmacn **GetData 常忽略 Filter**；字段扫描为全目录客户端筛选（约 185 页），勿用未改造的 Filter 探测。

| scenarioKey | dataSpaceId | modelName | modelId |
| --- | --- | --- | --- |
| flowModelList | `87F0EF6AD1B64D67FFE597E7E3285994` | WFM_FLOW_MODLE | `87F0EF6AD1B64D67FFE597E7E3285994p000` |
| flowModelList | `87F0EF6AD1B64D67FFE597E7E3285994` | Base_UserInfo | `87F0EF6AD1B64D67FFE597E7E3285994p001` |
| flowDesign | `6E462C4A39EE0D96F4D1A28FFE887C89` | WFM_FLOW_MODLE | `6E462C4A39EE0D96F4D1A28FFE887C89p000` |
| flowDesign | `6E462C4A39EE0D96F4D1A28FFE887C89` | WFM_FLOW_NODE | `6E462C4A39EE0D96F4D1A28FFE887C89p001` |
| flowDesign | `6E462C4A39EE0D96F4D1A28FFE887C89` | WFM_NODE_REALATION | `6E462C4A39EE0D96F4D1A28FFE887C89p002` |
| flowDesign | `6E462C4A39EE0D96F4D1A28FFE887C89` | WFM_WORKFORM | `6E462C4A39EE0D96F4D1A28FFE887C89p012` |
| flowDesign | `6E462C4A39EE0D96F4D1A28FFE887C89` | FunctionNodeAuth | `6E462C4A39EE0D96F4D1A28FFE887C89p014` |
| flowDesign | `6E462C4A39EE0D96F4D1A28FFE887C89` | _Base_FunctionNode | `6E462C4A39EE0D96F4D1A28FFE887C89p013` |
| flowDesign | `6E462C4A39EE0D96F4D1A28FFE887C89` | Base_AppSystemList | `6E462C4A39EE0D96F4D1A28FFE887C89p016` |
| flowMonitor | `E328FBBF518141973C575D612CD75151` | WFOBJ_FLOW | `cefff969-511b-4238-bbc3-21c9b671cc84` |
| flowWorkbench | `A5BADCEE11D2438CB9E75C2453A220A6` | WFOBJ_FLOW_Waiting | `1ae5bacc-9124-4acf-8b75-a78c61298fb3` |
| flowWorkbench | `A5BADCEE11D2438CB9E75C2453A220A6` | WFOBJ_FLOW_RELATIONLINE_STEP | `8b5ef80f-6dfc-4769-9bbe-34c58128c73c` |
| flowWorkbench | `A5BADCEE11D2438CB9E75C2453A220A6` | WFOBJ_FLOW | `3c0d6640-9c84-4894-9996-cf1418bd4106` |
| flowWorkbench | `A5BADCEE11D2438CB9E75C2453A220A6` | WFOBJ_FLOW_FORM | `b831c094-07e0-478d-b248-7a472d47b254` |

**说明**：`View_FlowObjList`、`Dict_state` 为视图/字典，不在本表；流程监控列表当前可走通主视图，但 pagedata 内 **WFOBJ_FLOW 表** 仍缺 PrimaryKeyFields，办理/详情伙伴场景必修工作台与设计空间。

**源码核对**：`2026-11-16` 自 `read-workflow-model-ids` / `assessWorkflowFormalTablePrimaryKeys` 导出；modelId 以当次 G0 回读为准。