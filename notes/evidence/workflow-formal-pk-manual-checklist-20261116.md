# Workflow 正式主键手工清单

生成于 2026-11-16T04:47:32.914Z

缺口 **6** 项；Tier C 及 `designerOnly` 模型须在 lingmacn 设计器完成。

## 设计器必选（designerOnly）

### flowWorkbench · WFOBJ_FLOW_Waiting

- modelId: `1ae5bacc-9124-4acf-8b75-a78c61298fb3`
- scenarioId: `A5BADCEE11D2438CB9E75C2453A220A6`
- hint: 保存模型 PrimaryKeyFields=rowid（字段层已唯一标记 rowid）
- [ ] designer:保存模型 PrimaryKeyFields=rowid

### flowWorkbench · WFOBJ_FLOW_RELATIONLINE_STEP

- modelId: `8b5ef80f-6dfc-4769-9bbe-34c58128c73c`
- scenarioId: `A5BADCEE11D2438CB9E75C2453A220A6`
- hint: 修正字段 IsPKey（当前多个：rowid, lingma_sys_ent）；再设 PrimaryKeyFields=rowid
- [ ] api:Base_DataModel_Field 取消 lingma_sys_ent 的 IsPKey
- [ ] designer:保存模型 PrimaryKeyFields=rowid

### flowWorkbench · WFOBJ_FLOW

- modelId: `3c0d6640-9c84-4894-9996-cf1418bd4106`
- scenarioId: `A5BADCEE11D2438CB9E75C2453A220A6`
- hint: 保存模型 PrimaryKeyFields=rowid（字段层已唯一标记 rowid）
- [ ] designer:保存模型 PrimaryKeyFields=rowid

### flowWorkbench · WFOBJ_FLOW_FORM

- modelId: `b831c094-07e0-478d-b248-7a472d47b254`
- scenarioId: `A5BADCEE11D2438CB9E75C2453A220A6`
- hint: 修正字段 IsPKey（当前多个：rowid, WFOBJID）；再设 PrimaryKeyFields=rowid
- [ ] api:Base_DataModel_Field 取消 WFOBJID 的 IsPKey
- [ ] designer:保存模型 PrimaryKeyFields=rowid

## Tier C

### flowModelList · Base_UserInfo

- modelId: `87F0EF6AD1B64D67FFE597E7E3285994p001`
- scenarioId: `87F0EF6AD1B64D67FFE597E7E3285994`
- hint: 保存模型 PrimaryKeyFields=ID
- [ ] designer:字段主键与 rowid 对齐
- [ ] designer:保存模型 PrimaryKeyFields=rowid

### flowDesign · WFM_WORKFORM

- modelId: `6E462C4A39EE0D96F4D1A28FFE887C89p012`
- scenarioId: `6E462C4A39EE0D96F4D1A28FFE887C89`
- hint: 保存模型 PrimaryKeyFields=ROWID
- [ ] designer:字段主键与 rowid 对齐
- [ ] designer:保存模型 PrimaryKeyFields=rowid
