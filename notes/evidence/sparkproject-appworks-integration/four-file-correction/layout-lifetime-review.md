# 布局草稿与文件保存生命周期复核

状态：已通过限定本地验收；完整页面、浏览器与线上验收未完成。下方原缺口分析保留为实施前记录。

## 主控最终验收（2026-10-08）

- 以 `layout-lifetime-brief.md` 为范围，主控对照 15 份原始字节副本审查 owner、PageContext、Renderer 通知、本页三个写入口及恢复路径。15 份副本哈希均与 manifest 一致；本轮新增一个 owner、修改 13 个已有文件，根 index 和 sandbox 夹具未变。混合工作树的其他改动不归入本轮。
- `PageRuntime.isDirty` 现覆盖原文差异、pending 和 unknown，现有关闭/配置刷新/项目切换检查消费同一出口；未改 Pool、导航或 App。真实 Renderer 同 runtime 卸载/重挂载保留草稿，不重复读写，在旧 host 成功或失败后无需点击即可更新新界面。最终 dispose 不再接受迟到内容。
- 图保存、缺失布局创建、关系元数据确认后的布局同步共用内容 owner。完整关系过滤表达式仍在正式元数据中；图内容只承载身份、端点和几何。关系后置布局失败仍是部分成功，不假称事务回滚。
- 主控退回并复验了一个可达恢复缺陷：采用远端已清 owner unknown，但旧脚本保存未知标志继续阻止操作。新增用例证明失败保存 → 明确采用远端 → 再次拖动及保存成功；取消、坏图、第三方内容、确认期间草稿变化和明确缺失也有定向证据。采用远端只确认这次读到的状态，不证明旧请求成败。
- 最后生产/测试修改为 11:49:23，之后执行者根 typecheck（11:50:12）、精确 lint（11:50:35）、六文件合并测试（11:51:13，202/202）均 exit 0。主控已核原始日志和修改时间；未将重叠定向测试相加。完整命令见 `layout-lifetime-result.md`。
- 主控独立运行 pages-config、ai-codegen（1003 文件）、dirs 均 exit 0，日志为 `layout-lifetime-root-pages.log`、`layout-lifetime-root-ai-codegen.log`、`layout-lifetime-root-dirs.log`；范围内 `git diff --check` exit 0。

本轮可以作为后续功能的已验基础，不重复实施。保证范围是同一存活 PageRuntime，进程硬刷新不保存内存草稿；后端首次文件创建仍非原子 CAS。未部署或线上写入，不宣称整页、全仓或线上零回归。可复用生命周期约束暂存本报告，未另写未经确认的 knowledge 或用户记忆。

## 已核调用链

- `packages/spark-project-model/src/page/runtime-page.ts`：`isDirty` 仅遍历 DataView 的 pending/editingRows；没有布局内容及文件保存状态。
- `packages/spark-app/src/router/page-runtime-pool.ts`：包装视图的 reload、closePageRuntime、assertPageRuntimesClean、disposePageRuntimes 均只依赖 runtime.isDirty。`src/App.vue` 的项目切换沿同一检查。
- `packages/spark-component/src/page/renderer/SparkPageRenderer.vue`：release 中 abort 旧 context，清除 functions/pageContext；再次装载会重新 compileFunctions。普通 KeepAlive 标签切换保持 Renderer，不应误称每次切标签都丢状态；但主动刷新、卸载重挂载与关闭确实经过上述路径。
- `packages/spark-component/src/page/context/buildPageContext.ts`：布局 writer await 后核 signal/generation/DataSet owner，旧 Renderer 接收迟到结果会被拒绝；这个检查没有持有跨 Renderer 的文件保存状态。
- `config/pages/data-platform/data-space-design/script.js`：designGraphDraft/designGraphSaving/designGraphSaveUnknown 与新增创建的 preview/busy/unknown 都在脚本沙箱。页面内按钮锁不覆盖外层关闭/配置刷新/项目切换。

## 影响与验收边界

仅修改布局时 runtime 仍可能被判为干净，外层可关闭/刷新。旧保存已发送但新 Renderer 不知道它仍在途，会重新查询；旧 context 拒绝回调不等于后端未写，也不能防止新 Renderer 再发操作。现有 PageContext stale 测试只证明旧脚本不得继续操作，不能证明草稿、在途与未知状态保留。

完整关系表达式仍属于正式模型元数据，不为解决布局状态而移入图文件、复制进另一套关系定义，或引入前端角色。

## 接续决定

先冻结当前 layout-create-brief 限定闭环及其真实证据，再让同一低阶执行者处理该缺口。旧 `notes/plan-page-runtime-content-drafts.md` 仍是 draft，不能将它的假想接口当成已实现 API。后续必须按当前已有 layout read/save/create 重新收口精确范围，以 PageRuntime 生命周期和实际图消费者证明必要性；禁止并行改当前 writer 文件。

最低验收包含：仅布局草稿时拒绝关闭/刷新/项目切换；相同 runtime 重挂载仍见原草稿；文件保存中重新挂载不触发重复读写；旧 Renderer abort 后真正 host 结果仍归原 owner 收束；未知结果保持脏状态并可显式读取核对；最终 dispose 拒绝迟到 UI 副作用。无需重跑未变化的表达式、图几何或底层上传全套。

## 接续只读委派

当前 D13 已冻结，执行者先形成 `layout-lifetime-research.md`，不先改生产或测试。主控已经核明上述调用链，无需重做宽泛搜索；需要定稿的是最窄公共合同及实际消费接线。

- 核现有 `page/content/text-file.ts`、`rule-file.ts` 与 runtime-page：前两者分别只属于工具 script/style 与 rule，没有在途/未知合同，不能直接冒充布局 runtime owner。候选在既有 page/content 目录补一个实际被 PageRuntime 消费的内容 owner；避免把 8D、图 JSON、HTTP 或权限放入项目模型层。
- 报告精确文件/API：原文 baseline/current、未加载/明确缺失、在途与未知如何区分；真实 host promise 如何在旧 context abort 后仍由原 runtime 收束；新 Renderer 如何读保留状态而不先重查覆盖；取消、显式重读及接受远端结果怎样处理。保留已有 save 的 expectedContent:string 与独立 create 合同，不能用脏标志代替原文和实际请求状态。
- 复用既有 PageRuntime.isDirty 出口，让 Pool 的关闭/刷新/项目切换自然生效，先证明无需修改 Pool、导航或 App；根包导出仅在真实消费者需要时增加。脚本只保留可重建 UI 投影，不再成为唯一持久到 runtime 结束的草稿/请求 owner。
- 测试优先现有 page-runtime.test.ts、page-script-lifetime.test.ts、page-runtime-tabs.test.ts、data-space-design-four-file.test.ts。列需要改的 typed fixtures/API 文档；不为了同一事实重跑旧大套。
- 先报告是否有无法凭现有合同决定的真实歧义，由主控修订精确实施计划。后续实施须将修改前**原始字节副本**存到 evidence 范围下并记录路径，哈希只能作校验，不能代替副本。
