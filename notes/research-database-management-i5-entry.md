# I5 database-management 入口（2026-10-22 收束）

> 整合计划 **I5**；v3 七步流与矩阵见 [`plan-appworks-integration.md`](plan-appworks-integration.md)。载体汇总 [`research-database-management-i5-hub.md`](research-database-management-i5-hub.md)。

## 六页落点（已对齐 `src/views/features/data-platform/database-management/**`）

| 参考路径 | 本仓 | v3 语义卡 |
| --- | --- | --- |
| `database-management/ui/service-management-page.vue` | 同路径 | [`service-management-v3`](research-database-management-i5-service-management.md) |
| `database-management/ui/database-management-hub.vue` | 同路径（hub 壳） | [`management-hub-v3`](research-database-management-i5-management-hub.md) |
| `table-and-view/ui/table-and-view-page.vue` | 同路径 | [`hub-v3`](research-database-management-i5-hub.md) |
| `table-and-view/ui/add-table-dialog.vue` | 同路径 | [`add-table-v3`](research-database-management-i5-add-table.md) |
| `table-and-view/ui/register-dialog.vue` | 同路径 | [`register-dialog-v3`](research-database-management-i5-register-dialog.md) |
| `table-and-view/ui/table-design-dialog.vue` | 同路径 | [`table-design-v3`](research-database-management-i5-table-design.md) |
| `table-and-view/ui/view-design-dialog.vue` | 同路径 | [`view-design-v3`](research-database-management-i5-view-design.md) |

`DBMS.vue` 包装已移除；数据链为 **单 FormKey catalog DataSet + spark-data**。

## 验证基线

- `pnpm exec vitest run tests/runtime/page/database` → **84** 例（2026-10-22）。
- 实页仍阻塞 [`live-pilot-formal-model-gap.json`](evidence/database-management-i5/live-pilot-formal-model-gap.json)（五表正式模型登记，非前端可关）。

## 仍开放（不冒充 I5 退出）

| 项 | 说明 |
| --- | --- |
| add-table vs 参考 `saveAddTable` 字段批 | 目录插表 + 表设计；见 add-table-v3 |
| 表/视图设计 AI #9/#8 | [`ai-capability-gap-v3`](research-database-management-i5-ai-capability-gap.md) |
| 矩阵「语义/页面=通过」全六行 | vitest 主路径已齐；语义/实页列待 formal 模型与产品签核 |

## 下一迭代

**I6 structured-config**：已收束（字典 58 + structured-config 40 vitest；hub [`research-structured-config-dictionary-i6.md`](research-structured-config-dictionary-i6.md)）。

**I7 semi-structured**：入口 [`research-semi-structured-i7-hub.md`](research-semi-structured-i7-hub.md)；计划 draft [`plan-semi-structured-i7-full.md`](plan-semi-structured-i7-full.md)。
