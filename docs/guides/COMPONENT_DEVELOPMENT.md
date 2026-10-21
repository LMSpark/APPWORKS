# 组件开发指南

组件通过 useSparkComponent、注册表和能力树协作；页面工具、场景数据和运行调用的 owner 不进入单个组件。完整公共面见 [组件 API](../../packages/spark-component/API.md)。

## AI 生成页面的合同链路

标准组件的属性、事件、数据成员与子节点约束，属于AI生成页面时必须查询的正式合同。当前编写页面的AI助手直接执行这条流程：业务语义与数据策划落到DataTable → 查询ClassModel后生成Vue或rule.json的布局与操作 → 绑定模型时按消费需要创建或复用DataView、指定数据成员 → 根据页面需要配置显式级联 → 验证交互、权限及持久结果。页面绑定完成前的结构是设计中的产物，不作为可运行页面交付。原生Vue样板也遵循此顺序，不能凭底层UI库经验编造属性或事件。

DataTable中记录的控件类型只为AI提供设计思路，不强制组件选择。选择取决于业务目的和页面交互；选定标准组件后，其真实属性、事件、数据成员与子节点合同必须成立。同模型可以按状态隔离需要具有多个DataView；刻意共享状态的区域可复用视图。运行结构保留default视图，不表示数据策划时就应预建全部页面专用视图。级联在真实输入与消费点明确后配置，不由控件类型或模型关系自动生成。

历史参考是《DataSet包与AI页面设计100步流程（数据规划优先版）》，原路径`docs/ai/dataset-page-design-ai-flow-100-steps-zh.md`，在提交`1d9fd0f38`中删除；原文留档 `page-design-100-steps-original.txt` 曾位于 `notes/evidence/data-space-config-storage/`（**2026-10-21 已删除**，见 [删除记录](../../notes/data-space-retirement-ledger.md)），仅用于追溯设计意图。当前执行对应为：

| 原步骤 | 本次生成页面时的使用方式 |
| --- | --- |
| 1—20：入口、盘点 | 读取现有业务页面、正式数据和配置，核对输入输出与异常路径 |
| 21—40：数据策划、最小表模型 | 落实DataTable模型、字段、正式身份与资源，不将数据策划等同于先画表格 |
| 41—50：模型关系 | 按当前完整过滤表达式合同维护稳定关系，替换旧字段对字段限制 |
| 51—70：页面规划、数据利用；89—92：组件结构 | 结合参考页面语义先生成布局与操作，ClassModel目录、概要、指南在生成前查询；在绑定消费点时确定数据成员 |
| 71—80：按需视图 | 绑定模型时创建或复用DataView，按实际分页、筛选、选择和编辑状态决定是否隔离 |
| 81—88：视图依赖 | 按当前值级联合同重做：多输入值变化→子选项查询→显式子值策略；旧文的自动推导、固定default端点不再适用 |
| 93—100：行为、样式、验证 | 补业务编排，核绑定、事件、权限、保存回读与独立重开；历史工具名和整份DataSet保存示例不作当前接口 |

原100步是因果链和核对清单，不能转成100轮审批。当前实现仍按工具三文件、共享场景配置和数据库记录各自的责任方执行；本次交付对象是业务页面，不因参考这份文档另建AI生成流程系统。

具体顺序：`model_query`按组件目录/层次列候选，`includeMembers: true`查询选定组件的成员概要，`model_class_guide`读取完整声明关系，再用`model_attribute_guide`、`model_action_guide`核所需成员。指南中的继承或交叉关系须继续查到成员所属模型，例如`RTreeProps`的节点事件属于自身，`dataViewKey`来自`SparkTableModelProps`。概览不能代替具体指南，单个类型未直接列出成员也不表示该组件没有此能力。

应用内AI通过`model_script`调用本次真实工作区的`ProjectWorkspace → project.openPageDesign → PageTool.setFileText`写工具三文件。数据空间配置的查询、编辑、取消与保存须经正式元数据DataView/DataSet，场景文件owner仅在资源适配内部处理原文、冲突及回读；现行AI的场景文件直改路径尚待接入，见[旧方案删除记录](../../notes/data-space-retirement-ledger.md)，不能作为新代码范例。AI助手直接修改仓库Vue/TS时，同样先查合同，再编写代码并执行本地验证；不把`model_script`伪装成本地文件写入工具，也不把查指南成功当作代码生成或保存成功。

ClassModel知识来自源码类型及JSDoc，经正式生成器投影到`generated/dts-class-model`，由`model_query`及对应guide按需查询。该产物是查询索引，不另建组件真源。查询到的声明须与实际消费者相符；发现缺失或不一致时修正对应源声明/实现并重新生成、验证，不能只写页面特例。属性Schema本身不证明原生Vue事件、配置事件或插槽都已完整投影，须沿对应查询合同核实。

