# 仓内 Capability 能力体系使用情况（2026-10-27）

## 结论

“能力体系”在本仓指向至少三类不同概念，不能混为一谈：

1. Spark CapabilityContext 是活跃的生产运行时依赖注入机制。
2. `ProjectBlueprint.capability` 是业务节点的名称/需求描述元数据，参与 DevSystem 编辑和 AI 策划上下文，不是 runtime capability key。
3. 菜单中的 `CapabilityDemo.vue` 是开发演示页，页面数据和 API 都是硬编码/模拟。它不证明真实业务能力闭环。

## 运行时 DI 的实际生产调用

- 基础原语：`packages/spark-utils/src/capability/core.ts` 定义 `defineCapability`、`sparkProvide`、`sparkConsume`；消费时沿父上下文查找并执行 reader 校验。它本身不负责业务授权、查询或保存。
- 标准能力键：`packages/spark-component/src/core/capability-keys.ts` 定义 `PAGE_RUNTIME`、`DATA_SOURCE`（实际为 `DataView`）、`DATA_ROW`、`PAGE_SERVICE`、`PAGE_PERMISSION_MODE`、`SUBTREE_FIELD_POLICY` 等。
- 宿主注入：`src/App.vue` 提供 `PAGE_RUNTIME_SERVICES` 和 `MODULE_CONTEXT`；`packages/spark-component/src/page/renderer/useRendererSetup.ts` 继承/建立页面服务与组件注册表；`SparkPageRenderer.vue` 提供页面服务、权限呈现模式、CSS scope 与运行时。
- 数据组件消费：`packages/spark-component/src/components/containers/data-views/view-data-source.ts` 通过 `PAGE_RUNTIME` 解析完整 `dataViewKey`，向子组件提供解析到的 `DATA_SOURCE`。业务系统页也通过 `sparkProvide(PAGE_RUNTIME, runtime)` 提供自己的 PageRuntime；DevSystem 蓝图工作区、数据空间设计页、字典 AI 录入宿主均在生产代码中使用对应能力键。
- 权限呈现：`packages/spark-component/src/permission/usePermission.ts` 消费 `PAGE_PERMISSION_MODE`、`SUBTREE_FIELD_POLICY` 和 `DATA_SOURCE`，再读取绑定 DataView 的 `fieldAccess` 与行/模型操作状态。CapabilityContext 仅传递引用和上下文，不合并或伪造权限。数据仍由正式 `DataSet/DataView` 查询、编辑与保存 owner 承担。

## 蓝图业务 capability 元数据

`ProjectBlueprint.capability.name/description` 是蓝图节点的业务命名和短需求。DevSystem 的节点编辑表单维护它；ProjectBlueprint projection/planning parser 消费它；AI workflow prompt 要求候选节点以它表达目标。它是需求数据，不是 `CapabilityKey`、授权对象或数据访问服务。

## 演示入口状态

`config/navigation/vue-pages.json` 注册 `/capability-demo`，标题“能力管理演示”。但 `src/views/app/CapabilityDemo.vue` 不导入/使用 `sparkProvide`、`sparkConsume`，`providersCount` 固定为 4，页面数据写死、行新增本地数组模拟、API 请求用 timeout 伪造成功、导航示例只更新文案。因此该页面是 mock 演示，不应当作 capability 系统生产验收。`CustomRTableDemo.vue` 与 `RFormCompareDemo.vue` 同为演示/比较性质路由，其中 CustomRTableDemo 在 registry 中隐藏。

## 对当前整合任务的裁定

现有 DI 用作真实运行实例和 DataView 上下文传递，不应因 demo 有 mock 就判定底层能力体系未使用。继续保持 `PAGE_RUNTIME → RendererTable/dataViewKey → DATA_SOURCE/DataRow → usePermission/DataView.fieldAccess` 一条链；权限依据仍是正式查询及 DataView，不把 ProjectBlueprint capability 元数据当授权键，不在 CapabilityContext 上再造业务数据网关或权限算法。后续整页业务恢复如果绕过标准组件绑定/手传数组，应记为具体消费者断点并修复该消费者，不另起一套能力系统。

本次为只读源码审计：未改产品代码、未运行测试、未访问线上业务写接口。
