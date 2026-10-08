# 关系页面必需宿主能力

状态：implementing；本轮独立 writer，不改页面 writer 的四文件/测试。唯一总计划 notes/plan-appworks-four-file-integration.md。

## 范围

- packages/spark-lowcode-api/src/platform/data-space/design/data-space-design-api.ts 及 .test.ts
- packages/spark-component/src/runtime/app-services.ts、script-context-types.ts
- packages/spark-component/src/page/context/buildPageContext.ts
- packages/spark-component/src/page/renderer/SparkPageRenderer.vue
- 新 src/lowcode/data-space/lowcode-data-space-design.ts
- src/lowcode/data-space/lowcode-data-space-layout.ts、src/App.vue
- tests/runtime/auth-nav/data-space/lowcode-data-space-layout.test.ts
- 新 tests/runtime/auth-nav/data-space/lowcode-data-space-design.test.ts
- tests/runtime/page/runtime/page-script-lifetime.test.ts
- packages/spark-component/src/tests/runtime/createSandbox.test.ts：现有 PageContext 测试夹具补新增的页面服务方法；保留方法必需类型，未配置时显式失败，不把生产合同改为 optional。
- tests/runtime/page/catalog/data-space-four-file.test.ts：同类 PageContext 夹具补两个未配置时失败的方法；不改目录页面行为。
- 本目录 relation-host-result.md

开工已通过根类型基线 relation-page-typecheck-baseline.log。先完整读当前拟改源文件和调用方，不从旧快照覆盖任何混合改动；不提交/分支/重置、不写线上、不派其他代理。需要公共 barrel 新导出时先报准确实际消费者。保持已有 layout-only fixtures 合法，不为读布局的消费者强加新写能力。

## 已核事实

semantic-data-restoration-map.md 最后两节有固定参考 SHA、源码链、字典 wire 和图文件上传路径。必须依源码核具体响应/排序。参考字典无 scenarioId；GetData Type=字典已注册。当前 formal runtime.query 必需场景模型，不可猜场景复用。LowcodeDesignFileUpload.uploadWorkingText 是唯一上传并字节回读 owner；layout 是 SysForm/{dataSpaceId}.json，和 pagedata.json 不同。

## 设计裁定

1. DataSpaceDesignApi.readRelationDependencyOptions() 读取固定业务字典“数据关系依赖”，返回 readonly {label:string,value:string}[]。实际消费者是本关系页。LowcodeClient 已是 AjaxResult owner；复用 collectDataSpaceQueryPages 批量校验原始 rows/total（解析后、投影前），不复制其循环。捕获并在每页前后核 scope token，拒绝空身份、缺页、total 变化、非法响应/选项、空字典；不产生权限真源、角色分支或客户端授权逻辑。
2. wire 按固定源：POST GetData，Type=字典，Name=数据关系依赖，PrimaryKeyFields=rowid，OutputType=Table，Filter=null，inputParams=[]，DISTINCT=false，IsBusinessMain=1，PageParam.index/size。无凭空 scenarioId，禁止借设计场景注册模型。标签和值按报告中真实候选优先级，保留 0 等值的字符串，不将缺值默认为空。
3. 固定源排序意图为 ordIdx 升序，但 Fields=null 删除了排序 wire；不要谎称已发送。为不改变完整列投影，收齐原始页后可用响应 ordIdx 稳定排序；若缺 ordIdx 保留来源顺序并记录准确限制，不编造值或牺牲 label/value 列。先核后端字段合同后决定最小可证方式。
4. 新 dataSpaceDesign sibling capability `{scenarioId, createReader()}` 返回专用 `readRelationDependencyOptions()`；宿主 lowcode-data-space-design.ts 捕获当前应用/会话，调用既有 lowcodeApi.dataSpace.design 方法，请求前后拒绝作用域变化。页面 API 名固定 `$page.readDataSpaceRelationDependencyOptions()`。只有 PageRuntime 声明并装载设计场景时才构建 reader，前后核 AbortSignal/generation/同一个已装 DataSet（含拒绝后的 stale 路径）。不让业务页访问整个 lowcodeApi，不向普通页面泄露读取能力。
5. 布局保持现有 createReader() 只读合同；在同一 dataSpaceLayout 能力增加可选 createWriter() 独立 factory，捕获该 writer 的应用会话，避免破坏只读消费者。可在同一宿主文件内部共享实际 scope/path 的实现，不新增转发类或对外薄别名。writer `saveDataSpaceLayout({dataSpaceId,content,expectedContent})`，对应 `$page.saveDataSpaceLayout(...)`。参数使用具名 type；本轮只维护已存在布局，expectedContent 为 string，拒绝 null/missing 以及非法/空内容和跨路径 id。前端必须先核原文与 expectedContent 一致、再调用已有 uploadWorkingText；核实际回执及同一文件字节 readback。不是 CAS，不声称与元数据事务化。
6. 页面 writer draft 曾将 expectedContent 写 string|null；主控已收窄本轮 writer 为仅已有文件 string，另行通知。真实缺失重建是独立显式动作，后续实现；不要自动创建或覆盖损坏文件。host 只做必要 graphVersion=1/nodes/edges 的基础形状有效性及字节并发检查，模型关系语义由页面校验；禁止把白名单 ID 写成测试专用。
7. API scope、宿主 app scope、page generation 三层语义不同，均要真实验证。No-role 边界；类型/注释不宣称未实现交易或线上验证。

## 验证

首次实改先最小定向测试；最后一次冻结再运行 API设计 suite + lowcode API 包 typecheck，host 两套 + page-script-lifetime + 精确 lint。不重复全量；主控负责根 typecheck/门禁和与页面集成。
覆盖：真实 wire与多页/缺页/空集/响应错误/选项缺字段/0值/排序/scope切换；未声明未装载场景不创建factory、旧DataSet/generation/abort拒绝迟到成功及失败；布局单段ID、无app、权限失败、预像变化零上传、上传未知回执/字节不符、成功实际路径/原文、scope中途变化。不能 mock 高层读写方法绕过被测路径。
回报 relation-host-result.md 写准确文件、验证命令/数字/日志、残留限制；不用完成本宿主能力来宣称关系页或整页完成。
