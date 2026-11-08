<!--
@module app:views/features/system/cache-management/ui/cache-management-page
职责：恢复缓存类型、缓存信息、当前页搜索、来源分页及单键删除确认。
边界：绑定同一PageRuntime的正式DataView；来源分页和命令提交由数据层适配，不引入原CacheManager或页面草稿。
-->
<template>
 <p v-if="loading" role="status">正在读取缓存类型…</p>
 <p v-if="error" role="alert">{{ error }}</p>
 <p v-if="needsSwitch" role="status">当前仍显示原导航的缓存工作区，请先处理原删除命令。</p>
 <RendererButton v-if="needsSwitch" label="切换到当前导航" :disabled="busy || pending || !!session" @click="loadCurrentRoute" />
 <div v-if="ready" class="cache-manager-page">
  <section class="cache-manager-page__sidebar panel-card">
   <header><h2>缓存类型</h2></header>
   <RendererTable :data-view-key="categoryKey" :children="categoryFields" :show-pagination="false" :show-data-view-meta="false" :highlight-current-row="true" />
  </section>
  <section class="cache-manager-page__content panel-card">
   <header><h2>缓存信息</h2></header>
   <RendererTable :data-view-key="listKey" :children="listFields" :actions="actions" :show-data-view-meta="false"
    :current-page-search="{fields:['cacheKey'],placeholder:'搜索当前页缓存键'}" :pagination="{pageSizes:[20,50,100],showJumper:false}" />
  </section>
  <CacheDeleteConfirmation v-if="session" :key="session.epoch" :data-view-key="commandKey" :record-id="session.id" @close="finish" />
 </div>
</template>
<script setup lang="ts">
import {computed,onBeforeUnmount,ref,watch} from 'vue'
import {useRoute} from 'vue-router'
import {NativePageRuntimeSession, useSystemPageDirtySource} from '@spark-appworks/spark-app'
import {buildDataViewKey,type DataSet,type DataRow,type SparkNode} from '@spark-appworks/spark-data'
import {PAGE_RUNTIME,RendererTable,RendererButton,useSparkComponent,type RToolbarProps,type DataViewRecordEditingFinish} from '@spark-appworks/spark-component'
import {loadLowcodeRuntimeScenario} from '@/lowcode/data-space/lowcode-data-space-runtime'
import {parseApplicationPathScope} from '@/services/application-scope'
import CacheDeleteConfirmation from './cache-delete-confirmation.vue'

