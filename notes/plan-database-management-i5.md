状态：draft

## 任务目标

按整合计划 I5，将 database-management 六页落到 `src/views/features/data-platform/database-management/**`，替换 `DBMS.vue` 多入口包装，矩阵 6 行达到可验收的语义/合同/页面标准；最终删除或收窄 `src/views/app/DBMS.vue`。

## 阶段与业务语义（待首屏范围确认后细化）

- **服务器管理**（service-management-page）：注册/编辑/连接测试/列表（参考 ~660 行）。
- **表和视图**（table-and-view-page + add/register/table/view 四个 dialog）：列表、注册物理对象、表设计、视图设计（参考 hook 合计 >3k 行）。
- **本仓 DBMS 已交付子集**：catalog 只读浏览 + 治理 blocked 的 mutation 入口 + 少量 `/api/Db` 调用。

## 影响范围（预估，随首屏裁剪）

- 新增：`src/views/features/data-platform/database-management/**`
- 改：`config/navigation/vue-pages.json`（`source` 指向新页面，**path 不变**）
- 改：`tests/app/config/vue-page-registry.test.ts`、相关 auth-nav
- 删/弃：迁移完成后 `DBMS.vue`（或保留极薄 re-export 一段过渡期—待决策）
- 可能新增：`packages/spark-lowcode-api` 内 database/catalog mutation 门面（仅在有正式后端合同时）

## 技术方案（草案）

1. 研读参考 inventory + 运行 API（夹具/在线）→ 每页输入输出与持久化边界。
2. 选定 **第一个完整页面** 作为 I5 样板（见反向提问）。
3. 按 AGENTS 0.2 路径对齐 features 目录；组件优先 spark-component；数据走正式 API 层，页面不散落 `/api/Db`（除非合同仅在 lowcodeHttp）。
4. 首屏验收通过后，按 dialog 依赖顺序迁移其余 5 块；每步更新矩阵与 registry 测试。
5. 全六页完成后删除 DBMS  monolith。

## 兼容性

- 蓝图 URL `/DataBaseManage/...` 与 features 路径须继续可导航。
- `/dbms` 是否保留为快捷入口（redirect 或同页）待决策。

## 验证计划

- `pnpm run typecheck`
- `pnpm run verify:page-thin`（新页 TS 收敛）
- 新增/扩展 vitest：registry + 首屏业务夹具（对齐参考关键保存/取消用例）
- 人工：隔离 T 下首屏完整操作与持久化回读（写能力启用后）

## 风险项

| 风险 | 缓解 |
| --- | --- |
| 参考写能力 vs 本仓 governance blocked | 分阶段：先只读迁移或先对接已确认 API |
| 无 TableAndView API 封装 | 阶段 1 核后端 + 在 spark-lowcode-api 增门面，禁止页面直拼 |
| 6 页一次过大 | 严格单页交付；DBMS 暂留至首屏等价 |

## 阻塞

- **首屏交付范围**未确认（plan draft，待用户审核）。
