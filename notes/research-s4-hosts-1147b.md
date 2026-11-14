# S4 导航宿主页对照 1147b00（研读锚点）

状态：approved（用户 2026-11-14 批准战役计划）

## 基准

| 项 | 值 |
|---|---|
| 本仓 HEAD | `09e081263a86887874d915961ac880d42c236018`（分支 `codex/spark-data-s1-command-safety`） |
| 参考提交 | `1147b00ee53a1476d4ee715c61368b453a215192`（`E:\r\sparkproject`） |
| 参考读取 | `git -C E:\r\sparkproject show 1147b00:<path>` |
| typecheck 基线 | 2026-11-14 `pnpm run typecheck` exit 0 |

## 页面路径差距（参考 `apps/appworks/src/ui/features/data-platform`）

| 参考相对路径 | 本仓 `src/views/features` | 五列摘要 |
|---|---|---|
| data-set-management/ui/data-set-list-page.vue | 有 | 宿主 BA 已换接；删除/实页见台账 BB 前序证据 |
| data-set-management/design/ui/data-set-design-page.vue | 有 | 宿主 BB；设计器业务队列 #2 **不在本战役** |
| database-management/ui/service-management-page.vue | 有 | BC；矩阵实页曾「部分」（密码列/字段投影） |
| database-management/table-and-view/ui/table-and-view-page.vue | 有 + 8 对话框 | BD；正式模型缺口可阻塞实页 |
| structured-config/data-dictionary/* | 有 | BF/BG；样板专题 |
| structured-config/data-code/* | 有 | BH/BI；编码编辑器规则弹窗等仍属开放项 |
| structured-config/logic-view/* | 有 | BJ/BV；SaveView 在线仍缺口 |
| structured-config/workflow-definition/* | 有 | BK/BL（结构化定义，≠ Agent WorkflowDesigns） |
| structured-config/dimension-definition/* | 有 | 导航已发布则纳入 |
| semi-structured/json-data、excel-import、pdf-inspect | 有 | BM–BQ |
| integration api（参考在 integration） | api-management-page（+ 子页源码） | BR–BT |
| system cache | cache-management-page | BU |
| 参考 data-set-auth-page | **无** | 权限专题暂缓，不迁 |

参考有、本战役排除：`application/*`、`organization/*`（部分已另批迁移）、`features/workflow` 运行域。

## 台账队列与本战役映射

| 队列项 | 当前源码状态 | 本战役动作 |
|---|---|---|
| catalog.ts 拼 JSON | `catalog.ts` 仅剩 `readStructuredConfigScope` | **已收束**；余目录配置在场景 pagedata/loader |
| staged-design-file-view attach | 逻辑视图 CT 已正式 pagedata；其余专题用各自 executor | 核验 Excel/PDF/工作流 structured 设计链，无 attach 回归 |
| 字段未绑 DataView（ledger#32） | `copy-table-dialog` 裸 input/textarea；`table-design-dialog` 工作流筛选手工 input | 波1：复制表改标准表单项；工作流筛选改 `r-text`+父级 query patch（不动 DataView 列） |
| 数据库 pagedata 内联 | 仍部分内联于 database 资源 | 波1 仅动阻塞验收项，不全量搬迁 |
| Agent 工作流整删 | 无 `AgentWorkflowDeletion` | 波9 新增命令 + 测试 + pagedata |

## 宿主层（S4 AY–CF）

`src/views/features/**` 无 `new PageRuntime`；台账 AY–BZ、CA–CF 条目标「未冻结」— 波10 统一复跑登记测试后改台账状态。

## 下一实施断点（接续本文件）

1. 波9：`AgentWorkflowDeletion` 命令资源与 `agent-workflow-deletion.test.ts`
2. 波1：`copy-table-dialog` 标准组件
3. 波10：`pnpm run verify` + 宿主/专题定向 vitest + 台账 S4 冻结句更新（不改 Cursor plan 文件）