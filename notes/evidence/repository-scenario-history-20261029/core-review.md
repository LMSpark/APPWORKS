# 场景历史 core 只读合同/质量复审

日期：2026-10-29。基线 HEAD：3531bf09f0c3a870f75c9f1b805a65f41fc60a95。唯一工作树 C:/Users/lgf22/.codex/worktrees/ai-data-entry/SPARK_AppWorks。按照 requesting-code-review/code-reviewer.md 模板检查当前未提交的 8 个 core/转发/guard 文件；底部记录最终 SHA256。只写本报告，未改产品、测试、台账、生成物或 Git 状态，未派子代理、未运行测试/UI/服务。

审查依据：notes/data-space-retirement-ledger.md 顶部冻结合同与 notes/evidence/repository-scenario-history-20261029/contract-analysis.md。源码定位均为本次工作树文件；正在变化的新增测试不作为替换源码审查基准或宣称全绿的依据。

## Strengths

- attempt 状态正确保存在 Workspace 的 scenarioVersionAttempts Map，而非每次临时创建的 DataViewSource。DataView.sourceLifecycle 每次 new 的旧行为不变（packages/spark-data/src/data-view.ts:522-529），状态/核验调用回到原资源 owner。
- Workspace 在创建前核当前活动原文、真实版本列表及候选编号，在 gateway onAttempt 时核 scenario/scope/N/fileName/text，并冻结原 attempt；随后允许草稿继续编辑但不替换原捕获（packages/spark-project-model/src/project/project-workspace.ts:491-517、550-558）。pending/unknown 阻止再次创建（:475-478）。
- 只读核验明确按捕获 N 与 fileName 过滤目录，再读同 N 并比较精确原文；缺失、不同文本、普通读取失败保持 unknown。成功只更新历史状态，没有 markSaved/修改当前文件/清 DataView 草稿（project-workspace.ts:424-459）。
- 通用 spark-data 的 attempt version 仍是 string|number，没有 pagedata 名称、编号分配或场景路径规则。创建前枚举全部同源视图，核身份、dirty/pending/loading 与事件；捕获后仍核原视图集合、绑定和生命周期，放行后续编辑（data-view-source.ts:120-168）。核验不套创建 clean guard（:109-116）。
- ScenarioDefinitionResource 使用原资源 assertSourceView，创建仍保护定义资源 #saving/#pending；forQueries 与目录 source 转发包括 status/verify。page-design-operation-guard.ts:24-26 加入两个新增底层 Workspace 方法，未给脚本新增直接存储入口。
- 活动保存 saveScenarioViews/verifyScenarioViews 没有随历史改造重写；history record 与 ScenarioViewFile.submission 分离。ScenarioViewFile.isDirty（scenario-view-file.ts:60）包含 active pending/unknown，因此历史创建的 clean 条件仍拒绝活动保存未决状态。

## Issues

### Critical（未解决）

无。

### Important（初审发现，审查期间已修复）

**P1：成功创建后的 typed 回读错误会被误判为 not-applied。已修复，最终源码不保留此问题。**

- 初审文件：packages/spark-project-model/src/project/project-workspace.ts:528-536（初审 SHA256 9387F3CFD498482CF9DCC3ED3FEDE8917C9156D9A516272696E352125DA52353）。原 catch 覆盖 create、assertCurrent 和 readVersion 全过程，只凭 ScenarioViewVersionNotAppliedError 的 resourceId/scope/version 匹配就转为 not-applied。
- 具体触发：createVersion 网关捕获 N=1 并成功返回；后续 readVersion 抛身份匹配的 ScenarioViewVersionNotAppliedError。原逻辑把已可能持久成功的快照标成未应用，第二次创建不再受 unknown 守卫，违反冻结合同。
- 用户影响：丢失原创建结果待核状态，可能再次创建快照；风险是提交结果误判，不能当作提示文案问题。
- 修复方向：仅接受创建调用本身返回的明确未应用证明；create 已返回后，回读/后置校验任何失败都保持 unknown，原 N 可只读核验。
- 已见最终修复：project-workspace.ts:484、520、533 增加 gatewayCreateReturned 阶段标记，只有 !gatewayCreateReturned 才接受 typed 未应用；新增测试位于 scenario-view-file.test.ts:1488-1496。已静态复核修复正确；本审查未执行该测试，需主控独立跑最终组合。不得把初审缺陷留作“未修复”结论，也不得把已读测试等同测试通过。

### Minor（未解决）

无可证实、值得阻断的新增问题。

## 对重点疑点的核定

### forceReload 与 unknown history

不能仅从 loadScenarioViews:263-264 未检查 history unknown 推断它会替换 owner。真正 readScenarioViews:293-301 采用 current ?? new ScenarioViewFile；存在 current 时调用同对象 loadText，不换引用。因此同 scope、已有 owner 的 forceReload 不会触发新 status/verify 的 OWNER_CHANGED，也不会丢掉 Map 中独立捕获的原 attempt.text。核验使用原 N/原文，不依赖 reload 后的活动文本。

pending 创建时 scenarioSaves 会拒绝 reload；unknown 时 reload 可读活动配置且不把 history attempt 清掉。这是两个独立持久对象，当前代码无须仅为保护历史身份而禁止同 owner 的只读重载。若有 DataView 草稿，是否允许宿主 reload 另受其现有编辑守卫约束；本次未把“未知快照必须禁止一切读取”添加为新合同。