迁移已有业务页面时，先把参考页的工作区、信息层次、对象选择、配置步骤和取消/异常路径映射到本仓业务语义，再选择布局、数据容器和字段组件；数据空间设计页同样遵循。标准组件无法承接某项已确认的业务交互时，先扩展已有标准组件或补齐组件层的标准能力，完善其声明、事件、DataView绑定及ClassModel指南，完成组件验证后再由业务页面组合使用。注册一个页面专用组件、把底层控件改名，或逐个替换按钮，都不能替代这条链。公共组件不承担模型注册、数据权限推导或数据库/场景文件保存。

标准组件的目标合同统一要求支持`dataViewKey`等标准数据属性，布局组件也须能定位并传递标准数据上下文。视图定位、数据成员和字段/值各有语义，按仓内已有声明及运行入口复用；例如表单当前使用`contextDataMember/contextDataField`，通用数据容器和展示组件使用相应的`dataMember/dataField`。新增或扩展时同时验证声明、ClassModel指南和实际绑定，不能只把属性透传到底层DOM。当前部分布局组件尚未具备这一合同，应先补齐再用于相应业务布局，不能将目标要求写成全库已实现的事实。

`RendererTabs/RendererTabPane`通过`LayoutDataContextProps`支持`dataViewKey/dataMember/dataField`，复用当前PageRuntime的原DataView，不主动查询或另建编辑状态。未显式绑定时继承父布局的视图和行；显式绑定默认取`currentRow`，集合或值成员不会被替换成当前行。切换命名视图会重建消费子树，切换页签则保留已挂载内容及草稿。ClassModel在`containers/layout`目录查询`r-tabs/r-tab-pane`，进入`RTabsProps/RTabPaneProps`后沿声明关系查询共享绑定指南；`onTabChange`用action guide查询。面板的配置children保留网格跨度，原生默认slot作为全宽内容区。

`RendererDialog`也复用`LayoutDataContextProps`，查询`r-dialog → RDialogProps → LayoutDataContextProps`核对绑定。弹窗内的表单与表格继续消费同一运行实例；关闭弹窗只改变可见性，确认、取消和持久化由业务流程分别处理。原生默认slot占满内容宽度，配置children仍按网格布局。

## 最小组件

```vue
<script setup lang="ts">
import { useSparkComponent } from '@spark-appworks/spark-component'
import type { SparkNode } from '@spark-appworks/spark-data'

type WidgetConfig = SparkNode & { title?: string }
const props = defineProps<{ config: WidgetConfig }>()
const { isVisible, isDisabled, logger } = useSparkComponent(props.config)
logger.debug('widget mounted')
</script>

<template>
  <div v-if="isVisible" :class="{ disabled: isDisabled }">{{ props.config.title }}</div>
</template>
```

组合函数在 setup 顶层调用。SparkNode 来自 spark-data；配置只声明实际组件属性，不创建无消费者的平行接口。

## 注册与插件

```ts
import { defineAsyncComponent } from 'vue'
import { Spark } from '@spark-appworks/spark-component'
import Widget from './Widget.vue'

Spark.register('my-widget', Widget)
Spark.register('lazy-widget', defineAsyncComponent(() => import('./Widget.vue')))
app.use(Spark.createPlugin())
```

注册已解析 Vue 组件，异步由调用方 defineAsyncComponent 显式表达。批量已解析组件可用 registerAll；glob 只负责静态模块发现，不把路径字符串注册成组件。普通组件 type 用 kebab-case。

脚本生成的 Render 组件由每次 PageRuntime 的 PageComponentRegistry 持有，不向 Spark 全局注册。共用工具的调用不能共享脚本闭包、组件状态或 CSS。

## useSparkComponent 与能力

useSparkComponent 返回 provider、isVisible、isDisabled、resolvedProps、sparkProvide/sparkRemove/sparkConsume 和 logger。能力沿父链就近查找；消费空值需按实际依赖决定延迟绑定还是明确失败，不能掩盖无效绑定。

| 能力 | 提供与消费 |
|---|---|
| PAGE_RUNTIME | 页面根提供本次 PageRuntime，容器/动作解析场景视图 |
| PAGE_SERVICE | 页面服务：消息、弹框、导航等调用内动作 |
| PAGE_RUNTIME_SERVICES | runtime 子入口提供的宿主服务合同 |
| DATA_SOURCE | 容器提供 DataView，字段和动作消费 |
| DATA_ROW | 行作用域提供当前业务行，配合 DataView 权限 |

