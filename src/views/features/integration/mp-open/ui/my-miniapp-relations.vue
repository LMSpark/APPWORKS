<!--
@module app:views/features/integration/mp-open/ui/my-miniapp-relations
职责：以当前小程序的正式原账号键分别读取安装申请、渠道部署和生效运行绑定。
边界：每次打开有独立授权 PageRuntime，固定三项查询范围；绑定视图只展示经正式权限读取的关系字段。
AI用途：查看或独立重开一个账号的关联结果，账套和渠道命令都不从结果推导。
-->
<template>
  <p v-if="loading" role="status">正在读取账号关联…</p>
  <p v-if="error" role="alert">{{ error }}</p>
  <RendererButton v-if="error && !loading" label="重试" @click="loadCurrentRoute" />
  <template v-if="ready">
    <section v-for="relation in relations" :key="relation.key" :aria-label="relation.label">
      <h3>{{ relation.label }}</h3>
      <RendererTable :data-view-key="relation.key" :children="relation.columns" :auto-columns="false" :show-data-view-meta="true" />
    </section>
  </template>
</template>

<script setup lang="ts">
import {RendererButton, RendererTable} from '@spark-appworks/spark-component'
import {buildDataViewKey, type DataView, type DataViewFilterTree, type SparkNode} from '@spark-appworks/spark-data'
import {useFeaturePageRuntime} from '@/views/features/shared/runtime/use-feature-page-runtime'

const props=defineProps<{accountKey:string|number}>()
const scenarioId='547CB8AD9613D81428C2280A8FC22819'
const applications='base_channel_miniapp_template_application'
const deployments='base_channel_miniapp_deployment'
const bindings='base_channel_account_application'
const applicationKey=buildDataViewKey(applications,'applications',scenarioId)
const deploymentKey=buildDataViewKey(deployments,'deployments',scenarioId)
const bindingKey=buildDataViewKey(bindings,'bindings',scenarioId)
function text(fields:Readonly<Record<string,string>>):SparkNode[] {
  return Object.entries(fields).map(([field,label])=>({type:'r-text',props:{field,label,readonly:true}}))
}
const relations=[
  {label:'安装申请',key:applicationKey,columns:text({id:'申请编号',status:'申请状态',user_version:'版本号',deployment_id:'部署编号'})},
  {label:'渠道部署',key:deploymentKey,columns:text({id:'部署编号',status:'部署状态',user_version:'版本号',provider:'渠道'})},
  {label:'生效运行绑定',key:bindingKey,columns:text({id:'绑定编号',usage_code:'用途',status:'状态'})},
]
const {ready,loading,error,loadCurrentRoute}=useFeaturePageRuntime({
  scenarioId,navigationId:scenarioId,modelName:applications,viewId:'applications',
  workingPlanRoute:'/features/integration/mp-open/ui/my-miniapp-page',componentType:'my-miniapp-relations',title:'小程序账号关联',
  optionViews:[deploymentKey,bindingKey],independentInitialReads:true,
  prepareView(applicationView:DataView){
    const dataSet=applicationView.dataSet
    const deploy=dataSet?.getView(deployments,'deployments')
    const binding=dataSet?.getView(bindings,'bindings')
    if(!deploy || !binding) throw Error('当前账号关联视图未装配')
    const scope:DataViewFilterTree={field:'channel_account_id',operator:'eq',value:props.accountKey}
    applicationView.applyViewConfig({scopeFilter:scope})
    deploy.applyViewConfig({scopeFilter:scope})
    binding.applyViewConfig({scopeFilter:{logic:'and',filters:[scope,
      {field:'usage_code',operator:'eq',value:'RUNTIME'},{field:'status',operator:'eq',value:'ACTIVE'}]}})
  },
})
</script>
