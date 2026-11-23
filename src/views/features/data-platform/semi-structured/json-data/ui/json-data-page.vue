<template>
 <DisplayAlert v-if="error" alert-type="error" :title="error" :closable="false" />
 <SparkPageRenderer v-else-if="runtime && host" :page-runtime="runtime" :host="host"
  :route-snapshot="routeSnapshot" @error="reportError" />
</template>
<script setup lang="ts">
import {computed,onBeforeUnmount,ref,shallowRef,watch} from 'vue'
import {onBeforeRouteLeave,onBeforeRouteUpdate,useRoute} from 'vue-router'
import {NativePageRuntimeSession,useSystemPageDirtySource} from '@spark-appworks/spark-app'
import {DisplayAlert,SparkPageRenderer} from '@spark-appworks/spark-component'
import {PageTool,type PageRuntime} from '@spark-appworks/spark-project-model'
import {APPLICATION_CATALOG_PROJECT_ID,resolveExecutionProjectId} from '@/services/application-scope'
import {LowcodeJsonData} from '@/platform-adapters/resources/semi-structured/json-data/resource'
import {createJsonDataScriptHost} from './json-data-script-host'
import rule from './rule.json?raw'
import script from './script.js?raw'
import style from './style.css?raw'

const route=useRoute()
const routeSnapshot=computed(()=>{
 const {path,fullPath,name,params,query,hash}=route
 return {path,fullPath,name:name??null,params,query,hash}
})
const scenarioId=computed(()=>route.meta['blueprintScenarioId'])
const projectId=computed(()=>resolveExecutionProjectId(route.path))
const session=new NativePageRuntimeSession()
const runtime=shallowRef<PageRuntime>()
const host=shallowRef<ReturnType<typeof createJsonDataScriptHost>>()
const error=ref('')
const isDirty=()=>host.value?.isDirty===true
useSystemPageDirtySource({get isDirty(){return isDirty()}})
onBeforeRouteLeave(()=>!isDirty())
onBeforeRouteUpdate(()=>!isDirty())

function reportError(cause:Error):void{error.value=cause.message}

watch([scenarioId,projectId],([id,project])=>{
 runtime.value=undefined
 host.value=undefined
 session.dispose()
 error.value=''
 if(typeof id!=='string'||!id){error.value='JSON数据入口缺少导航数据空间ID';return}
 if(id!==LowcodeJsonData.navigationScenarioId){error.value='JSON目录场景身份不匹配';return}
 const inCatalog=project===APPLICATION_CATALOG_PROJECT_ID
 const tool=new PageTool({pageId:'json-data-page'})
 tool.hydrateFileText('rule.json',rule)
 tool.hydrateFileText('script.js',script)
 tool.hydrateFileText('style.css',style)
 tool.markLoaded()
 const current=session.acquire({tool,scenarioIds:[id],targetId:project===undefined?id:`${project}:${id}`,
  loadScenario:()=>LowcodeJsonData.loadCatalog(id,project)})
 host.value=createJsonDataScriptHost({runtime:current,scenarioId:id,assertCurrent:()=>{
  if(!session.isCurrent(current))throw new Error('JSON目录运行实例已失效')
 },editable:!inCatalog})
 runtime.value=current
},{immediate:true})
onBeforeUnmount(()=>session.dispose())
</script>
