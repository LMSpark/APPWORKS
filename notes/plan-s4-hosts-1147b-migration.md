状态：blocked（2026-11-14 战役编排收尾；S4 台账 AY–CF **未冻结**，实页五列未全签）

## 任务目标

在参考 `1147b00ee53a1476d4ee715c61368b453a215192` 下，完成台账 S4 导航宿主页（AY–BT、CA–CF、CH–CR 接续）对照参考的剩余迁移与冻结验收；不含蓝图页、features/workflow 运行域、设计器队列 #2 全量退役。

## 依据

- 研读：[research-s4-hosts-1147b.md](research-s4-hosts-1147b.md)
- 方法论： [plan-appworks-integration.md](plan-appworks-integration.md) v3 单页七步（矩阵 superseded）
- 事实源：[data-space-retirement-ledger.md](data-space-retirement-ledger.md)

## 波次进度

| 波次 | 状态 | 备注 |
|---|---|---|
| 0 基线 | 完成 | [research-s4-hosts-1147b.md](research-s4-hosts-1147b.md)；typecheck 0 |
| 1 横切 | 部分 | catalog 已收束；copy-table 暂存对话框仍待 command 视图 |
| 2–8 域页面 | 回归中 | 定向 vitest 批次见波10证据 |
| 9 Agent 删除 | 完成 | `deletion.ts` + 页面入口 + 3 项测试 |
| 10 冻结 | blocked | typecheck 0；workflow 55/55；`verify`/`build:fe` 与全量 S4 vitest 待用户收口；台账不写「已冻结」 |

## 验证计划

- 每波：`pnpm run typecheck`、改动 ESLint、定向 vitest；产品变更 `pnpm run verify:rules`
- 收官：`pnpm run verify`、`pnpm run build:fe`
- 实页：有登录态时 data-chain-smoke；否则夹具与台账分列

## 风险

- 正式模型未登记：fail-closed，不猜后端
- 工作流目录删除无原子 API：命令分步删除 + 遇败即停（台账 CS）