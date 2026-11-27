<!--
@module app:views/features/integration/mp-open/ui/my-miniapp-page
职责：按当前登录人授权查询小程序及视频号账号目录，按正式小程序账号键打开关联读取工作区。
边界：目录只提交查询条件；关联查询由独立 PageRuntime 及命名视图承接，账号类型和正式原行读取权限决定可用入口。
AI用途：恢复原小程序管理直链的账号查询及关联读取，授权和渠道动作由正式服务另行承接。
-->
<template>
  <RendererSection title="我的小程序" :grid-columns="1" :bordered="false">
    <p v-if="loading" role="status">正在读取账号…</p>
    <p v-if="error || selectionError" role="alert">{{ error || selectionError }}</p>
    <RendererButton v-if="error && !loading" label="重试" @click="loadCurrentRoute" />
    <template v-if="ready">
      <RendererTable :data-view-key="viewKey" :children="columns" :filter="filter" :actions="actions" :auto-columns="false" />
      <RendererDialog v-if="selected !== null" :key="selected" :model-value="true" :append-to-body="true"
        title="小程序账号关联" width="min(1100px, 94vw)" @update:model-value="closeRelations">
        <MyMiniappRelations :account-key="selected" />
      </RendererDialog>
    </template>
  </RendererSection>
</template>

<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {type DataRow, type SparkNode} from '@spark-appworks/spark-data'
import {RendererButton, RendererDialog, RendererSection, RendererTable, type RFilterProps, type RToolbarProps} from '@spark-appworks/spark-component'
import {useFeaturePageRuntime} from '@/views/features/shared/runtime/use-feature-page-runtime'
import MyMiniappRelations from './my-miniapp-relations.vue'

const scenarioId = '547CB8AD9613D81428C2280A8FC22819'
const {viewKey,session,ready,loading,error,loadCurrentRoute} = useFeaturePageRuntime({
  scenarioId,navigationId:scenarioId,modelName:'base_enterprise_channel_account',viewId:'accounts',
  workingPlanRoute:'/features/integration/mp-open/ui/my-miniapp-page',componentType:'my-miniapp-catalog',title:'我的小程序',
})
const selected = ref<string|number|null>(null)
const selectionError = ref('')
const columns: SparkNode[] = [
  {type:'r-text',props:{field:'nick_name',label:'账号名称',readonly:true}},
  {type:'r-text',props:{field:'authorizer_appid',label:'授权 AppId',readonly:true}},
  {type:'r-text',props:{field:'provider',label:'渠道',readonly:true}},
  {type:'r-text',props:{field:'account_type',label:'账号类型',readonly:true}},
  {type:'r-text',props:{field:'authorization_status',label:'授权状态',readonly:true}},
  {type:'r-checkbox',props:{field:'enabled',label:'启用',readonly:true}},
]
const filter: RFilterProps = {
  autoQuery:false,queryOnReset:true,firstPageOnSearch:true,showExpressionEditor:false,showDataViewMeta:false,
  children:[
    {type:'r-text',props:{field:'nick_name',label:'账号名称',filterOp:'contains',filterTrim:true}},
    {type:'r-text',props:{field:'provider',label:'渠道',filterOp:'eq',filterTrim:true}},
    {type:'r-text',props:{field:'authorization_status',label:'授权状态',filterOp:'eq',filterTrim:true}},
  ],
}
const actions = computed<RToolbarProps>(() => ({children:[{
  type:'r-button',props:{dataViewKey:viewKey.value,label:'查看关联',link:true,onClick:openRelations},
}]}))
function openRelations(row: DataRow): void {
  selectionError.value = ''
  const view = ready.value ? session.runtime?.resolveView(viewKey.value) : undefined
  const key = row['id']
  try {
    if (!view || view.primaryKey!=='id' || !(typeof key==='number' && Number.isSafeInteger(key) || typeof key==='string' && key.trim())) {
      throw Error('当前账号缺少可读的正式记录键')
    }
    if (typeof key!=='number' && typeof key!=='string') throw Error('当前账号记录键不可用')
    view.captureReadRow(row,['id','account_type'])()
    if (row['account_type']!=='MINIAPP') throw Error('请选择小程序账号查看安装和部署记录')
    selected.value=key
  } catch (cause) {
    selectionError.value=cause instanceof Error ? cause.message : '无法打开当前账号关联'
  }
}
function closeRelations(open:boolean):void {if(!open) selected.value=null}
watch(ready,value=>{if(!value){selected.value=null;selectionError.value=''}})
</script>
