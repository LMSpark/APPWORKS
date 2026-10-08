<!--
@module @spark-appworks/spark-component:page/renderer/SparkPageRenderer
职责：渲染 PageRuntime 物化定义并装载当前调用的场景、脚本和样式。
边界：借用宿主拥有的页面运行实例；卸载只释放渲染资源，最终实例由创建者销毁。
AI用途：接入页面调用渲染或检查多实例隔离、脚本响应更新和资源释放。
-->
<template>
  <div v-if="loading" class="spark-page-loading">
    <slot name="loading">加载中...</slot>
  </div>
  <div v-else-if="error" class="spark-page-error">
    <slot name="error" :error="error">
      <h3>❌ 页面加载失败</h3>
      <p>{{ error }}</p>
    </slot>
  </div>
  <div v-else>
    <!-- 动态注入页面样式（自动添加作用域） -->
    <component :is="'style'" v-if="scopedCss">{{ scopedCss }}</component>

    <!-- 页面内容树（rule.json → buildPageChildren → children，递归渲染） -->
    <div ref="pageContainer" :data-page="currentInstanceId" class="spark-page-container">
      <slot name="content" :children="children">
        <SparkComponentRenderer
          v-for="(child, i) in children"
          :key="nodeId(child) ?? `spark-child-${i}`"
          :config="child"
        />
      </slot>
    </div>
  </div>
</template>

<script setup lang="ts">
import { cloneVNode, toRaw, ref, watch, nextTick, getCurrentInstance, shallowRef, defineComponent, markRaw, onErrorCaptured, onUnmounted, isVNode, type VNode, type VNodeArrayChildren } from 'vue'
import { type SparkNode, getSparkNodeChildren, nodeId, SparkNodeTree } from '@spark-appworks/spark-data'
import { Logger, isCallable } from '@spark-appworks/spark-utils'
import type { PageRuntime, PageToolDefinition } from '@spark-appworks/spark-project-model'
import type { PageRoute } from '../../runtime'
import { PAGE_RUNTIME, PAGE_SERVICE, PAGE_PERMISSION_MODE, MODULE_CONTEXT, CSS_SCOPE } from '../../core/capability-keys'
import { useRendererSetup } from './useRendererSetup'
import { useCssScope } from './useCssScope'
import { compileFunctions } from '../createSandbox'
import { buildPageService, type PageServiceOverrides } from '../services/buildPageService'
import { buildPageContext } from '../context/buildPageContext'
import { buildPageChildren } from '../binding'
import type { PageContext } from '../context/types'
import { sparkBindPageRootContext, sparkResolveContextOwner, sparkUnbindPageRootContext } from '../../core/capability-context'
import SparkComponentRenderer from '../../components/SparkComponentRenderer.vue'
const logger = Logger('SparkPageRenderer')
/** 页面调用失败所处阶段，区分装载、脚本编译、初始化、函数执行和渲染。 */
type PageRuntimeErrorPhase = 'load' | 'script-compile' | 'init' | 'script-function' | 'render'
/** 当前页面运行失败诊断；包含阶段、工具身份和发生时间，不携带业务行或权限凭据。 */
type PageRuntimeErrorPayload = { phase: PageRuntimeErrorPhase; message: string; pageId: string; at: string }
/** 渲染器调用输入；运行实例与路由快照必须由宿主提供，回调用于装载和错误呈现。 */
type Props = {
 pageRuntime: PageRuntime
 routeSnapshot: PageRoute
 enableCssScope?: boolean
 messageService?: PageServiceOverrides['messageService']
 confirmService?: PageServiceOverrides['confirmService']
 beforeLoad?: (pageId: string) => void | Promise<void>
 afterLoad?: (state: PageToolDefinition) => void | Promise<void>
 onError?: (error: Error) => void
 onRuntimeError?: (payload: PageRuntimeErrorPayload) => void
}
const props = withDefaults(defineProps<Props>(), { enableCssScope: true })
const { router, sparkProvide, sparkConsume, loading, error, componentRegistry, pageRuntimeServices, runLoad } = useRendererSetup('spark-page', logger)
const instance = getCurrentInstance()
const capabilityContext = instance ? sparkResolveContextOwner(instance) : null
const moduleContext = sparkConsume(MODULE_CONTEXT)
const pageService = buildPageService(router, {messageService:props.messageService,confirmService:props.confirmService,pageService:pageRuntimeServices.pageService})
sparkProvide(PAGE_SERVICE,pageService)
sparkProvide(PAGE_PERMISSION_MODE,'masked')
const currentInstanceId = ref('')
const children = shallowRef<SparkNode[]>([])
const pageContainer = ref<HTMLElement|null>(null)
const {scopedCss,setScopedCss} = useCssScope({enableScope:props.enableCssScope})
sparkProvide(CSS_SCOPE,{inject(css:string){ setScopedCss(currentInstanceId.value,css) }})
let activeRuntime:PageRuntime|undefined
let controller:AbortController|undefined
let releaseViewSubscriptions:(()=>void)[]=[]
let pageContext:PageContext|undefined
let functions:Record<string,(...args:unknown[])=>unknown> = {}
let nodeTree:SparkNodeTree|null = null
let revision = 0
const renderRevision = ref(0)
const invalidate = () => { renderRevision.value++ }
function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
 return value !== null && (typeof value === 'object' || typeof value === 'function') && typeof Reflect.get(value,'then') === 'function'
}
function isRenderEventProp(key: string, value: unknown): boolean {
  if (!key.startsWith('on') || key.length <= 2) return false
  if (key.startsWith('onVnode')) return false
  if (isCallable(value)) return true
  return Array.isArray(value) && value.some(isCallable)
}

