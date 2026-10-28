# 场景历史最终窄复审 — 2026-10-29

结论：**NO-BLOCKING（本轮静态范围）**。未发现命名 command 收敛或 native undo revision 最小修复引入的提交阻断问题。不是重新执行全面审查，也不是本审查者独立运行测试或 SPA 的结论。

审查目录：C:/Users/lgf22/.codex/worktrees/ai-data-entry/SPARK_AppWorks。基线 HEAD：3531bf09f0c3a870f75c9f1b805a65f41fc60a95；审查对象为当前未提交文件。未修改仓库、运行测试/UI/服务或业务写入，仅写本 Temp 报告。

## 命名 command 与已签边界

- packages/spark-project-model/src/project/project-workspace.ts:89–100 的 ScenarioViewVersionCreateCommand 仍要求 scenarioId/version/text/onAttempt，assertCurrent 保持可选宿主钩子；包 index.ts:43 已公开导出。Workspace:561 唯一正式 gateway 调用传同一捕获 context、固定 version、原文、回调与 identity guard。
- Workspace:516–523 仍先拒绝 pending/unknown，再建立 pending；:548–559 在回调中核 scene/scope/N/fileName/text/resourceId、冻结 attempt 并留在 Workspace。:563 保留 callback 未调用的显式失败；:565–568 回读精确原 N 与原文。:575–580 仅 gateway 尚未返回、且 resource/scope/version 匹配的 typed 未应用才可降为 not-applied；写后/回读异常保持 unknown。没有换号重发或用最新版本替代原 attempt。
- src/lowcode/lowcode-runtime.ts 与前次 command 审查 SHA 完全相同。:734 接命令；:747 保持原 executionScope；:753 传命名 client command；动态来源 :772 仍在可能上传前捕获。既有 scope 前后守卫、生产不可用、动态目标正式协议没有本轮增量改变。
- repository-scenario-host-client.ts:93–106 命名 command、:113 同步 onAttempt 先于 :115 fetch；:120–129 保留精确失败身份与成功文本/SHA 校验。protocol.ts:57–58 真正检查 typeof number、safe integer、非负；:53 失败 DTO version 同样校验。当前相较前轮哈希变化涉及公开注释，读取到的执行合同未放宽。
- tools/repository-scenario-store.ts、vite-plugin-repository-scenarios.ts 与前轮审查 SHA 完全相同；后者 :98 将 resourceId/version/text/expectedText 命名传给 store:130。此前已签的白名单、loopback/Host/Origin/JSON/body、安全路径、固定 N 独占、同资源队列和原文比较未变化。

## Native undo 修复闭环

- src/views/features/data-platform/data-set-management/design/ui/data-set-design-page.vue:390–394 在 historyDraftDirty computed 首先无条件读 revision.value，消除了 document.isDirty 为 true 短路右侧造成的依赖丢失。
- :513–521 仍由原 Document.undo/redo 操作原定义 DataView，然后 changed；没有改 Document、复制草稿、重置脏状态或新增保存。:493–501 显式保存仍校验实际 document.isDirty，并沿 metadataDataSet.saveChanges({views:document.viewSelectors}) 与原 session.refresh。
- tests/runtime/page/design/native/data-space-design-page.test.ts:2690–2732 使用 mounted 目录宿主及真实共享 Panel 操作恢复/undo/redo。:2716–2720 直接核同源全部视图没有 editing/pending/unknown，:2721–2723 再核 save 消失、snapshot/restore 启用；:2726–2732 核 redo 恢复脏 UI 且零文件写。该例没有用手工修改 Panel props 或伪造 Document 来掩盖数据层。
- 主控报告真实 SPA 修后撤销 clean、重做 dirty、显式保存和重开通过；restore/undo/redo 零 POST、全程 Document 请求零。此为主控现场证据，本审查者没有重跑。历史 1/2 档保留、释放全部实例后语义相同再恢复排版的收尾亦按主控事实记录。

## 重开短暂提示的判定

现有证据不足以把加载过程中短暂“共享配置已变化”、稳定后自行消失定为本片阻断缺陷；也不宣称已经独立证明它在所有场景都无害。

精确来源之一是未改动的 design/graph/data-space-layout-edit.ts:432–434 assertDraft；:447–459 state() 每次从 file/sync/assertDraft 重算 error 并返回，不将该 error 持久保存在历史 attempt。目录页 :416 的 layoutState 依赖 revision；:1508–1511 将 layout 实例先交给视图再 await initialize，:1521 再 changed。initialize:85–110 具有异步 refresh 与最终 state 重算。因此源码允许渲染观察到初始化中间状态，和主控所见“稳定后消失、24 模型与列表正常”一致。该 layout 文件相对 HEAD 无 diff。

没有稳定复现的保存受阻、数据错误、持续报错或未知 attempt 错误清除证据，不据这条瞬时文本扩面改 owner/Document。若后续出现稳定状态仍持续或实际阻断操作，再以完整时序和具体操作建立新反例。

## 最终 SHA-256

| 文件 | SHA-256 |
| --- | --- |
| packages/spark-project-model/src/project/project-workspace.ts | 147A0BB3A72B9329DA4367F58426656C6D4B232ED2069527C16BBAE2B30346E6 |
| packages/spark-project-model/src/index.ts | CFF1118A488022DD5E9105819F434936FC1282CA4FE4377AD3168E2E46838EF9 |
| src/lowcode/lowcode-runtime.ts | E47836A6E3842C84E815523CB6F480BA8EB8F9367EB1CABF6E923ACC9D346EA1 |
| repository-scenario-host-client.ts | 06E4F3CF1A87372D414B03A688AE083701CCFEF850675F9AA6BE69617C6954E7 |
| repository-scenario-protocol.ts | 4EDE515F03060ADC20DB24CD690E7EDC3509E2249C49F6BFF75552BDF56C93CD |
| tools/repository-scenario-store.ts | 9D83482EBC35B22386786792341EB8FDA6112848637D7852864F59D6946B550E |
| tools/vite-plugin-repository-scenarios.ts | B3C8E6E65ABD5AF7ED753392D039612DEE8B8E433D44308BCF8C54410BC6BFDB |
| design/ui/data-set-design-page.vue | 66FC8AD7D77CB1EE4C3A8428A917C7039E65E2F0B43D8A99A054F1A7EFF838FC |

未判：本轮不再跑 lint/typecheck/生成器、全量测试、HTTP现场及 SPA；这些通过与否以主控最终执行日志为准。未全面重审生成产物、证据压缩包或下一片 cfg/builtin 项目树。
