# 仓内 Capability 相关代码使用核对（2026-10-27）

## 结论

“能力体系”在本仓指向至少三类不同概念，不能混为一谈：

1. Spark CapabilityContext 是活跃的生产运行时依赖注入机制；它传递对象引用和上下文，不等于业务能力目录或能力执行体系。
2. `ProjectBlueprint.capability` 是业务节点的名称/需求描述与交付责任元数据，参与 DevSystem 编辑和 AI 策划上下文，但没有因此形成可发现、可调用、可授权并由 DataView 驱动的业务能力闭环。
3. 菜单中的 `CapabilityDemo.vue` 是开发演示页，页面数据和 API 都是硬编码/模拟。它不证明真实业务能力闭环。

**范围纠偏：**本次只证明了 CapabilityContext 的底层运行时消费者，没有核清用户所指的“原来本仓能力体系”是否是参考仓中的业务能力模型、目录、工具/流程调用机制或工作台功能，也没有证明这些业务能力已被当前 DevSystem/SPARK data 整合。该项仍是开放分析项，不能用 DI 使用证据结案。

## 进一步对照业务能力方案与当前实现

- `notes/design-appworks-semantic-integration.md` 是已批准的整合设计书，其 §2 将参考仓 96 个页面语义归并成 44 项业务能力，包含 A2 蓝图、D1/D2 数据空间、C1-C4 结构化资源等；§3 列出应放在 `spark-data`、`spark-component`、`spark-lowcode-api` 的公共能力。它是实施蓝图，不是当前代码完成证据。
- `notes/research-project-blueprint-semantics.md` §167-178 提出“蓝图节点按种类暴露受限修改命令、由统一执行器负责治理”；当前代码定义了 `ProjectBlueprint.capability` 的元数据与 `ProjectBlueprintImplGate` 规划门禁，但本次搜索未发现按节点 kind 派发这些业务 mutation 的统一执行器。该部分仍属设计目标。
- `ProjectBlueprint.requiredCapabilities` 用于策划完成检查/Agent 规划工具的所需动作名称；它与可发现的业务能力目录、节点业务 mutation、CapabilityContext DI 键是不同概念。
- 因而更精确的状态是：**已有批准的业务能力目录和蓝图设计目标；底层运行时 DI 与部分策划动作有生产消费者；业务能力命令、目录到 SPA 消费者的逐项落实仍需以当前源码和唯一台账逐项核对**。不能把“44 项已纳入设计书”表述成 44 项已实现，也不能把该现状压缩成“本仓完全没有能力体系”。

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

现有 DI 继续服务真实运行实例和 DataView 上下文传递，沿用 `PAGE_RUNTIME → RendererTable/dataViewKey → DATA_SOURCE/DataRow → usePermission/DataView.fieldAccess`；权限依据仍是正式查询及 DataView，不把 ProjectBlueprint capability 元数据当授权键，也不在 CapabilityContext 上再造业务数据网关或权限算法。已批准的 44 项业务能力目录只证明目标范围已策划；逐项实现状态以当前源码和唯一台账为准。下一步核对蓝图的类型化命令方案与各能力 SPA 消费者，按能力身份、输入输出、数据绑定、授权、调用、结果和失败状态查清已实现、半接通与缺口，再动态选择最小切片。不能先把 DI 机制或设计文档当成业务能力实现。

本次为只读源码审计：未改产品代码、未运行测试、未访问线上业务写接口。
