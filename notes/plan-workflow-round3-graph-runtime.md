状态：superseded（2026-11-15，由 `workflow-round-convergence` 覆盖：完整办理页 + G0/G2/G3 同批收敛；本计划「办理写入单列授权」不再执行。）

## 任务目标

在 Round2「列表→设计对话框→节点/连线只读表」已验收基础上，接回流程图编辑与运行态只读深化；办理写入与加签命令单列授权。

## 阶段与业务语义

- **G0 前置（烟测补验）**：D99 已登录蓝图下补验流程列表、设计对话框、监控→详情（只读）；补全 `WFM_*` 实服 `modelId` 回写 pagedata。
- **G1 图编辑载体**：对照参考 `flow-design-page.vue`（SchemaGraph）与本仓 `RendererGraph`，确定首包实现路径（迁移窄组件 vs 复用 `r-graph`）。
- **G2 FlowDesign 资源层**：从 `E:\r\sparkproject` `FlowDesign.ts` 抽取「图 JSON 加载/保存、节点边元表同步」合同，落 `src/lowcode/resources/system/workflow/manage/`，Vue 仅调用资源与 spark-data。
- **G3 设计页 UI**：替换 SchemaGraph 占位；节点/边面板从只读表升级为与图选中联动（保存仍走 DataSet）。
- **G4 运行态只读**：`flow-run-detail-page` 接步骤/轨迹 DataView（图只读）；`flow-run-page` 保留占位直至办理命令合同明确。
- **G5 FlowAppendUser**：命令资源 + 视需要注册 `flow-append-user` 工具页（非菜单可仅命令挂载）。
- **明确不在首包**：Submit/Back 等办理写入验收、工作台待办实查（Round4）。

## 影响范围（预估）

- `src/views/features/workflow/flow-model/design/**`
- `src/views/features/workflow/flow-runtime/**`
- `src/lowcode/resources/system/workflow/manage/**`
- `config/pages/workflow/**`
- 可选：`src/views/components/SchemaGraph/**`（若走迁移方案）
- `tests/runtime/page/structured-config/workflow/**`

## 技术方案（有序）

1. 更新 `notes/research-workflow-approval.md`：图数据文件合同、参考 API 清单、与本仓 DataView 映射表。
2. G0：授权下只读查询回写 modelId；D99 烟测三项记台账。
3. G1 决策记录（方案二选一）后实现图壳 + 只读加载。
4. G2 资源：加载/保存拆分函数 + vitest（HTTP 夹具）。
5. G3–G4 页面接线 + mount 测试扩展。
6. 阶段验收：`typecheck`、`verify:rules`、workflow vitest 套件、D99 设计图可见 + 监控详情字段可读。

## 验证计划

- `pnpm run typecheck`
- `pnpm run verify:rules`
- `pnpm exec vitest run tests/runtime/page/structured-config/workflow/flow-*.test.ts`（随实施扩展）
- D99：设计图渲染 + 节点表与图选中一致（只读）；监控→详情列表字段

## 风险项

- SchemaGraph 与 RendererGraph 语义差距可能导致非 1:1 交互，须按参考页逐项对齐验收。
- 图保存涉及 platformFile 与多表提交，须分源确认回执，不假定事务。
- modelId 未对齐时设计场景查询仍可能形态异常。

## 审核

待用户回复「通过/开工」后状态改为 `approved` 并开始 G0–G1。