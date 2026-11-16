# D99 手工烟测清单（R16）

**前置**：`probe-workflow-metadata.mjs` 退出码 0（`g0MayProceed`）；仓内 workflow 场景不要求远端 SysForm。pagedata `modelId` 已由 G0 写入。

在已登录 D99 蓝图下逐项验证，每项记录 **pass / fail** 与一句话现象（失败附控制台或 Network 错误）。

| Key | 步骤 | SPARK Data / 标准组件核对 |
|-----|------|---------------------------|
| `workbenchFourTabs` | 打开流程工作台 → 切换 **待办 / 已办 / 共享 / 我发起** | 四 tab 对应 `flow-workbench` pagedata（数据空间 `A5BAD…`）；D99 若无菜单：隐藏页 + `__sparkNavigationId=E328FBBF518141973C575D612CD75151`（与监控导航身份一致） |
| `designNodeAuthSaveReopen` | 流程设计：选节点 → **节点权限** 增改 → **保存** → 关页重开 | 保存走 DataSet.saveChanges；FunctionNodeAuth 表绑定设计 pagedata |
| `runSubmitOrBack` | 工作台/监控 → **办理页** → **提交** 或 **退回** 其一 | Flow 命令仅在 manage 层；表单/步骤历史绑 DataView |
| `detailToRunPage` | 监控/详情 → **前往办理** | query 与 `buildFlowRunPageRoute` 一致，办理页能装配 |

**G0 后建议同次登录抽检**

- 流程模型列表首屏有数据（`WFM_FLOW_MODLE` modelId 生效）
- 设计对话框可打开，无模型绑定/查询身份错误

**不在本轮**：详情强退写入、转办/协办/委派。

## 凭证（G0 自动化，与手工分开）

1. `node tools/workflow/print-spark-env-status.mjs` 应输出 `G0 ready: yes`。
2. `.env.local` 示例：`SPARK_APP_ID=D99A1DCE9894698799101EFD70F8FC76`；`SPARK_TOKEN` 从已登录 SPA 的 Network 里任意 API 的 Bearer 值复制（勿提交仓库）。

**合同（非 SPA）**：`node tools/workflow/workflow-manual-probe.mjs` → `manualContract`（写入 `workflow-manual-probe-*.json`）。

**SPA 四格（签收硬条件）**：`pnpm dev`（5273）+ D99 蓝图逐项操作 → `node tools/workflow/workflow-spa-smoke.mjs` 或手写 `notes/evidence/workflow-spa-smoke-*.json`（含 `manualSpa` 四键与可选 `networkSamples.getStepHistory`）。`workflow-d99-smoke.mjs` 只合并 **`manualSpa`**，不得用 vitest/合同冒充四格 pass。