```ts
import { DATA_SOURCE, PAGE_RUNTIME, useSparkComponent }
  from '@spark-appworks/spark-component'

const { sparkConsume, sparkProvide } = useSparkComponent(props.config)
const runtime = sparkConsume(PAGE_RUNTIME)
if (!runtime) throw new Error('页面调用未提供')
const view = runtime.resolveView(props.config.dataViewKey)
if (!view) throw new Error('视图不存在')
sparkProvide(DATA_SOURCE, view)
```

页面绑定为 scenarioId@modelName@viewId；正式模型名称取 modelBinding.modelName，本地模型取自身 tableName；局部 modelName@viewId 必须明确主场景。显式坏键不能降级到父容器或默认首空间。原生系统页也由宿主提供同一 PageRuntime，业务读写必须经 spark-data API；不能另建请求、权限或保存通道。

## 成员读取与领域事件

RendererForm/RendererDetail 的行上下文、默认插槽 row/model 及字段子组件共同读取所属 DataView 的编辑覆盖。未提交字段变化即可驱动条件子组件，取消编辑恢复原行，切换指针后沿新行身份读取；页面不必另写 watcher 同步表单值。aggregate/selectionAggregate 继续读取汇总成员，不应用某一行的编辑覆盖。

dataViewKey 定位视图，dataMember 指定 rows/currentRow/selectedRows/columns/total 等成员，dataField 指定对象成员内业务字段。展示组件读取字段时必须调用真实 DataView.fieldAccess，隐藏返回空值、脱敏返回占位，不暴露原值。

原生业务 Vue 同样使用仓内标准组件。页面结构只有子组件，由父容器类型及数据上下文决定渲染方式；Vue默认插槽和rule.json的children都遵循这一合同。表格行动作使用RTableProps.actions的RToolbarProps合同，以children编排标准动作子组件。当前 RendererForm 实际通过 `contextDataMember` / `contextDataField` 选择行上下文，字段组件通过 `field` 定位数据字段；不能把共享声明中的 `dataMember` 当作表单已接通的同义入口。命名视图设计区使用完整 `dataViewKey` 和 `contextDataMember="currentRow"`，字段修改进入原 DataView 编辑覆盖，取消和保存经DataView/DataSet，文件存储在其资源适配内部执行。其他容器应分别核对实际消费合同，不能机械套用属性名。

容器工具栏统一使用 `RToolbarProps → RendererToolbar`，`toolbar.children` 与 `toolbar.tail.children` 都是标准子组件。当前 Table、Tree、List、Form、Detail、VirtualCard、Tabs、Steps、Collapse 声明 `toolbar`；Table/Tree/List 的 `actions` 在各行或节点作用域下复用同一合同。不能只展开 children，丢失尾区、布局、标准数据绑定和 beforeRender。树/列表/表格不再各自定义动作配置类型。Dialog/Drawer 的 header/footer、Section 的 header 是各自区域合同，可组合标准子组件；不能因没有同名 toolbar 属性就另造动作协议，也不能将尚未声明的属性传到底层 DOM。

配置精简与类型完整是两个要求：未赋值属性按其声明的默认值运行，生成文件只写必要配置；属性定义仍须完整给出标准类型、枚举或模型引用、可选性和默认语义。工具栏位置用 `ToolbarPosition`，对齐用 `InlineAlign/InlineJustify`，间距为数字像素或 CSS 长度字符串，tail 引用 `RTailProps`，数据成员沿 `SparkTableModelProps` 使用 `DataMember`。默认位置 top、gap 8、zoneGap 12、align center、justify start；主区和尾区内容默认空，不生成业务动作。行内动作的位置由父容器解释。显式 0/false/有业务意义的空字符串不可用真值判断丢弃，不把默认值展开回配置文件。类型检查和实际渲染通过后，还须核正式 ClassModel 的属性类型、引用、可选性及默认说明，防止源码声明与生成指南不一致。

容器统一过滤使用 `RFilterProps → r-filter → DataViewFilterTree → DataView.setFilter/executeFilter`。过滤组件按 `dataViewKey` 定位视图，未指定时继承父容器 DATA_SOURCE；过滤结果由绑定同一视图的组件消费，命名视图之间不串用。完整表达式编辑器不要求 children，常用筛选项按需声明为标准子组件并复用 useFilterPanel；AND/OR、操作符和值函数沿 spark-data 合同。当前 Table 提供内嵌 `filter?: RFilterProps`，`filter: {}` 即启用默认过滤区，不配置 filter 才不显示；其他容器按自身区域/子组件合同组合 r-filter，不能传入尚未声明的 filter 属性。页面不自行拼请求、按 rows 另建过滤真源或借筛选条件扩大数据权限。查询错误和未保存编辑保护继续由 DataView 执行；组件配置在 rule.json/Vue，视图定义在 pagedata.json。AI 生成前查 ClassModel 的 `containers/zones → r-filter → RFilterProps`，内嵌表格再查 `RTableProps.filter`。

