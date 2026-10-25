# 数据库管理组合入口（database-management-hub）— v3 语义卡

> **历史错误方案，已删除**：本文描述的数据库管理 Hub、tiered resolve、full/serverOnly 档位和子页 context 已被当前 B2 合同否定并从产品移除。以下正文只作历史记录，不按其继续实施；当前入口与范围只读 `notes/data-space-retirement-ledger.md` 的“2026-10-25 B2 数据库目录依赖与关系编辑续核”及其后续更新。

> 路径：`database-management/ui/database-management-hub.vue`；子页 `service-management-page` + `table-and-view-page`。

## 1. 语义卡

| 项 | 内容 |
| --- | --- |
| 入口 | 导航 blueprintScenarioId → 一次 tiered resolve FormKey |
| 目的 | 同一 Base_DataSet.rowid 下切换「服务器 / 表和视图」 |
| 输入 | preferredScenarioId、navigationNodeId、请求 scope |
| 输出 | `DATABASE_CATALOG_CONTEXT` provide；full / serverOnly tier |
| 取消 | 切换 tab 不销毁 KeepAlive 子页实例 |
| 异常 | 五表 batch 失败 → serverOnly + 表和视图页 blocked 提示 |
| 下游 | 两子页 inject 后共用 resolvedScenarioId |

## 2. 调用分类

| # | 能力 | 落点 | 验收 |
| --- | --- | --- | --- |
| 1 | FormKey 解析 | `resolveDatabaseCatalogScenarioTiered` | hub vitest tier/full |
| 2 | 子页数据 | 各自 LowcodeDatabase* loadCatalog | 子页 vitest |
| 3 | 读模型 batch 去重 | hub resolve + 子页 `catalogLoadOptions` | hub vitest batch 次数 |

## 3. 与子 research 关系

- 服务器 tab → [`research-database-management-i5-service-management.md`](research-database-management-i5-service-management.md)（注册/编辑/删除/测连）
- 表和视图 tab → [`research-database-management-i5-hub.md`](research-database-management-i5-hub.md)（载体页 + 对话框）
