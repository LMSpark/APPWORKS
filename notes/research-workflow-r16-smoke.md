# Workflow R16 烟测签收研读（锚点）

## 工具链（R16 lingmacn）

- `get-data-page.mjs`：解析 `Result.data.Items`（与 spark-lowcode-api 一致）
- `workflow-metadata-models.mjs`：分页扫描 `Base_DataModel` + 客户端 `dataSetId`/`Name` 筛选
- `probe-workflow-metadata.mjs`：`g0MayProceed` = 模型可读 **且** `formalTablePrimaryKey.ready` **且** 远端 pagedata（非 repository 场景）；GetData 运行时探测失败不中断写 evidence
- `workflow-r16-close-loop.mjs`：probe → G0 apply → vitest → typecheck → verify:rules → manual-probe → smoke（**manualSpa 全 pass + signoff ready** 才 exit 0）
- `workflow-d99-smoke.mjs`：`manualContract` 与 `manualSpa` 拆分；**`signoffStatus: ready` 仅当** G0 pass、GetStepHistory **Code=200**、SPA 四格 pass、门禁全绿
- `workflow-spa-smoke.mjs` / `workflow-spa-evidence.mjs`：本仓 `pnpm dev` + lingmacn 浏览器四格证据

## 状态（2026-11-16 严格签收）

- **根因（已修）**：烟测误读 `Result.Items` 导致误判 0 行；误把 workflow 仓内场景的远端 SysForm 404 当发布阻塞
- **G0 modelId**：可读（`workflow-g0-read-*.json`；pagedata 已写入 `modelId`）
- **probe**：`g0MayProceed: false` 直至 lingmacn 表模型 `PrimaryKeyFields` 补齐（`workflow-g0-probe-*.json` → `publishBlockers`）
- **manualContract**：`workflow-manual-probe`（pagedata 合同 + GetStepHistory）；**workbench 四视图** 读 `flow-workbench/pagedata`（A5BAD），非 flow-monitor
- **manualSpa**：**pending**（须 `workflow-spa-smoke-*.json`；合同探测不得写入 `manualSpa`）
- **签收**：`signoffStatus: awaiting-spa`（见 `workflow-smoke-r16-20261115.json`）；**禁止**在未完成 SPA 四格前标 ready 或开 R17
- **SPA（2026-11-15）**：`workflow-spa-smoke-20261115.json` — 登录 pass；GetStepHistory **API 200**；四格 **fail/pending**（流程模型列表「pagedata 不属于当前场景」、监控「正式模型集合不完整」、工作台无蓝图入口）
- **SPA 阻断修复（2026-11-16）**：仓内 `__SCENARIO__` 置换；`flow-monitor` 收窄为 E328 登记模型；`flow-workbench` 场景 `A5BAD…`；办理/详情/工作台 `identityHost=flow-monitor`（`enterprise` scope）；`__sparkNavigationId=E328` 随路由注入
- **浏览器复测（2026-11-16）**：见 `workflow-spa-smoke-20261116.json` — 监控 pass；四格仍 fail。导航身份已修复；**阻塞转为 lingmacn 正式表模型**：`87F0`/`A5BAD`/`6E462` 内全部「数据库表」在 `Base_DataModel.PrimaryKeyFields` 为空 → `readModel`/`View_TblList` 主键链失败（非 pagedata 字段清单问题）
- **探测**：`node tools/workflow/probe-workflow-formal-pk.mjs` → `notes/evidence/workflow-formal-pk-probe-*.json`；明细 `probe-workflow-formal-pk-detail.mjs` → `workflow-formal-pk-detail-*.json`
- **修复清单**：`notes/evidence/workflow-lingmacn-formal-pk-repair.md`（14 个表模型，建议 `PrimaryKeyFields=rowid`）
- **待签收**：实服按清单修复后 `probe-workflow-formal-pk.mjs` exit 0 → 5273 四格 → `workflow-r16-close-loop.mjs`
- **仓内收口（2026-11-16）**：manual-contract/workbench pass；vite 忽略 `notes/**`；typecheck/verifyRules/workflow vitest 绿；**签收复验**：用户称 PK 已齐但探测仍 14 缺口（`workflow-formal-pk-verify-20261116.md`）；**signoff blocked**
- **Tier A/B API（2026-11-16 下午）**：Tier A 写回 5 模型；Tier B 写回 `FunctionNodeAuth`；`A5BAD` Batch 500 → 设计器；手工清单 `workflow-formal-pk-manual-checklist-20261116.md`；探测余 **6** 缺口
- **烟测（2026-11-16 12:47）**：用户称设计器已齐但 **6 项 PK 实服仍空**（`workflow-formal-pk-verify-20261116.md`）；`manual-probe` pass；`g0MayProceed` false；`signoff=blocked`
- **GetStepHistory**：`workflow-step-history-sample.mjs`（Waiting 样本 + `wfId`/`stepId`）

## 命令

```bash
# R16 全链（PK → G0 → close-loop）
node tools/workflow/workflow-r16-finish.mjs --refresh-detail --print-checklist
node tools/workflow/workflow-r16-finish.mjs --apply-tier-b --apply-tier-a
node tools/workflow/workflow-r16-finish.mjs --pk-only          # formal-pk exit 0 后仅跑后续链

node tools/workflow/apply-workflow-formal-pk-tier-b.mjs [--apply]
node tools/workflow/apply-workflow-formal-pk-tier-a.mjs [--apply]

node tools/workflow/workflow-r16-close-loop.mjs
node tools/workflow/probe-workflow-metadata.mjs
node tools/workflow/run-g0-apply.mjs
node tools/workflow/workflow-d99-smoke.mjs
```

## 证据

- `notes/evidence/workflow-smoke-r16-20261115.json`
- `notes/evidence/workflow-g0-probe-20261115.json`
- `notes/evidence/workflow-g0-read-20261115.json`