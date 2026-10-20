状态：draft

## 任务目标

I5 迭代 2b–2c：表和视图写能力（注册物理库、建表、表/视图设计）按 dialog 切片接入 spark-data；UI 仍禁止手写字段 children。

## 2b 注册数据库（register）

- **语义**：在已选服务器下查询物理库名 → 选择未登记库 → 写入 `_base_dbInfo`（与 DBMS `dlgDb` 对齐）。
- **数据层（已落地）**：`fetchUnregisteredDatabaseNames(serverId)` → `/api/Db/getUnregisteredDb/{id}`（`database-catalog-unregistered-db.ts`）；vitest `database-catalog-unregistered-db.test.ts`。
- **待做**：独立 DataSet/命令会话 + `register-database-dialog.vue`（autoColumns 表单）；保存经 `saveChanges`；**不在** table-and-view 页直调 HTTP。

## 2c add-table / table-design / view-design

- **语义**：对照参考 hook；各 dialog 独立装配与提交链。
- **待做**：后端写合同逐项核对；方案批准后按 dialog 单切片实施。

## 验证

- 每切片：`tests/runtime/page/database/*` + 实页证据（单独 commit `notes/evidence/**`）。
