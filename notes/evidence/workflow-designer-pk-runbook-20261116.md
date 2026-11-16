# Workflow 正式主键：浏览器设计器写回剧本（D99 @ 5273）

> 每完成 1–2 张表后：`node tools/workflow/probe-workflow-formal-pk.mjs`\
> 保存后等待 60s 再探（lingmacn 缓存）。

## 前置

1. `pnpm dev`（默认 `http://127.0.0.1:5273`）
2. 登录与 `.env.local` 相同租户/用户
3. 进入应用 **D99**（`SPARK_APP_ID`）

## 导航

| 步骤 | 路径 |
| --- | --- |
| 空间目录 | `/features/data-platform/data-set-management/ui/data-set-list-page` |
| 空间设计 | `/features/data-platform/data-set-management/design/ui/data-set-design-page?scenarioId=<dataSetId>` |

`scenarioId` 即下表「空间 ID」。

## 按空间保存（当前 6 缺口）

### `87F0EF6AD1B64D67FFE597E7E3285994`（flowModelList）

| 模型 | modelId | 操作 |
| --- | --- | --- |
| Base_UserInfo | `87F0EF6AD1B64D67FFE597E7E3285994p001` | 字段 **rowid** 唯一 `IsPKey=1`；模型 **PrimaryKeyFields=rowid**；保存空间 |

### `6E462C4A39EE0D96F4D1A28FFE887C89`（flowDesign）

| 模型 | modelId | 操作 |
| --- | --- | --- |
| WFM_WORKFORM | `6E462C4A39EE0D96F4D1A28FFE887C89p012` | 输出主键与 **rowid** 对齐；**PrimaryKeyFields=rowid** |

### `A5BADCEE11D2438CB9E75C2453A220A6`（flowWorkbench）

| 模型 | modelId | 操作 |
| --- | --- | --- |
| WFOBJ_FLOW_Waiting | `1ae5bacc-9124-4acf-8b75-a78c61298fb3` | **PrimaryKeyFields=rowid** |
| WFOBJ_FLOW_RELATIONLINE_STEP | `8b5ef80f-6dfc-4769-9bbe-34c58128c73c` | 去掉 `lingma_sys_ent` 的 IsPKey；**PrimaryKeyFields=rowid** |
| WFOBJ_FLOW | `3c0d6640-9c84-4894-9996-cf1418bd4106` | **PrimaryKeyFields=rowid** |
| WFOBJ_FLOW_FORM | `b831c094-07e0-478d-b248-7a472d47b254` | 去掉 `WFOBJID` 的 IsPKey；**PrimaryKeyFields=rowid** |

## 诊断

```bash
node tools/workflow/diagnose-workflow-formal-pk-persist.mjs
```

## 收口

```bash
node tools/workflow/probe-workflow-formal-pk.mjs          # exit 0
node tools/workflow/workflow-r16-finish.mjs --pk-only
```
