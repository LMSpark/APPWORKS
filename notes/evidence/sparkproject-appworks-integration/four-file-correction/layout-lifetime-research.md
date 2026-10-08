# 布局内容生命周期：接续只读研读

状态：research；只读当前工作树，未修改生产或测试。D13 首次创建已冻结；本记录仅收窄下一闭环合同。

## 已确认边界

`PageTextFile` 仅属工具 `script.js/style.css`，`PageRuleFile` 仅属 `rule.json`；二者有文本保存基线和撤销，但无文件缺失、请求在途或结果未知状态，不能当作布局 owner。`PageRuntime.isDirty` 仅看各 DataView 的 pending/editing；`PageRuntimePool` 的关闭、reload、项目切换通过这个出口检查。`SparkPageRenderer` 卸载时 abort 旧 context、清沙箱；同一个 runtime 重挂载会新编译脚本。普通 KeepAlive 切标签保留 Renderer，不是每次切换都重挂载。

设计页的 `designGraphDraft`、保存/未知状态、首次创建 preview/busy/unknown 均在脚本。`designGraphSave` 在 `$page.readDataSpaceLayout` 之后调用 `$page.saveDataSpaceLayout({expectedContent:string})`；`designConfirmLayoutCreate` 用独立 create；关系元数据确认后的 `designPersistRelationLayoutEdge` 也会读/写同一布局文件。当前 `buildPageContext` 为每个 Renderer 捕获 generation、abort、设计 DataSet；host Promise 完成后旧 context 会拒绝回调，但真实写入结果没有留在 PageRuntime，重挂载 `__init__` 仍从宿主重新读文件。`__init__` 已有针对 DataView 参数草稿的重建入口，布局须接在其正式模型/关系查询与 `designParseLayout` 之间，不得跳过当前权限查询或把关系完整 filter 搬入图文件。

## 建议最窄唯一 owner 合同（待主控裁定）

在现有 `page/content` 增一个**只持不透明文件原文与操作状态**的 owner，由 `PageRuntime` 按本次调用内的 `设计场景 ID + 数据空间 ID` 取得；实例销毁即销毁此状态。它不解析图 JSON、不处理 HTTP/权限或图坐标。根包仅在实际跨包类型消费需要时导出类。状态至少区分：`unloaded`、已读 `null`（明确缺失）、已读 `string`（含空字符串仍属已存在、交给页面解析）；`draft: string | undefined`（区别于缺失）、`idle | pending | unknown`、原文基线及在途提交文本/操作种类。`isDirty` 汇总该 owner 的草稿、pending、unknown，并继续汇总 DataView。未装载/读失败绝不作为缺失。

有限行为面可为 `snapshot()`、`acceptRead(text|null)`、`setDraft(text)`、`discardDraft()`、`startWrite(kind, submittedText, expectedContent, hostPromiseFactory)`、`reconcileRead(text|null, disposition)`；精确命名可调整。`startWrite` 在 PageContext 完成当前设计场景/DataSet 与目标校验后由 runtime owner 接管真实 host Promise，保证同 key 单飞。`save` 仍携现有 `expectedContent:string`，`create` 仍独立且仅以已读 `null` 为前置；owner 不伪造后端原子性。Host Promise 即使在旧 Renderer abort 后成功，owner 仍将提交原文作为 baseline 并保留等待期间新草稿；失败或无法确认则进入 unknown，不由旧沙箱决定结局。旧 PageContext 的返回/提示继续按 stale 拒绝。pending/unknown 期间新 Renderer 应读取 owner snapshot，禁止再次调用布局 reader/writer 或直接重置草稿；仍可按现有 DataView 管线查询正式模型/关系以构建只读 UI。取消只能处理未在途草稿；显式重读在 pending 结算后执行，核实际远端原文，再由用户明确接受远端或保留草稿/冲突，不能静默丢本地文本。

## 精确接线及验证

- 生产候选：`packages/spark-project-model/src/page/content/` 新窄 owner、`packages/spark-project-model/src/page/runtime-page.ts` 的 owner 存取/isDirty/dispose；`packages/spark-component/src/page/context/buildPageContext.ts` 与 `packages/spark-component/src/runtime/app-services.ts`/`script-context-types.ts` 的脚本可见状态/操作合同；`config/pages/data-platform/data-space-design/script.js` 将布局原文基线、图草稿、保存/创建在途和未知转由 owner 持有，仍以当前正式 DataView/权限生成图 UI。`packages/spark-component/API.md` 需同步真实 API。`packages/spark-project-model/src/index.ts` 仅在确实需要显式跨包类型时改。预计无需动 Pool、导航、App、低层上传、图组件或 pagedata。
- `designPersistRelationLayoutEdge` 是同一文件的第二写消费者，必须纳入同 key 互斥和基线更新；不能只迁图拖动按钮。首次创建 preview 中的正式 fingerprint/可读图仍属页面语义，不能下沉模型层；它跨重挂载是否保留以及是否计 dirty 需裁定。
- 测试优先 `packages/spark-project-model/tests/page-runtime.test.ts`（仅布局 draft/pending/unknown 对 `isDirty`、reload/dispose）、`tests/runtime/page/runtime/page-script-lifetime.test.ts`（旧 context abort 后 host 成功/失败由 runtime 收束）、`tests/runtime/page/runtime/page-runtime-tabs.test.ts`（Pool 关闭/刷新/项目切换只借 `isDirty`）、`tests/runtime/page/design/data-space-design-four-file.test.ts`（真实 Renderer 同 runtime 重挂载保留草稿，pending 单飞、unknown 显式重读，关系布局写互斥）。若必需 PageContext 方法加入，则 `tests/runtime/page/catalog/data-space-four-file.test.ts`、`packages/spark-component/src/tests/runtime/createSandbox.test.ts` 的 typed fixtures 可能需同步；以根 typecheck 精确确认。根类型、精确 lint 与上述定向测试即可，未变的表达式/图几何/底层上传不重复跑。

## 真实待裁定歧义

1. **创建预览**：仅供未确认展示、重挂载可放弃，还是应作为 owner 草稿阻止关闭并恢复确认？已有 review 将其列为脚本状态，但最低验收只明确布局草稿、pending、unknown。若保留确认资格，owner 仍只持预览原文；正式指纹须由页面重查重建，不可把权限快照塞进模型层。
2. **未知结果显式重读**：远端等于提交文本、等于旧基线、或出现第三方内容时，何时允许清 unknown/丢草稿、何时保持冲突？应由产品确认用户选择语义，不能仅因读到任何文本就自动视为保存成功。
3. **确认写与关系元数据的先后**：关系元数据可能已提交后才写布局；owner 只能保证布局文件单飞/原文基线，不能宣称两者事务性回滚。需裁定在 pending/unknown 或图草稿时是否继续维持现有业务保存前置拦截与 partial-result 提示。

实施前须将每个拟改文件的**修改前原始字节副本**存入本 evidence 目录并记录路径；SHA-256 只能校验，不代替副本。无角色推断，无线上写入，不改变正式关系完整过滤表达式。
