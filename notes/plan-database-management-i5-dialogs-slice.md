状态：implementing

## 任务目标

I5 迭代 2b–2c：表和视图写能力（注册物理库、建表、表/视图设计）按 dialog 切片接入 spark-data；UI 仍禁止手写字段 children。

## 2b 注册数据库（register）— done

- **语义**：在已选服务器下查询物理库名 → 选择未登记库 → 写入 `_base_dbInfo`（与 DBMS `dlgDb` 对齐）。
- **数据层**：`databaseCatalogQueryUnregisteredDbNames` → 命令 DataView.refresh（`lowcode-database-dataset-extensions` + spark-data `bindDataSetReadonlyCommandQuery`）。
- [x] [`register-dialog.vue`](../../src/views/features/data-platform/database-management/table-and-view/ui/register-dialog.vue) + `database-catalog-db-view-ops`（`_base_dbInfo` 经 `saveChanges`）
- [x] vitest：`database-catalog-db-view-ops.test.ts`、`database-catalog-unregistered-db.test.ts`

## 2c add-table — done（首条写切片）

- [x] [`add-table-dialog.vue`](../../src/views/features/data-platform/database-management/table-and-view/ui/add-table-dialog.vue) + `database-catalog-table-view-ops`
- [x] 未登记表名：`databaseCatalogQueryUnregisteredTableNames` + `/api/Db/getUnregisteredTable`
- [x] vitest：`database-catalog-table-view-ops.test.ts`
- add-table 子计划已并入本文件（`plan-database-management-i5-add-table-dialog.md` 已删除）。

## 2c table-design / view-design — 首版

- [x] [`table-design-dialog.vue`](../../src/views/features/data-platform/database-management/table-and-view/ui/table-design-dialog.vue)、[`view-design-dialog.vue`](../../src/views/features/data-platform/database-management/table-and-view/ui/view-design-dialog.vue)：字段目录经 `Base_TblField` 命名视图 autoColumns 只读展示；完整字段写回仍随后端 `/api/Table/*` 合同扩展。

## 验证

- 每切片：`tests/runtime/page/database/*` + 实页证据（`notes/evidence/database-management-i5/**` 单独 commit）。
