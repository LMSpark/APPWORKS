# AppWorks 四文件迁移纠偏研读

2026-10-07。用户明确：“本仓页面要转成4文件，需要把原来的VUE转成本仓的4文件”。承接原任务，固定参考提交、现有底座、功能完整、admin 验收及低阶实施/主控验收策略不变。

## 已核实的偏差

- `config/navigation/vue-pages.json` 将数据集目录旧正式路径映射到新增 `src/views/app/control/data-platform/data-space/catalog/DataSpaceCatalogPage.vue`。
- `packages/spark-app/src/router/dynamic.ts` 的 componentMap 命中会进入原生组件路由；配置页分支才进入既有 pageComponent/PageRuntime。
- 已做 D1a/b/c 只读业务核对有参考价值，但原生 Vue 页面本身不是用户要求的四文件交付。
- 在途 D1d 又为该原生页扩展 lifecycle、provider、transition。应停止此方向，先评估既有 PageRuntime/DataView 能力，不能为了保留已投入工作继续维护两套业务页生命周期。

## 当前源码合同

| 文件与入口 | 读到的事实 |
| --- | --- |
| `packages/spark-project-model/src/page/page-file.ts` | PAGE_TOOL_FILE_NAMES 只含 rule.json、script.js、style.css。 |
| `packages/spark-project-model/src/page/page-tool.ts` | PageTool 持工具定义、编辑历史和保存基线；不持业务 DataSet。 |
| `packages/spark-project-model/src/scenario/scenario-view-file.ts` | ScenarioViewFile 持单场景配置、草稿和保存基线。 |
| `packages/spark-project-model/src/scenario/scenario-view-config.ts` | pagedata 顶层为 scenarioId/tables/viewCascades；表通过 modelBinding 引用正式模型，不能塞入字段定义、运行行或租户凭据。 |
| `src/lowcode/lowcode-runtime.ts:createLowcodeProjectGateways` | 三工具文件位于 designfile 的 applicationId/pageId；场景文件位于 applicationId/SysForm/scenarioId/pagedata.json。场景文件不能经工具文件接口保存。 |
| `src/lowcode/data-space/lowcode-data-space-runtime.ts` | loadLowcodeRuntimeScenario 读取真实场景文件，再读取正式模型和关系；缺文件显式失败。 |
| `src/lowcode/data-space/lowcode-data-space-assembler.ts` | 按正式 modelId/modelName 校验绑定、装配独立 DataSet，并给 DataView 绑定既有统一查询保存 owner。 |
| `packages/spark-project-model/src/page/runtime-page.ts` | PageRuntime 持明确 scenarioIds/mainScenarioId、独立 instanceId 和 DataSet；脏状态来自 DataView，销毁使调用代次失效。 |
| `packages/spark-app/src/router/page-runtime-pool.ts` | 配置页根据正式 tool/project/node/query/hash 创建实例，读取三文件并装配场景；当前场景调用从明确 query 输入取值，不能假设与 native blueprintScenarioId 自动等价。 |
| `packages/spark-component/src/page/renderer/SparkPageRenderer.vue` | 渲染 rule 组件树，编译 script，按实例加载 style；调用释放销毁运行实例并中止脚本上下文。 |
| `packages/spark-component/src/page/context/buildPageContext.ts` | 脚本通过 $page.getDataSet/$page.resolveView 访问本次调用数据，服务和计时器有实例失效检查；不能假定任意 lowcodeApi TS 模块可直接 import 到脚本。 |

因此“四文件”按现有实现是工具三文件加共享场景 pagedata.json，不是恢复历史每页四文件混装协议。同场景的多个工具不能各自覆盖一份场景真源。

## 停止时的状态与证据边界

- 唯一代码执行者 implement_d1d 已中断并确认停止；未进入 catalog 新增。
- identity 聚焦测试在后续修改前曾 19/19；最后联合测试有一条失败，断言修正及新增撤权测试没有最终复验。不能把19/19写成当前冻结代码通过。
- 未执行最终 typecheck/lint/门禁、根全量、D1d build/browser 或业务新增。
- 执行者无 D1d 开工文件快照；旧 C2 已验收但未提交的改动与本轮混在同文件中。后续撤回需按具体增量并结合留存 hash/源码记录，禁止整文件 git checkout 覆盖既有工作。
- 原生身份/路由类中部分文件早于 D1d，执行者交接的“修改文件”不是可直接整删清单。

## 后续需要实证的点

1. 每个参考页面的组件树、操作、模型/场景、路由参数和权限到四文件的完整映射；29领域盘点不是页面级覆盖证明。
2. 首个目录试点的真实 pageId、原蓝图绑定、现有场景文件和正式三个模型身份；不发明ID，不写空文件覆盖共享配置。
3. 保持正式 URL/nodeId/query 语义时，既有 vue: 目标怎样切为 cfg: 工具及明确场景调用；组件注册表残留不能抢占 cfg 路由。
4. 创建人业务关联键与正式主键仍按已证实合同分别处理；使用 DataView 正式字段映射，不直接复用旧原生页的手工投影作为新管线事实。
5. DataView 的新增、提交中保护、失败/未知回执及重核行为逐项验证。若存在真实能力缺口，只在现有数据/页面运行链内提出精确补齐方案。
6. 专用设计器的必要引擎以本仓可配置组件承接；不能用整页 Vue 包装组件或巨型 Render 函数假装完成四文件迁移。
