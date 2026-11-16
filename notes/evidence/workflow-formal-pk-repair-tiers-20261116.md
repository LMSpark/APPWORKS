# Workflow 正式主键修复分级（D99）

> 由 `workflow-formal-pk-detail-20261116.json` 归纳；lingmacn 未保存模型前有效。物理表 `Base_TblField` 对 `WFM_FLOW_MODLE` 实测仅 **`rowid` IsPKey=1**（扫描约 37 页）。

复测：`node tools/workflow/probe-workflow-formal-pk.mjs`（2026-11-16 下午 **9** 缺口；以最新 probe 为准）。

## Tier A：仅补模型 `PrimaryKeyFields`（字段 IsPKey 已唯一）

在对应数据空间打开表模型 → 设置 **`PrimaryKeyFields=rowid`** → 保存。

| 空间 | 模型 | modelId |
| --- | --- | --- |
| flowModelList | WFM_FLOW_MODLE | `87F0EF6AD1B64D67FFE597E7E3285994p000` |
| flowDesign | WFM_FLOW_NODE | `6E462C4A39EE0D96F4D1A28FFE887C89p001` |
| flowDesign | Base_AppSystemList | `6E462C4A39EE0D96F4D1A28FFE887C89p016` |
| flowMonitor | WFOBJ_FLOW | `cefff969-511b-4238-bbc3-21c9b671cc84` |
| flowWorkbench | WFOBJ_FLOW_Waiting | `1ae5bacc-…` **设计器手工**（BatchTableOperate 500，见 api-limits 证据） |
| flowWorkbench | WFOBJ_FLOW_RELATIONLINE_STEP | （见 **Tier B**） |
| flowWorkbench | WFOBJ_FLOW | `3c0d6640-…` **设计器手工**（同上） |
| flowWorkbench | WFOBJ_FLOW（伙伴） | 见 repair 清单 |

**共 7 个**（`node tools/workflow/workflow-formal-pk-tiers.mjs` 运行时分类为准）；API：`node tools/workflow/apply-workflow-formal-pk-tier-a.mjs [--apply]`。

## Tier B：先收敛模型字段 `IsPKey`，再设 `PrimaryKeyFields`

| 空间 | 模型 | 当前字段 IsPKey |
| --- | --- | --- |
| flowDesign | FunctionNodeAuth | `rowid`, `lingma_sys_ent` |
| flowWorkbench | WFOBJ_FLOW_RELATIONLINE_STEP | `rowid`, `lingma_sys_ent` |
| flowWorkbench | WFOBJ_FLOW_FORM | `rowid`, `WFOBJID` |

取消多余字段的 **IsPKey**（保留 `rowid`），再保存 **`PrimaryKeyFields=rowid`**。

## Tier C：模型字段主键名与 `rowid` 不一致

字段层主键不是 `rowid` 时，须与物理表及 `PrimaryKeyFields` 对齐：

| 空间 | 模型 | 字段 IsPKey |
| --- | --- | --- |
| flowModelList | Base_UserInfo | `ID` |
| flowDesign | WFM_FLOW_MODLE | `ROWID` |
| flowDesign | WFM_NODE_REALATION | `ROWID` |
| flowDesign | WFM_WORKFORM | （见 detail JSON） |
| flowDesign | _Base_FunctionNode | （见 detail JSON） |

建议：统一输出字段 **`rowid` 且 IsPKey=1**，模型声明 **`PrimaryKeyFields=rowid`**（与 Tier A 一致化）。

## 签收顺序

1. 批量完成 **Tier A** → `probe-workflow-formal-pk.mjs` 缺口应明显减少。
2. 处理 **Tier B/C** → 探测 **exit 0**。
3. `probe-workflow-metadata.mjs` → `g0MayProceed: true` → 5273 四格 → `workflow-r16-close-loop.mjs`。
