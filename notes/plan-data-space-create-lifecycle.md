状态：superseded

2026-10-07 用户明确要求将参考 Vue 页面转换成本仓四文件页面。本计划围绕 native Vue 页面新增生命周期，前提失效，停止实施；由 `notes/plan-appworks-four-file-integration.md` 替代。执行者已停止，保留当前文件供逐项撤回审计；未进入目录新增实现、未做真实业务写入。禁止据本计划继续完成 native lifecycle 或新增其消费者。

# 数据空间新增与原生页生命周期

授权：用户已指定低阶模型实施、主控派工验收并按长期利益裁决。承接主计划，不重新请求同一实施授权。本闭环在 D1c 验收后串行开始。

## 任务目标

在正式数据空间目录完成单条 datasource 新增与精确回读，并使未保存/提交中的原生表单安全参与标签、应用切换和授权失效生命周期。

## 影响范围

仅以下 13 文件。每次修改前重读当前版本；不变更其他生产、测试、配置、依赖、后端、AI、元数据或业务记录。

1. 新增 `packages/spark-app/src/router/system-page-identity/system-page-identity-lifecycle.ts`：实例状态、取消和过渡锁的领域对象及注入 hook。
2. `packages/spark-app/src/router/system-page-identity/system-page-identity-pool.ts`：每实例生命周期与 provider、候选 clean 检查、精确实例或整池过渡、强制失效。
3. `packages/spark-app/src/router/system-page-identity/system-page-identity-resolver.ts`：转交原生生命周期/过渡门面；reconcile/reset 强制取消。
4. `packages/spark-app/src/router/dynamic.ts`：现 `assertPageRuntimesClean` 包括 native；窄的实例过渡门面，实际 App/guard/tabs 消费。
5. `packages/spark-app/src/navigation/useTabPages.ts`：候选原子预检、异步关闭期间过渡保护及释放。
6. `packages/spark-app/src/index.ts`：仅显式导出有实际目录消费者的 hook，不导出内部池或增加包子路径。
7. `src/App.vue`：跨应用选择/目录选择前取得过渡，覆盖 await，finally 释放本次；logout 继续强制失效；壳卸载取消池中实例。
8. `src/services/project/navigation/project-navigation-guard.ts`：跨 scope 的相同过渡窗口保护，与既有取消/receipt 合作。
9. `src/lowcode/data-space/lowcode-data-space-catalog.ts`：私有原 context、query generation/发布 lease、安全应用集合、单次 create 与只读重核。
10. `src/views/app/control/data-platform/data-space/catalog/DataSpaceCatalogPage.vue`：新增表单、明确放弃、提交/不确定/核对状态，与实际 native provider 连接。
11. `tests/runtime/page/runtime/system-page-identity-tabs.test.ts`：真实 pool/provider/App/tab 回归及包根导入冒烟。
12. `tests/runtime/auth-nav/application/project-navigation-guard.test.ts`：实际 guard 的 dirty/保存/切换等待窗口及取消释放。
13. `tests/runtime/auth-nav/data-space/lowcode-data-space-catalog.test.ts`：目录写基线/权限/单次保存/回读及真实页面生命周期。

## 技术方案与决定

