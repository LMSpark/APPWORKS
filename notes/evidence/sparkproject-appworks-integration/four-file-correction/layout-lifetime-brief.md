# 布局内容归属 PageRuntime：实施裁定

状态：implementing。总计划 `notes/plan-appworks-four-file-integration.md` 的当前最小闭环；用户已持续授权低阶实施、主控派工验收及长期利益裁决。依据 layout-lifetime-review.md / research.md 的实际调用链，不重新研究已冻结的图编辑和首次创建。

## 目标与唯一责任方

运行实例持有布局原文基线、用户草稿及真正的文件请求状态。Renderer 只持可重建的界面投影；关闭、配置刷新和项目切换沿现有 runtime.isDirty 拒绝丢弃这些状态。模型/字段/关系仍由正式 DataView 管理，完整关系过滤表达式不进入图文件；无前端角色。

主控已裁定研读中的三处选择：

1. 未确认的自动创建预览是可重新生成的只读投影，不计编辑草稿，可在重挂载后丢弃并重新预览。它不携带跨重挂载的确认资格/权限快照。确认前仍须完整正式投影复核；实际发起 create 前，将提交文本及在途状态登记到同一 runtime 内容 owner。
2. unknown 不因普通读取自动清除。提供明确的“重新读取并采用远端布局”动作，先告知将放弃本地布局草稿，由用户确认；取消保留原状态。远端等于提交、等于旧基线或为第三方内容，都只说明本次实际读到的状态，不宣称旧请求必然成功/失败。成功读到且页面按当前正式模型/关系校验通过后，才可接受远端基线并清 unknown；读取失败、坏图、目标/代次变化或并发本地草稿变化均保留原状态。明确缺失 null 可接受为缺失，不能自动创建/重试。无需另造合并器；保留本地即取消此动作。
3. pending/unknown/用户图草稿继续拦截关系等业务写入。关系元数据已成功后才写布局的路径也纳入同一文件 owner；部分成功保持明确，不回滚已确认元数据、不宣称跨文件事务。

## 精确文件范围

- 新增 `packages/spark-project-model/src/page/content/runtime-content.ts`：一个实际被 PageRuntime 消费的不透明文本内容 owner，建议领域名 PageContentRuntime；未加载、明确缺失、原文、草稿、pending/unknown、提交文本、dispose 和变更通知均在此收束。禁止存场景/图/HTTP/权限业务逻辑。
- `packages/spark-project-model/src/page/runtime-page.ts`：按 opaque key 取得该 owner；isDirty 汇总其原文差异、pending、unknown；干净 reload/dispose 清理同一归属；必要的内容变更订阅供 Renderer 使用。`src/index.ts` 仅按跨包实际类型消费者显式导出，优先通过现有 PageRuntime 门面，禁止 export * 或新包路径。
- `packages/spark-component/src/page/context/buildPageContext.ts`、`runtime/app-services.ts`、`runtime/script-context-types.ts`：脚本只得到固定布局身份的状态/编辑/放弃/明确协调能力；内部 key 由已核设计场景及规范化空间 ID 构成。保留 read/save/create 现有宿主合同，save 的 expectedContent:string 不变，create 独立。不要要求宿主 writer 实现纯 runtime 内存方法。
- `packages/spark-component/src/page/renderer/SparkPageRenderer.vue`：仅在需要通知时订阅/释放 runtime 内容变化，令重挂载的新 Renderer 能在旧请求 settle 后更新界面；不得依靠定时轮询或等待下一次无关点击。不重新建一套脚本/数据 owner。
- `config/pages/data-platform/data-space-design/script.js`、`rule.json`：迁移三写入口（designGraphSave、designConfirmLayoutCreate、designPersistRelationLayoutEdge）和图草稿到上述 owner；`__init__`/重挂载读取保留状态并用当前正式 DataView 生成界面，恢复/协调入口即便图当前不能装配也须可见。已有参数编辑和正式数据权限门禁不变。无必要不改 rule，不改 style/pagedata/图组件。
- `packages/spark-component/API.md`：同步真实新增脚本能力和生命周期限制。
- 测试仅 `packages/spark-project-model/tests/page-runtime.test.ts`、`tests/runtime/page/runtime/page-script-lifetime.test.ts`、`tests/runtime/page/runtime/page-runtime-tabs.test.ts`、`tests/runtime/page/design/data-space-design-four-file.test.ts`；类型夹具仅已有 `tests/runtime/page/catalog/data-space-four-file.test.ts` 和 `packages/spark-component/src/tests/runtime/createSandbox.test.ts`。

不改 Pool、App、导航、低层 uploader、backend、依赖或线上；真实必要新文件/调用者若出上述范围先报主控。重用同一个低阶 writer，主控不并写生产文件。

## 必须成立的执行合同

- 内容 owner 是本次 PageRuntime 的单一内存归属，未读不等于 null；空文本仍是已存在。草稿与基线按原字节字符串比较，不做图序列化规范化。首次已读缺失只允许 create，已有原文只允许 save。
- 同 key 单飞。PageContext 在调用前核 signal/generation/设计 DataSet/目标；真实 host promise 的结算由内容 owner 执行，不放在 renderer assertCurrent 之后。旧 context 仍拒绝迟到 UI，但不能使 owner 丢回执或永久 pending；成功仅推进 submitted 基线，不覆盖后来不同草稿；失败保守 unknown，保留提交文本。最终 runtime dispose 拒绝迟到内容/通知。
- reader 的远端预像核对与 owner 快照读取不同。保存前 readDataSpaceLayout 不能把已有草稿覆盖；新 Renderer 遇 pending/unknown 不再发文件读写。正式模型权限仍从当前 DataView 获取，不沿用前一 Renderer 伪造的权限快照。
- 普通读取可初始化未加载或更新干净基线，但不得消除草稿/unknown；异步读取期间出现新草稿、写入或代次失效时不可迟到覆盖。显式协调需校验同一 owner 修订且由真实远端读取产生，不能接受任意调用方文本伪装回读结果。
- 状态变化必须让当前 Renderer 正确更新按钮与图/恢复提示。onBeforeRender 只做同步读取投影，不发 IO、改 owner 或装作完成恢复。取消在途请求不作为回滚；页面进程硬刷新不在内存持久保证内，不引入磁盘/全局缓存或服务端幂等假象。

## 实施和验证

开工先 git status 与本轮文件原始字节副本，记录准确备份路径和哈希；最近根类型通过基线为 layout-create-final-typecheck.log。首个最小红绿证明仅布局草稿改变 runtime.isDirty 并阻止 reload；随后接真实 host 与 Renderer，再验其余路径，不能一次散改后统一验证。

必须包含同 runtime 真正卸载重挂载：草稿原文恢复；写在途不重复读写；旧 context abort 后 host 成功/失败仍正确 settle 并更新新界面；unknown 即使文本等于旧基线仍 dirty；明确采用远端的取消、成功、失败/坏图/第三方内容；Pool 关闭及 assertPageRuntimesClean 借现有检查拒绝，明确取消草稿后恢复；关系布局同步与首次 create 使用同一保护。

冻结后一次根 typecheck，精确 lint，四行为套件与实际改动的两夹具套件；按包配置确认 page-runtime.test.ts 被真正执行。主控跑 pages/ai/dirs。不重跑未变的表达式、图几何或底层上传大套。交付 layout-lifetime-result.md，列实际命令退出码、修改范围、恢复副本位置及未完成边界；不将本轮称整页/线上零回归。
