# 逻辑视图（logic-view）— I6 v3 研读卡

> FormKey：`EB720370EF06A5A656838F87E0716D6B`。DATAFLOW §839：目录 `Base_DataViewList`；设计 JSON 经 ViewData 服务，非 pagedata 真源。

## 1. 调用分类

| # | 能力 | 类别 | 落点 |
| --- | --- | --- | --- |
| 1 | 目录 page/save/remove | 模型查询/保存 | catalog DataView |
| 2 | 设计 read/write | 专用 API | `/api/ViewData/GetView`、`SaveView` |
| 3 | 预览 | 专用 API | `previewOutput` 合同（MVP 登记缺口） |

## 2. 本仓页面

- `logic-view-list-page.vue`
- `logic-view-design-page.vue` + `model/use-logic-view-design.ts`

## 3. 缺口

`api-gaps.json` → `logicView.previewNode` 等高级节点类型。
