<!--
@module app:views/features/system/cache-management/ui/cache-management-page
职责：恢复缓存类型、缓存信息、当前页搜索、来源分页及单键删除确认。
边界：绑定同一PageRuntime的正式DataView；来源分页和命令提交由数据层适配，不引入原CacheManager或页面草稿。
-->
<template>
 <RendererSection class="cache-manager" :bordered="false" :grid-columns="1" :grid-gap="12"
  :status="loading ? '正在读取缓存类型…' : needsSwitch ? '当前仍显示原导航的缓存工作区，请先处理原删除命令。' : ''"
  :error="error" :retryable="!loading && !ready" @retry="loadCurrentRoute">
  <RendererButton v-if="needsSwitch" label="切换到当前导航" :disabled="busy || pending || !!session" @click="loadCurrentRoute" />
  <SparkPageRenderer v-if="runtime && host" :page-runtime="runtime" :route-snapshot="routeSnapshot" :host="host" :auto-load="false" />
  <CacheDeleteConfirmation v-if="ready && session" :key="session.epoch" :data-view-key="commandKey" :record-id="session.id" @close="finish" />
 </RendererSection>
</template>
<script setup lang="ts">
import {computed,onBeforeUnmount,ref,watch} from 'vue'
import {useRoute} from 'vue-router'
import {PageTool} from '@spark-appworks/spark-project-model'
import {NativePageRuntimeSession, useSystemPageDirtySource} from '@spark-appworks/spark-app'
import {buildDataViewKey,isDataRow,type DataSet,type DataRow} from '@spark-appworks/spark-data'
import {PAGE_RUNTIME,RendererSection,SparkPageRenderer,RendererButton,useSparkComponent,type DataViewRecordEditingFinish} from '@spark-appworks/spark-component'
import {loadLowcodeRuntimeScenario} from '@/platform-adapters/data-space/lowcode-data-space-runtime'
import {parseApplicationPathScope} from '@/services/application-scope'
import CacheDeleteConfirmation from './cache-delete-confirmation.vue'
import rule from './tool/rule.json?raw'
import script from './tool/script.js?raw'
import style from './tool/style.css?raw'

const scenarioId='348D1C50B204C779AABBE2489C5E2FDF',route=useRoute()
const commandKey=buildDataViewKey('CacheDeleteRequest','default',scenarioId)
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
const runtime=computed(()=>ready.value?runtimeSession.runtime:undefined)
const routeSnapshot=computed(()=>{
 const {path,fullPath,name,params,query,hash}=route
 return {path,fullPath,name:name??null,params,query,hash}
})
const host=computed(()=>{
 const current=runtime.value
 if(!current)return undefined
 const assertCurrent=()=>{if(!active||!runtimeSession.isCurrent(current))throw Error('缓存工作区运行实例已失效')}
 return {runtime:current,assertCurrent,async invoke(command:string,input:unknown){
  assertCurrent()
  if(command==='cache.connect')return {deleteDisabled:()=>busy.value||pending.value||!!session.value}
  if(command==='cache.delete'&&isDataRow(input))await beginDelete(input)
  return undefined
 }}
})
async function beginDelete(row:DataRow):Promise<void>{
 if(busy.value||pending.value||session.value)return
 busy.value=true;error.value=''
 try{
  const original=ds,list=original?.getView('CacheEntries'),command=original?.getView('CacheDeleteRequest')
  if(!original||!list||!command||!list.rows.includes(row)||list.fieldAccess(row,'cacheKey').read!=='visible')throw Error('缺少原正式缓存行')
  if(list.deleteActionState(row)!=='enabled')throw Error('当前缓存无法确认删除权限')
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
  const tool=new PageTool({pageId:nodeId})
  tool.hydrateFileText('rule.json',rule)
  tool.hydrateFileText('script.js',script)
  tool.hydrateFileText('style.css',style)
  tool.markLoaded()
  current=runtimeSession.acquire({tool,scenarioIds:[scenarioId],targetId:`${projectId}:${nodeId}`,
    loadScenario:id=>loadLowcodeRuntimeScenario({projectId,scenarioId:id})})
  await current.load()
  if(!active||own!==generation||!runtimeSession.isCurrent(current))return
  const loaded=current.getDataSet(scenarioId),categories=loaded?.getView('CacheCategories'),command=loaded?.getView('CacheDeleteRequest')
  if(!loaded||!categories||!command)throw Error('缓存管理缺少正式场景视图')
  await command.refresh()
  if(command.loadingError)throw command.loadingError
  if(!active||own!==generation||!runtimeSession.isCurrent(current))return
  await categories.refresh()
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
.cache-manager{padding:8px}
</style>
