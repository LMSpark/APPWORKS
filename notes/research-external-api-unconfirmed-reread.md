# 外部 API 设计 owner：未知回执后显式重读被未确认提交守卫拦截

## 现象
`tests/runtime/page/api-provider` 下 3 个文件 4 项失败，均为 `DATA_VIEW_UNCONFIRMED_SAVE`：
- api-provider.test.ts「keeps an unknown receipt blocked until explicit reread」→ `ApiProviderDesign.load(true)`
- api-config.test.ts 头部方案 → `ApiRequestHeaderDesign.load(true)`
- api-config.test.ts 公共参数 → `ApiPublicParameterDesign.load(true)`
- api-interface.test.ts → `ApiInterfaceDesign.select` 后的子视图 `refresh()`（headers 视图仍处未确认）

## 数据层合同（源码事实）
- `DataView.loadFromServer()` / `refresh()` 首行 `assertResultReplacementAllowed()`：`hasUnconfirmedSave` 为真即抛 `DATA_VIEW_UNCONFIRMED_SAVE`。
- 解除途径只有两条：经原保存入口核验（`saveQueryViews` recovering 分支），或调用方显式 `DataView.abandonUnconfirmedSave()`（不撤销服务端写入，执行器不支持时返回 false 保持待核验）。
- `discardPendingChanges()` 只丢本地草稿，不解除未确认提交。
- `DataSpaceRuntimeApi.hasUnconfirmedSave/abandonUnconfirmedSave` 由 I2 P1b 引入（台账第 127 行）。

## 同类 owner 先例
`resources/dictionary/dictionary-workspace.ts:71`：`load(discard)` 中对每个可写视图先 `abandonUnconfirmedSave()` 再 `discardPendingChanges()`，然后 `loadFromServer`。

## 根因
四个外部 API owner（provider / request-header / public-parameter / interface）的 `load(discard=true)` 只调用 `discardPendingChanges()`，未在显式重读前放弃未确认核验；P1b 收紧数据层后未同步。与本次 verify 收束改动无关。

## 修改面（候选）
- `packages/spark-lowcode-api/src/platform/resources/external-api/api-provider-design.ts` load 第48行
- `.../api-request-header-design.ts` load 第52行（headers、provider）
- `.../api-public-parameter-design.ts` load 第48行（parameters）
- `.../api-interface-design.ts` load 第69行（writable：interfaces、parameters、headers）
- 测试无需修改；其期望（未知回执阻止再次保存、显式重读后结果可见且不重放写入）与目标语义一致。
