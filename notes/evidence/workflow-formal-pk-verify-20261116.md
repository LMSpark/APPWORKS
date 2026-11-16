# R16 签收复验：lingmacn PrimaryKeyFields 回读（2026-11-16）

**用户声明**：手工清单 6 项已在设计器保存（2026-11-16 烟测前）。\
**探测结果**：`probe-workflow-formal-pk.mjs` **exit 1**；缺口仍为 **6**。

## 抽样回读（GetData → Base_DataModel 客户端筛选，2026-11-16 12:47）

| modelName | modelId | PrimaryKeyFields（实服） |
| --- | --- | --- |
| Base_UserInfo | `87F0…p001` | **空** |
| WFM_WORKFORM | `6E462…p012` | **空** |
| WFOBJ_FLOW_Waiting | `1ae5bacc-…` | **空** |
| WFOBJ_FLOW_RELATIONLINE_STEP | `8b5ef80f-…` | **空** |
| WFOBJ_FLOW | `3c0d6640-…` | **空** |
| WFOBJ_FLOW_FORM | `b831c094-…` | **空** |

结论：当前 `.env.local` 所连 lingmacn 上上述行的 **PrimaryKeyFields 仍未持久化**（与用户声明不一致）。\
**不得**标 `signoffStatus: ready` 直至 `probe-workflow-formal-pk.mjs` exit 0。

## 烟测（同轮）

- `probe-workflow-metadata.mjs`：**exit 1**，`g0MayProceed: false`，blocker 为上述 6 模型。
- `workflow-manual-probe.mjs`：**exit 0**（仓内合同 + GetStepHistory 200）。

## 下一步

对照 [`workflow-formal-pk-manual-checklist-20261116.md`](workflow-formal-pk-manual-checklist-20261116.md) 在 **D99 / 对应 dataSetId** 空间打开表模型，确认保存成功并复跑 `probe-workflow-formal-pk.mjs`。