1. 不伪造 PageRuntime。原生池 entry 拥有 `SystemPageIdentityLifecycle`，状态有限：dirty、submitting、disposed、过渡锁。提供绑定实例的 hook；缺 provider 显式失败，测试也须用真实 wrapper，不能默默创建独立状态。根只导出 hook；内部 class/key 在领域文件间使用，不扩展现 SystemPageInstance 的三字段公共投影。
2. 消费者只得到只读取消 signal、响应式可编辑状态和同步报告 dirty/submitting 的窄能力。业务 context、原行、表单值不放进壳。过渡/失效时禁止开始草稿或提交；finally 只清理自身当前操作。UI 在 await 前同步设置 submitting，普通交互禁用与领域检查共同生效，不能仅靠 disabled 属性。
3. `assertPageRuntimesClean` 保持无副作用，聚合 cfg 与 native。新增原生过渡获取门面接受可选精确 instanceIds：省略表示 scope 整池（包含等待中创建实例），传数组只保护待关闭候选。同步预检全部候选后取得独立 token，返回幂等释放凭据。每个 token 独立持有，旧 finally 不得移除新 token；reset 清理旧池所有 token，旧 release 不影响新实例。新 native 实例可呈现但继承仍有效的整池编辑锁，不能借新开页开始写。
4. 普通 tab close/others/all 在任何 await navigate 前预检全部候选并锁住其编辑入口，release 前复检全部，防止半释放。普通 multi 切换不锁不丢草稿；single 释放走同一候选门禁。pool.close 防御性检查 dirty/submitting。App/guard 在 activate side effect 前同步 clean + 整池锁，finally 精确释放；保留 C2 已验收的失败留原页、receipt、取消意图语义。
5. 撤权、组件/绑定更换、logout、壳卸载强制 dispose/abort，移除旧实例，不因 dirty 保留旧授权。未变绑定刷新仍保留实例与草稿。reset 继续强制语义，普通切应用前已有门禁。旧 signal 阻止尚在队列中的 save；已到后端的写不能承诺回滚。
6. 目录 query 开始递增 generation 并清旧写基线；只有最终 creator lookup 完成后仍最新的查询可安装原 context，返回纯编号 lease 与 addActionState。页面发布成功后才持有该 lease；迟到查询不得覆盖它。applications 独立版本/安全选项集合，不改变目录 generation；失败/迟到不得替换当前可选集合。
7. 新增表单只有 Name、sysid、description，Type 固定 datasource。Name trim 非空，sysid 必须显式选择且在同场景最新安全集合中，description 空串表示无描述。不开 edit/delete。打开草稿即受生命周期保护；放弃为明确按钮。草稿/提交期间禁止搜索、筛选、分页等换写基线；普通标签切换保留。
8. create 命令使用当前已发布 lease、原 context.addActionState enabled、当前 scope 和未取消 signal。`prepareNewRow` 生成 Base_DataSet 正式 rowid；只调用一次 `runtime.save`，传同一原 context、最小新增字段和 signal。不得用创建人模型的 ID/ROWID 替代目录 rowid，不发送 UI 投影/权限凭据。
9. save 之前保存本次生成 rowid 与期望业务值作为私有 attempt。save 被调用后若任何失败，进入待核对，不自动重试新增；接口仅支持当前 attempt 的只读重核。唯一 fresh query `rowid eq` 返回且 rowid、Name、sysid、Type、description 均按原 context 可见且与提交一致时，才报告成功，清草稿并刷新目录。回执仅凭 HTTP 200 不算成功，不能复用注销的旧 context 保存。
10. 待核对界面保留 rowid、明确“提交结果尚未确认”，只读核对按钮；不允许再次 submit。明确放弃该次核对时提示这不会撤回可能已保存的记录，之后才可释放草稿；不新增持久草稿库或自动补偿删除。普通验证失败、尚未调用 save 可直接修正字段重试。失效旧页面不再发布任何成功/错误到新实例。

## 串行实施与验证

一个写代理；按子步逐一 RED→最小实现→最小验证，完成该步后再进入下一步。

1. lifecycle/pool/provider + 真 hook fixture：两实例隔离，dirty/busy 拒关，强制失效 abort，根导入。
2. 过渡门面 + App/guard/tabs：延迟 activate 时无法开草稿/提交，失败恢复；重叠 finally 不解锁新锁；关闭无关干净页不被另一脏页阻断，批量关闭预检原子；普通 multi 缓存保留。
3. 目录 owner：实际 DataSpaceQueryContext 证明 addActionState、原基线对象、generation 竞态、prepareNewRow 与 signal；save 恰一次，精确 query 回读，失败仅重核。
4. 实际目录表单挂载真实 provider，联测开草稿/放弃/保存/未知/重核以及撤权 late callback；保留 D1a/b/c 全部回归。
5. 先 `pnpm run typecheck`，再 root 的上述3文件+registry定向，触及源/测试 ESLint、`pnpm run verify:ai-codegen`、`pnpm run verify:dirs`；共享宿主变更另跑 spark-app typecheck 与包测试。不让执行者重复昂贵根全量/build/browser。
6. 主控审源/hash后统一 root 全量、完整 build 与独立5274浏览器。目录读取、原生草稿保护、慢切换取消必须真实UI验证；真实新增仅用明确标识测试行，不修改已有业务记录，精确回读后保留证据。永久删除不在本片，不安排隐式清理。

## 兼容性

保留正式 URL/node/scenario/query、当前 API 和原 context 语义，保留配置页生命周期。新增原生写状态默认 clean，不改变已接只读原生页的正常切换。原有39宿主文件基线已留 hash。包根已有 export/tsconfig/Vite/Vitest alias，无需新配置；root hook consumer smoke 证明新导出。

## 风险与边界

- 主控生产验收已发现并修正 D1c 主键与业务关联键混淆；本片基于其最终 frozen hash，不恢复错误夹具。
- addActionState 仅是前端消费，后端仍最终裁决。用户最新明确“都用 admin”：在线验收全部使用已有admin身份，权限隐藏/遮罩/拒绝保留自动化测试，不把mock结果表述成真实受限账号验收，不再等待其他账号。
- 已发到后端的写不可由 abort 保证回滚；不确定结果不得隐式重发或删数据。
- 发现13文件以外必要修改先回报并修订，不顺手清理；不得 commit/push/建分支、改 memory/knowledge。真实写身份或环境若拒绝则保留错误，不改授权绕过。

## 研读锚点

`notes/evidence/sparkproject-appworks-integration/d1c/create-dispatch-draft.md`、`crud-feasibility.md`、`lifecycle-feasibility.md` 为证据索引；以上已定策略替代其中仍含选择分支的建议。当前源码、模型、JSDoc 为产品事实源。
