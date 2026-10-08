# 本地计算列文件持久化闭环

状态：主控验收及独立最终审查通过，限本轮九文件计算列持久化闭环。未 commit、push 或建分支；未修改 Java/UI，未向线上写入。工作树原有混合改动保留。

## 范围与前像

仅修改 active plan 指定的 9 个源码/测试文件。原字节副本在 `before/`，修改前 SHA256 在 `before-hashes.json`，最终 SHA256 在 `after-hashes.json`。这些文件在本轮开始时已有部分未提交改动，前像是本轮边界，不是 Git HEAD。

## 验证证据

- 首先新增文件合同测试，`pnpm exec vitest run packages/spark-project-model/tests/scenario/scenario-view-file.test.ts -t 'retains a local computed column'`：1 失败，原因 `columns[0].type 不属于场景视图配置`；首次生产修改后同一命令：1 通过。此两次输出仅保留在本轮工具记录，未另造日志文件。
- 首轮五套聚焦测试（四个改动套件及原生 `computed-query.test.ts`）：5 文件、124 测试通过。首轮命令输出仅保留在本轮工具记录。
- 九文件精确 ESLint、根 `pnpm run typecheck`、`pnpm run verify:ai-codegen` 均退出 0；AI codegen 报告扫描 1012 文件。命令输出仅保留在本轮工具记录。
- 九文件 `git diff --check` 退出 0。全仓 `git diff --check` 存在其他预存 dirty 文件尾随空格，不属于本轮九文件。

## 已验行为

真实 `ProjectWorkspace`/`ScenarioViewFile` 保存计算列配置，新工作区重开，经正式模型装配为 `DataSet`；GetData 请求只含正式字段，查询行本地计算、计算列只读，真实 `view.saveChanges()` 请求不含计算列。两个模型可各自拥有同名本地列。数据库后来出现同名正式输出时装配拒绝；清除文件定义后重开不残留。`stageDefinition` 在草稿写入前拒绝计算列作为远端排序、过滤或树身份字段；`stageView` 允许本地显示字段且拒绝正式输出同名。直接原生绑定也拒绝正式字段冲突。

本轮未执行线上配置保存或业务数据写入；真实单目标线上只读验证已由主控执行并通过，见下文。

## 独立审查修正

审查探针发现：原生 DataTable 同时含正式 `caption` 与同名本地计算列时，视图投影可遮蔽后者，使原 `bindModelView` 只检查 `view.columns` 而漏判冲突。将该原生构造加入既有 alias 套件，先得到 1 个预期失败；修正为检查所属 DataTable 的全部列后，同一用例通过。红、绿日志分别为 `projection-collision-red.log`、`projection-collision-green.log`。修正后五套聚焦测试 125/125 通过，九文件精确 ESLint 退出 0，真实输出在 `review-five-suite.log` 和 `review-nine-file-lint.log`。根 typecheck 与 AI codegen 的审查后最终复核由主控执行。

## 主控最终验收

- 主控首次独立五套 124/124（`root-focused.log`）与受影响视图编辑/正式查询/保存/参数回归 215/215（`root-regression.log`）通过；投影遮蔽修正后的五套由 writer 实跑 125/125，独立 reviewer 原探针转绿 1/1。未无故重复整套测试。
- 最终根类型、AI codegen 分别退出 0，日志 `root-final-typecheck.log`、`root-final-ai-codegen.log`；九文件精确 lint 已通过。最终九文件哈希逐项匹配 `after-hashes.json`，主控记录 `root-final-hashes.json`；原字节哈希也全部核对。精确前像差分为 `.superpowers/sdd/plan-data-space-metadata-dataset/computed-persistence-final.patch`。
- 独立最终审查见 `.superpowers/sdd/plan-data-space-metadata-dataset/computed-persistence-review-final.md`；首轮退回报告保留历史，不覆盖红态事实。
- `online-computed-persistence.mjs` / `online-result.json`：真实单目标会话返回 1 空间 / 7 模型 / 119 字段 / 0 关系；通过 session.stageDefinition 临时把本地列定义装配进目标 shif 表及其所有 DataView，正式列保持原样。同名候选明确拒绝且不改当前草稿，恢复原文件后 dirty=false，临时列消失，各 DataSet 均释放。登录后 141 次请求全部受只读 API allowlist 约束，writes=0，没有调用线上 save。此证据证明真实定义装配和恢复，不冒充线上公式持久化。

完整 DataSet 仍有原生配置缺项与多父字段输入级联待落实，执行计划保持 implementing。候选经验留本计划/证据，未擅自写入 knowledge 或个人记忆。