ClassModel 跨包引用必须解析本轮源码生成的同一份声明图，路径别名沿 emit 的 tsconfig 映射到内存声明，不能回落到旧 dist。已配置源码别名却缺声明时须报错；枚举与其字符串联合投影为无重复的取值集合。声明是类型真源，默认说明来自 JSDoc，运行组件按对应默认语义执行；生成器不靠样例值猜类型，也不因配置里未赋值就删除属性合同。

原生 Vue 使用 RendererButton 时，文案用 `label`，视觉类型用 `buttonType`，Vue 事件用 `@click`；其模板没有默认内容插槽。组件上下文归一化会排除 Vue vnode 的事件属性，不应把未声明的 `:on` 对象当作原生 Vue 的事件入口。按钮仍复用仓内组件，页面仅编排本页业务动作。

DataView events 按 rowsChanged/currentRowChanged/selectedRowsChanged/requestStateChanged 等领域事件通知。订阅在组件生命周期内建立，并在 unmount/dispose 解除；只用 computed 读非响应式 class 不保证更新。优先复用现有视图状态 hook，避免复制监听和快照逻辑。

选中通过 setCurrentRow/setCurrentRowById/setSelectedRows 等公开方法；编辑通过 updateEditingValue/editRowById/addRow/removeRow 等受控方法并检查结果。不要直接 push/splice rows 或把 UI 属性写入业务数据。

## 权限与异步动作

私有原 query context 是权限与保存 owner。组件消费 DataView 字段/动作状态；DATA_ROW 本身不能授权。页面模式只进一步收窄，E 写白名单、R 必填限于 E、h/m 联合真实行，树 c 独立控制增子行。

dirty 阻止覆盖，stale 暂停写入。动作集中经 PageRuntime.getDataSet(scenarioId)/resolveView(binding)，明确无效或空选择拒绝整次执行。异步拒绝不执行 then；旧调用销毁后，服务动作、timer 与迟到结果不得继续生效。

## 自定义能力与事件

```ts
import { defineCapability } from '@spark-appworks/spark-component'

type SearchCapability = { search(keyword: string): void }
const SEARCH = defineCapability<SearchCapability>('app:search')
sparkProvide(SEARCH, { search: keyword => runSearch(keyword) })
```

能力表达稳定消费者合同，不直接持其他组件实例。事件总线可以同样通过能力提供；订阅者必须保存 handler 并在释放时 off，不能遗留跨调用监听。

## 日志、样式与生命周期

logger 由页面运行服务统一提供，组件用 debug/info/warn/error 记录实际状态；错误应返回上层，不能用“展示空状态”掩盖缺能力。

组件样式用 scoped 与清晰类名；工具 style.css 经运行 instanceId 隔离。样式不能替代权限判断。谁创建 owner 谁负责释放；不要将带私有字段的类放入深层 Vue proxy，宿主按当前入口使用 markRaw/toRaw。

## 测试

Spark.createSystem 提供隔离 registry/rootContext/createContext；或挂载 Spark.createPlugin。构造父能力 provider 后挂载消费者，验证就近查找与销毁。

正式字段权限测试必须把真实响应装入 DataSpaceQueryContext，再经 DataView 查询装载提供 DATA_SOURCE；不能只注入带 lingma_sys_params 的裸行。局部静态组件可以用无 scenarioId 的 DataSet，但不能由它证明平台权限。

必要回归包括多调用 Render/CSS/计数隔离、关闭后旧动作与timer拒绝、真实字段隐藏/脱敏、视图不存在零执行、事件解绑，以及编辑选择状态一致。focused 测试只证明覆盖范围。

## 主从组件

rule.json 分别绑定 SCENE@Orders@grid 与 SCENE@Items@detail。输入级联只消费显式配置的绑定值变化，由 spark-data 重新查询子视图；字段级联再按配置约束子值。当前行只参与取值定位，模型关系不自动生成输入级联。组件通过 DataView 交互，不在两个组件之间传实例 ref 或手造 HTTP 请求。

- [数据管理](DATA_MANAGEMENT.md)
- [配置系统](CONFIG_SYSTEM.md)
- [文档入口](../README.md)
- [快速开始](QUICKSTART.md)
