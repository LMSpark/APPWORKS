# Tier A API 写回边界（2026-11-16）

`apply-workflow-formal-pk-tier-a.mjs --apply` 经 `BatchTableOperateRequestByCRUD` + `x-FormKey=8D1AB14D…`（元数据设计）：

## 已成功（实服回读 `PrimaryKeyFields=rowid`）

- `87F0`：`WFM_FLOW_MODLE`
- `6E462`：`WFM_FLOW_NODE`、`_Base_FunctionNode`、`Base_AppSystemList`
- `E328`：`WFOBJ_FLOW`（`cefff969-…`）

## API 返回 500「待修改数据不存在、已删除或无权操作」

- `A5BAD` 工作台：`WFOBJ_FLOW_Waiting`（`1ae5bacc-…`）、`WFOBJ_FLOW`（`3c0d6640-…`）
- 即使用完整行 + `lingma_sys_key`、仅元数据设计 FormKey 亦失败；**须在 lingmacn 设计器对该空间表模型手工保存** `PrimaryKeyFields=rowid`。

## 残余缺口

`probe-workflow-formal-pk.mjs` 在 Tier A 部分完成后仍 >0：Tier B/C 字段层 + 上述 A5BAD 手工项。见 `workflow-formal-pk-repair-tiers-20261116.md`。