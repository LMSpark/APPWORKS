# 组件开发指南

组件通过 useSparkComponent、注册表和能力树协作；页面工具、场景数据和运行调用的 owner 不进入单个组件。完整公共面见 [组件 API](../../packages/spark-component/API.md)。

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

绑定为 #scenarioId@table@view；局部 table@view 必须明确主场景。显式坏键不能降级到父容器或默认首空间。

## 成员读取与领域事件

dataViewKey 定位视图，dataMember 指定 rows/currentRow/selectedRows/columns/total 等成员，dataField 指定对象成员内业务字段。展示组件读取字段时必须调用真实 DataView.fieldAccess，隐藏返回空值、脱敏返回占位，不暴露原值。

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

rule.json 分别绑定 #SCENE@Orders@grid 与 #SCENE@Items@detail。关系来自正式 readRelations 或明确 viewCascades；父 currentRow 改变由数据层驱动子视图，不在两个组件之间传实例 ref 或手造 HTTP 请求。

- [数据管理](DATA_MANAGEMENT.md)
- [配置系统](CONFIG_SYSTEM.md)
- [文档入口](../README.md)
- [快速开始](QUICKSTART.md)