const scenarioId='348D1C50B204C779AABBE2489C5E2FDF',route=useRoute()
const categoryKey=buildDataViewKey('缓存过滤条件','default',scenarioId),listKey=buildDataViewKey('获取缓存信息','default',scenarioId),commandKey=buildDataViewKey('CacheDeleteRequest','default',scenarioId)
const {sparkProvide,sparkRemove}=useSparkComponent({type:'cache-management-page'})
const runtimeSession=new NativePageRuntimeSession({
  provide:()=>undefined,
  remove:()=>sparkRemove(PAGE_RUNTIME),
})
const ready=ref(false),loading=ref(false),busy=ref(false),error=ref(''),revision=ref(0),session=ref<{id:string|number;epoch:number}>()
const target=computed(()=>({projectId:parseApplicationPathScope(route.path)?.projectId,scene:route.meta['blueprintScenarioId'],nodeId:route.meta['nodeId'],state:route.meta['systemPageIdentityState']}))
const openedIdentity=ref(''),needsSwitch=computed(()=>ready.value&&openedIdentity.value!==JSON.stringify(target.value))
let ds:DataSet|undefined,stop:(()=>void)|undefined,generation=0,epoch=0,active=true
const pending=computed(()=>{revision.value;const view=ds?.getView('CacheDeleteRequest');return !!view&&(view.hasUnconfirmedSave||view.hasEditingChanges()||view.dirtyTracking.hasPendingChanges())})
useSystemPageDirtySource({get isDirty(){return busy.value||pending.value||!!session.value}})
const categoryFields:SparkNode[]=[{type:'r-text',props:{field:'txt',label:'缓存类型',readonly:true}}]
const listFields:SparkNode[]=[{type:'r-text',props:{field:'cacheKey',label:'键',readonly:true}},{type:'r-text',props:{field:'cacheValue',label:'值',readonly:true}}]
const actions=computed<RToolbarProps>(()=>({children:[{type:'r-button',props:{label:'删除',buttonType:'danger',disabled:busy.value||pending.value||!!session.value,onClick:beginDelete}}]}))
async function beginDelete(row:DataRow):Promise<void>{
 if(busy.value||pending.value||session.value)return
 busy.value=true;error.value=''
 try{
  const original=ds,list=original?.getView('CacheEntries'),command=original?.getView('CacheDeleteRequest')
  if(!original||!list||!command||!list.rows.includes(row)||list.fieldAccess(row,'cacheKey').read!=='visible')throw Error('缺少原正式缓存行')
  list.setCurrentRow(row)
  const added=await command.addRow({key:row['cacheKey']})
  if(!active||original!==ds)return
  const id=command.getPkKey(added)
  if(id===undefined)throw Error('删除命令缺少原生身份')
  session.value={id,epoch:++epoch}
 }catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}
 finally{busy.value=false;revision.value++}
}
async function finish(result:DataViewRecordEditingFinish):Promise<void>{
 session.value=undefined
 if(result!=='saved')return
 const original=ds,view=original?.getView('CacheEntries')
 try{await view?.refresh();if(active&&original===ds&&view?.loadingError)throw view.loadingError}
 catch(cause){if(active&&original===ds)error.value=cause instanceof Error?cause.message:String(cause)}
}
async function loadCurrentRoute():Promise<void>{
 const {projectId,scene,nodeId,state}=target.value,identity=JSON.stringify(target.value)
 if(runtimeSession.runtime&&(pending.value||busy.value||session.value)){error.value='请先处理原缓存删除命令';return}
 const own=++generation
 ready.value=false;loading.value=true;error.value='';stop?.();ds=undefined;runtimeSession.dispose()
 let current:ReturnType<NativePageRuntimeSession['acquire']>|undefined
 try{
  if(typeof projectId!=='string'||!projectId||scene!==scenarioId||typeof nodeId!=='string'||!nodeId||state!=='resolved')throw Error('缓存管理入口缺少正式导航身份或数据空间绑定')
  current=runtimeSession.acquire({pageId:nodeId,scenarioIds:[scenarioId],targetId:`${projectId}:${nodeId}`,
    loadScenario:id=>loadLowcodeRuntimeScenario({projectId,scenarioId:id})})
  await current.load()
  if(!active||own!==generation||!runtimeSession.isCurrent(current))return
  const loaded=current.getDataSet(scenarioId),categories=loaded?.getView('CacheCategories'),command=loaded?.getView('CacheDeleteRequest')
  if(!loaded||!categories||!command)throw Error('缓存管理缺少正式场景视图')
  await command.refresh();await categories.refresh()
  if(categories.loadingError)throw categories.loadingError
  if(!active||own!==generation||!runtimeSession.isCurrent(current))return
  ds=loaded
  const changed=()=>{revision.value++}
  stop=loaded.onAnyViewChange({rowsChanged:changed,editingChanged:changed,requestStateChanged:changed,mutatingChanged:changed})
  if(active&&own===generation&&runtimeSession.isCurrent(current)){sparkProvide(PAGE_RUNTIME,current);openedIdentity.value=identity;ready.value=true}
 }catch(cause){if(current&&runtimeSession.isCurrent(current))runtimeSession.dispose();if(active&&own===generation)error.value=cause instanceof Error?cause.message:String(cause)}
 finally{if(active&&own===generation)loading.value=false}
}
watch(target,loadCurrentRoute,{immediate:true})
onBeforeUnmount(()=>{active=false;generation++;stop?.();runtimeSession.dispose()})
</script>
<style scoped>
.cache-manager-page{display:flex;gap:16px;height:100%;min-height:0;padding:16px}
.panel-card{display:flex;flex-direction:column;min-height:0;border:1px solid var(--el-border-color);border-radius:10px;overflow:hidden;background:var(--el-bg-color)}
.panel-card header{padding:14px 18px;border-bottom:1px solid var(--el-border-color)}
.panel-card h2{margin:0;font-size:18px}
.cache-manager-page__sidebar{width:300px;flex:none}
.cache-manager-page__content{flex:1;min-width:0}
@media(max-width:1200px){.cache-manager-page{flex-direction:column}.cache-manager-page__sidebar{width:100%}}
</style>