function wrapRenderEventHandler(
  handler: (...args: unknown[]) => unknown,
  invalidate: () => void,
): (...args: unknown[]) => unknown {
  return function wrappedRenderEvent(this: unknown, ...args: unknown[]) {
    try {
      const result = handler.apply(this, args)
      if (isPromiseLike(result)) {
        return Promise.resolve(result).finally(invalidate)
      }
      invalidate()
      return result
    } catch (error) {
      invalidate()
      throw error
    }
  }
}

function wrapRenderEventProp(value: unknown, invalidate: () => void): unknown {
  if (isCallable(value)) {
    return wrapRenderEventHandler(value, invalidate)
  }
  if (Array.isArray(value)) {
    return value.map(item => isCallable(item)
      ? wrapRenderEventHandler(item, invalidate)
      : item)
  }
  return value
}

function wrapVNodeChildren(childrenValue: VNode['children'], invalidate: () => void): VNode['children'] {
  if (!Array.isArray(childrenValue)) return childrenValue
  return childrenValue.map(item => wrapVNodeArrayChild(item, invalidate))
}

function wrapVNodeArrayChild(child: VNodeArrayChildren[number], invalidate: () => void): VNodeArrayChildren[number] {
  if (Array.isArray(child)) {
    return child.map(item => wrapVNodeArrayChild(item, invalidate))
  }
  if (!isVNode(child)) return child
  return wrapScriptVNode(child, invalidate)
}

function wrapScriptRenderOutput(output: unknown, invalidate: () => void): unknown {
  if (Array.isArray(output)) {
    return output.map(item => wrapScriptRenderOutput(item, invalidate))
  }
  if (!isVNode(output)) return output

  return wrapScriptVNode(output, invalidate)
}

function wrapScriptVNode(vnode: VNode, invalidate: () => void): VNode {
  const cloned = cloneVNode(vnode)
  const props = cloned.props
  if (props) {
    let hasWrappedEvent = false
    const nextProps: Record<string, unknown> = { ...props }
    for (const [key, value] of Object.entries(props)) {
      if (!isRenderEventProp(key, value)) continue
      nextProps[key] = wrapRenderEventProp(value, invalidate)
      hasWrappedEvent = true
    }
    if (hasWrappedEvent) {
      cloned.props = nextProps
    }
  }

  cloned.children = wrapVNodeChildren(cloned.children, invalidate)

  return cloned
}


