# 页面流程回归与验证门禁恢复

2026-10-09，主控独立执行，接续用户“继续”。起点为已推送的 `b3dd6ef927a3a12364d3aa4908aa515857d4c400`。本轮没有新增产品功能、修改 Java、恢复设计器界面或请求线上读写；本轮变更未提交推送。

## 结论

完整根测试 **211 套件 / 2789 项全部通过**，458.84 秒，退出 0。此前三个旧页面流程失败已消除；没有跳过用例、删除业务断言或替换真实组件。三个多次挂载、保存、重开的完整流程从原5000ms调整为明确15000ms；其他测试及根配置保持原上限。此结果不代表产品性能改善，也不代表完整 DataSet 或 AppWorks 已交付。

类型、全仓 Lint 及 `verify` 所包含的各门禁子项均有当前通过记录。**总命令本轮两次仍以失败退出**，分别暴露旧文档命名和消费清单过期；修复后从失败子项续跑全部剩余门禁，退出0，未为了得到一条总命令绿字重复前面已通过的昂贵检查。AI模型规范保留2条非阻断警告；不宣称无警告或更严格的语义缺口门禁通过。

## 三条页面流程的诊断与修正

- 原失败及修改前源码隔离对照在 `../legacy-table-positions/` 保留。计时注入显示流程持续推进：命名视图第三次挂载后仍在执行，关系创建独立流程约6秒，并非某个请求永久挂起。
- 5000ms超时不终止原异步函数；它仍可能继续使用或清理全局组件环境。关系创建、编辑删除两条用例原本只在成功尾部卸载实例，异常路径未清理。
- 原组件和原断言在15000ms诊断预算下3项完整通过。保留表格替身的探针仍超时，已放弃；该探针未改进正式代码。
- 正式修正只在既有 `tests/runtime/page/design/data-space-design-four-file.test.ts`：3项指定 `completePageFlowTimeout`；两个关系用例finally卸载；重开后用实际关系内容断言等待，取代固定两次flush。没有修改生产实现。

诊断日志：`named-view-trace.log`、`relation-trace.log`、`table-boundary-probe.log`、`completion-probe.log`。正式验证不使用计时注入配置或CLI超时覆盖。

## 门禁修正

1. `eslint.config.js` 仅增加 `notes/evidence/**` 全局忽略。原243条错误全部为历史源码快照不属于当前 TypeScript 工程；源码和测试规则没有放宽。原失败见 `verify-before.log`。
2. 11份历史Markdown规范文件名，正文SHA256全部不变。精确路径与哈希见 `evidence-paths.json`、`evidence-rename-hashes.json`；三处真实引用同步调整，原证据结论不变。文档治理规则未修改。
3. 通过既有 `generate:lowcode-contracts` 同步静态消费者清单，从150到153，包含已存在引用及行号修正。`lowcode-endpoint-ledger.json` 逐字节未变，仍587个端点。生成器和Java源码未修改。新增引用不等于新增或成功执行后端请求。
4. 主计划和原生合同研读中的 query 级联/节点位置旧状态已按当前源码及既有证据修正，避免把已完成事项当作未实现再次开发。

## 当前验证记录

| 验证 | 结果 | 证据 |
| --- | --- | --- |
| 实施前类型基线 | 通过 | typecheck-baseline.log |
| 修正后三条原流程，无CLI覆盖 | 3通过 / 99未选择 | focused-after.log |
| 完整页面文件 | 102通过，121.13秒 | full-page-after.log |
| 完整根回归 | 211套件 / 2789项通过，458.84秒 | root-after.log |
| 类型、全仓Lint、架构、依赖、页面、AI代码规则 | 通过，AI扫描1027文件 | verify-final.log |
| 文档治理 | 总门禁时335文件通过；本结果落盘后336文件通过 | verify-final.log、docs-final.log |
| ClassModel包Lint/类型及专项测试 | 4套件 / 49项通过 | verify-final.log |
| 工作流设计检查 | 通过 | verify-final.log |
| 消费清单、AI模型规范、蓝图SSOT、接口协议、目录门禁 | 全部退出0；AI模型规范2条警告 | verify-remaining.log |
| 冻结范围与证据内容 | 源码/测试哈希不变，11份改名正文不变，端点清单不变 | verification.json |

现存两条非阻断警告为 `DataViewFilter` 与 `ScenarioViewConfig` 缺少静态fromJson工厂。本轮没有据此扩改产品类型。jsdom requestSubmit与Vite转换选项提示保留在原日志，未将它们描述为真实浏览器功能验收。

## 后续范围

当前旧节点位置导入的根回归障碍已关闭。完整目标仍为 implementing：正式树查询、部分表级操作、静态定义数据及完整设计器/页面接线等缺口继续按主计划核真实消费者。不重复已接受的值级联和字符串兼容验证，不把当前门禁修复当作完整业务页交付。没有写入 knowledge 或个人记忆。