跨 scope A→B→A 的情况不同：currentScenarioScope:576-586 清 scenarioFiles/定义 DataSet；重载获得新 owner，旧 attempt 必须拒绝新 owner 核验。get/verify 的 OWNER_CHANGED 正是边界，不能通过删除检查让新 owner 认领旧请求。scope 切换后还未加载文件时，status 同步抛“尚未加载”符合现有 API 前提。写者新增测试的同步断言问题不能当产品失败。

### 创建后编辑与状态保护

DataViewSource:136-144 捕获后不再比较行签名/dirty，故新草稿不使原 N 变成新 N；但视图集合或绑定变更仍拒绝旧回执。verify:109-116 只核当前调用视图来源，资源内部的 Workspace 再核 scope/file/attempt record；核验不写任何同源视图，因此没有理由要求同源全部视图无草稿。创建时则确实覆盖 adapter.views 返回的全部同源视图，不只默认视图。

### 原 active-save

同 resource 创建与活动写仍复用 scenarioSaves 的短期互斥。历史 unknown 不占 active submission，不清 active draft；active pending/unknown 由 file.isDirty 与定义资源 #pending 继续约束。此前 active-save 特意捕获 write 阶段同一 typed 错误的逻辑（project-workspace.ts:337-354）保留，此次历史修复也恢复了同样的阶段语义。

## Recommendations

1. 主控使用最终文件 SHA 运行三组 core 测试及新增 typed-readback 回归，再核 typecheck/公开面正式生成；旧“295 绿”不能代表最终新增用例。
2. 宿主组必须证明每个写请求都在 onAttempt 成功后发出，且 create 内部返回 typed 未应用只来自可证明未落盘的真实阶段。core 没有能力从一个错误实例独立证明服务器因果，不能以这里的类型检查替代宿主证据。
3. 对最终共享 UI 独立核 pending/unknown 关闭重开、切目标/释放提示，以及恢复仅原 DataView 草稿+显式 DataSet 保存。这些是本次 core 的消费者义务，不是本报告 PASS 对其完成性的背书。

## Declined to judge（逐项未判行为及原因）

- Vite store 的独占创建、路径/symlink、同资源队列、active preimage 与 unknown IO 分类：不在分配的 core 文件组；由宿主组完成，core 只能检查其类型/调用契约。
- repository host client 的回执校验及是否过早标 not-applied：同上，正在另一组变更；本报告只审 core 对阶段/identity 的消费。
- 普通动态远端 create 实际请求协议及实际服务结果：需远端适配和真实服务证据，本次没有运行服务/API，不以 core 单测替代。
- 共享历史 UI 可达性、恢复文档完整性、显式 DataSet selectors、SPA Document=0：UI 组尚在工作；没有把缺少当前 UI 结果当本组源码缺陷，也不宣称已交付。
- 离开/释放提示与用户选择后 pending owner 的保留流程：Workspace.dispose 当前只是让晚回执失效，不等于服务器取消；提示/阻断属于宿主，正在后续接线。core 已拒绝 disposed/换 scope/换 owner，不替代宿主必须完成的守卫。
- 四场景旧远端历史迁档库存、生产构建历史 capability：不属于这次 8 文件 core diff，须按整体冻结范围单独验收。
- builtin 项目树与工具三文件正式映射：是后一切片，未混入本次历史复审。
- 最终测试数量/全仓绿与生成物新鲜度：本次未运行命令验证；主控独立验证负责，写者自述不是本报告证据。

## Assessment

**Core 静态合同复审：PASS（以本报告最后 SHA 为准）。Ready to merge：仅 core 源码层面 Yes；整体历史切片尚不能据此合并放行。**

初审唯一重要问题已被写者修复并补回归；最终指定 core 组未发现仍可具体触发的新增缺陷。host/UI/生命周期提示与独立测试尚需各自完成，未审范围均已逐行列明。

## 最终审查文件身份（SHA256）
packages/spark-data/src/query/data-view-source.ts  FD2C67F5EA0C91EF8B48FD5E7D72F00E602654CD1A30E64B52AAA061BF8CAAE3
packages/spark-data/src/data-view.ts  2D60BBF3C4138846D76CB2FE2051C67C7C7E6B71A3973A949BB18C41315A1BF6
packages/spark-data/src/index.ts  BC4815B3E09F2F87C21AD79D2B53A28DE72A76CCB27A81DC1FE9A189AAF32B22
packages/spark-project-model/src/project/project-workspace.ts  4C9341C72EEF330066B8199498B116D90993D29A6AA1DD23CEAE8FC1BBBBF571
packages/spark-project-model/src/scenario/scenario-definition-resource.ts  37CE7FE9EED675B5BE2B47A69710E9A044DECAB4E5A861A2F1E842CC7ADEBD46
packages/spark-project-model/src/index.ts  772CBE90DF1D7B4C30B9B32A02E4A5093F8FB8CFF9C7D6A1DC59E55AAC6A28D1
src/lowcode/data-space/view-design/lowcode-data-space-view-design.ts  D1F956414C8479CDAA56A1BE367B9A645D17DF9B3953C56202F370ADAD2D1209
src/services/page-design/page-design-operation-guard.ts  C2632B2B19778528E2430BA7B75240636E9FF2A1BCBD8E5D0C26B51A4AA74B2F