function report(phase:PageRuntimeErrorPhase,runtime:PageRuntime,errorLike:unknown):void {
 const message=errorLike instanceof Error ? errorLike.stack ?? errorLike.message : String(errorLike)
 props.onRuntimeError?.({phase,message,pageId:runtime.pageId,at:new Date().toISOString()})
}
function registerRenders(current:Record<string,(...args:unknown[])=>unknown>,alive:()=>boolean):void {
 componentRegistry.clearRenders()
 for(const [name,fn] of Object.entries(current)) {
  if(!name.startsWith('Render'))continue
  const component=markRaw(defineComponent({name,setup:(_, {attrs})=>()=>{
   renderRevision.value
   if(!alive())return null
   return wrapScriptRenderOutput(fn({...attrs}),()=>{if(alive())invalidate()})
  }}))
  componentRegistry.registerRender(name,component)
  componentRegistry.registerRender(name.charAt(0).toLowerCase()+name.slice(1),component)
 }
}
function release():void {
 controller?.abort();controller=undefined
 for(const unsubscribe of releaseViewSubscriptions.splice(0))unsubscribe()
 componentRegistry.clearRenders();functions={};children.value=[];pageContext=undefined;nodeTree=null
 activeRuntime=undefined
}
async function loadConfig():Promise<void> {
 const runtime=toRaw(props.pageRuntime)
 if(activeRuntime && activeRuntime!==runtime && activeRuntime.isDirty)throw new Error('PAGE_RUNTIME_DIRTY: 页面存在未保存编辑')
 if(activeRuntime===runtime && runtime.isDirty)throw new Error('PAGE_RUNTIME_DIRTY: 页面存在未保存编辑')
 const token=++revision
 if(activeRuntime!==runtime)release()
 else {controller?.abort();for(const unsubscribe of releaseViewSubscriptions.splice(0))unsubscribe();componentRegistry.clearRenders()}
 activeRuntime=runtime;controller=new AbortController()
 const signal=controller.signal
 const alive=()=>token===revision && !signal.aborted && !runtime.destroyed && toRaw(props.pageRuntime)===runtime
 currentInstanceId.value=runtime.instanceId
 await runLoad(async(isStale)=>{
  const current=()=>alive() && !isStale()
  if(props.beforeLoad)await props.beforeLoad(runtime.pageId)
  if(!current())return
  await runtime.load()
  if(!current())return
  const definition=runtime.materialize()
  const route=props.routeSnapshot
  const refresh=()=>{if(current())invalidate()}
  for(const scenarioId of runtime.call.scenarioIds) {
   const ds=runtime.getDataSet(scenarioId)
   if(!ds)throw new Error(`页面场景尚未装载: ${scenarioId}`)
   ds.setAppServices(pageRuntimeServices);ds.setPageRoute(route)
   releaseViewSubscriptions.push(ds.onAnyViewChange({
    currentRowChanged:refresh,
    selectedRowsChanged:refresh,
    rowsChanged:refresh,
    cleared:refresh,
    configChanged:refresh,
    requestStateChanged:refresh,
    mutatingChanged:refresh,
    editingChanged:refresh,
    summaryChanged:refresh,
    selectionSummaryChanged:refresh,
   }))
  }
  sparkProvide(PAGE_RUNTIME,runtime)
  pageContext=buildPageContext({pageRuntime:runtime,signal,pageRoute:route,pageContainer,pageService,dataSpaceLayout:pageRuntimeServices.dataSpaceLayout,dataSpaceDesign:pageRuntimeServices.dataSpaceDesign,getComponentRegistry:()=>componentRegistry,getModuleContext:()=>moduleContext?.getCurrent() ?? null})
  setScopedCss(runtime.instanceId,definition.css ?? '')
  try {functions=compileFunctions(definition.script ?? '',pageContext)}
  catch(errorLike){report('script-compile',runtime,errorLike);throw errorLike}
  const currentFunctions=functions
  const callFunc=(name:string,...args:unknown[]):unknown=>{
   if(!current())throw new Error('PAGE_RUNTIME_STALE: 页面脚本已失效')
   const fn=currentFunctions[name];if(!fn)return undefined
   try {
    const result=fn(...args)
    if(isPromiseLike(result))return Promise.resolve(result).then(value=>{if(current())invalidate();return value},errorLike=>{if(current())report('script-function',runtime,errorLike);throw errorLike})
    invalidate();return result
   }catch(errorLike){if(current())report('script-function',runtime,errorLike);throw errorLike}
  }
  const callBeforeRender=(name:string,...args:unknown[]):unknown=>{
   renderRevision.value
   if(!current())throw new Error('PAGE_RUNTIME_STALE: 页面脚本已失效')
   const fn=currentFunctions[name];if(!fn)return undefined
   try {
    const result=fn(...args)
    if(isPromiseLike(result))return Promise.resolve(result).catch(errorLike=>{if(current())report('script-function',runtime,errorLike);throw errorLike})
    return result
   }catch(errorLike){if(current())report('script-function',runtime,errorLike);throw errorLike}
  }
  registerRenders(currentFunctions,current)
  nodeTree=SparkNodeTree.fromPageChildren(definition.rule)
  children.value=buildPageChildren(getSparkNodeChildren(nodeTree.root.children),{callFunc,callBeforeRender,actionCtx:{
   getDataSet(scenarioId:string){if(!current())throw new Error('PAGE_RUNTIME_STALE');return runtime.getDataSet(scenarioId) ?? null},
   resolveView(binding:string){if(!current())throw new Error('PAGE_RUNTIME_STALE');return runtime.resolveView(binding) ?? null},
   getPageService:()=>pageService,getRouter:()=>router,
  }})
  if(props.afterLoad)await props.afterLoad(definition)
  if(!current())return
 },errorLike=>{if(alive()){report('load',runtime,errorLike);props.onError?.(errorLike)}})
 if(!alive() || error.value)return
 await nextTick()
 if(!alive())return
 try {await functions['__init__']?.()}catch(errorLike){if(alive())report('init',runtime,errorLike)}
 if(!alive())return
 for(const id of runtime.call.scenarioIds){const ds=runtime.getDataSet(id);ds?.triggerAutoLoad();ds?.initAutoSelection()}
 invalidate()
}
onErrorCaptured(errorLike=>{if(activeRuntime && !controller?.signal.aborted)report('render',activeRuntime,errorLike)})
watch(()=>props.pageRuntime,()=>{void loadConfig().catch(errorLike=>{error.value=String(errorLike);props.onError?.(errorLike instanceof Error ? errorLike : new Error(String(errorLike)))})},{immediate:true,flush:'post'})
watch(pageContainer,(next,prev)=>{if(prev)sparkUnbindPageRootContext(prev);if(next && capabilityContext)sparkBindPageRootContext(next,capabilityContext)},{immediate:true})
onUnmounted(()=>{revision++;if(pageContainer.value)sparkUnbindPageRootContext(pageContainer.value);release()})
defineExpose({loadConfig,reload:loadConfig,get pageContext(){return pageContext},get pageRuntime(){return activeRuntime},get nodeTree(){return nodeTree}})
</script>
<style scoped>
.spark-page-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  color: #409eff;
  font-size: 14px;
}

.spark-page-error {
  padding: 20px;
  color: #f56c6c;
}

.spark-page-error h3 {
  margin: 0 0 10px;
  font-size: 16px;
}

.spark-page-error p {
  margin: 0;
  font-size: 14px;
}

.spark-page-container {
  width: 100%;
}
</style>
