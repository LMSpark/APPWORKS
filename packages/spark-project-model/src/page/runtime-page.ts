/**
 * @module @spark-appworks/spark-project-model:page/runtime-page
 * 职责：每次页面调用的数据装配与生命周期。
 * 边界：实例身份固定，数据集独占，代次失效必须销毁。
 * AI用途：装配明确场景、物化绑定及刷新干净实例。
 */
import { deepClone, isRecord } from '@spark-appworks/spark-utils'
import type { DataSet, DataView } from '@spark-appworks/spark-data'
import type { PageTool, PageToolDefinition } from './page-tool'
import { PageContentRuntime } from './content/runtime-content'

/** 一次页面调用的工具、明确场景列表及真实装配回调；局部绑定仅使用显式主场景。 */
export type PageRuntimeOptions = {
  tool: PageTool
  scenarioIds: readonly string[]
  mainScenarioId?: string
  instanceId?: string
  loadScenario: (scenarioId: string) => Promise<DataSet>
  loadTool?: () => Promise<PageTool>
}
/** 不可变调用身份快照，重载保持 instanceId，场景身份不能取默认首空间。 */
export type PageRuntimeCall = Readonly<{ instanceId: string; pageId: string; scenarioIds: readonly string[]; mainScenarioId?: string }>
type ExternalDirtySource = Readonly<{ isDirty: boolean; subscribe(listener: () => void): () => void }>
/** 一次页面调用拥有自身数据空间、代次和销毁边界；工具定义不持业务数据。 */
export class PageRuntime {
  readonly tool: PageTool
  readonly call: PageRuntimeCall
  readonly #loadScenario: PageRuntimeOptions['loadScenario']
  readonly #loadTool: PageRuntimeOptions['loadTool']
  readonly #dataSets = new Map<string,DataSet>()
  readonly #content = new Map<string,PageContentRuntime>()
  readonly #contentListeners = new Set<() => void>()
  readonly #externalDirtySources = new Map<string, { source: ExternalDirtySource; unsubscribe: () => void }>()
  #generation = 0
  #destroyed = false
  #loaded = false
  #configPending = false
  #loading: Promise<void> | undefined
  /** 创建独立调用 owner，验证场景身份；DataSet 在 load 后归此实例销毁。 */
  constructor(options:PageRuntimeOptions) {
    const ids=options.scenarioIds.map(id=>id.trim())
    if(ids.some(id=>!id || id.includes('@') || id.startsWith('#')) || new Set(ids).size!==ids.length)throw new Error('页面调用场景身份非法或重复')
    if(options.mainScenarioId && !ids.includes(options.mainScenarioId))throw new Error('主场景不属于本次调用')
    this.tool=options.tool;this.#loadScenario=options.loadScenario;this.#loadTool=options.loadTool
    this.call=Object.freeze({instanceId:options.instanceId ?? crypto.randomUUID(),pageId:options.tool.pageId,scenarioIds:Object.freeze(ids),...(options.mainScenarioId ? {mainScenarioId:options.mainScenarioId} : {})})
  }
  get instanceId():string { return this.call.instanceId }
  get pageId():string { return this.call.pageId }
  get generation():number { return this.#generation }
  get configPending():boolean { return this.#configPending }
  markConfigPending():void { this.#assertAlive();this.#configPending=true }
  /** 干净实例才允许刷新，失效旧代次并销毁旧数据集，保持调用身份。 */
  async reload():Promise<void> {
    this.#assertAlive();if(this.isDirty)throw new Error('PAGE_RUNTIME_DIRTY: 运行实例有未保存编辑，不能刷新配置')
    this.#clearExternalDirtySources()
    this.#generation++;this.#loaded=false;this.#loading=undefined
    for(const content of this.#content.values())content.dispose()
    this.#content.clear()
    for(const ds of this.#dataSets.values())ds.destroy()
    this.#dataSets.clear()
    await this.load()
  }
  get destroyed():boolean { return this.#destroyed }
  get isLoaded():boolean { return this.#loaded && !this.#destroyed }
  get isDirty():boolean { if([...this.#externalDirtySources.values()].some(entry=>entry.source.isDirty))return true;if([...this.#content.values()].some(content=>content.isDirty))return true;for(const ds of this.#dataSets.values())for(const table of Object.values(ds.tables))for(const view of Object.values(table.views))if(view.dirtyTracking.hasPendingChanges() || view.editingRows.length > 0)return true;return false }
  setExternalDirtySource(key:string,source:ExternalDirtySource|null):void {
    this.#assertAlive();if(!key.trim())throw new Error('PAGE_RUNTIME_EXTERNAL_DIRTY_KEY: 配置 owner 身份不能为空')
    const previous=this.#externalDirtySources.get(key)
    if(previous?.source===source)return
    if(previous?.source.isDirty)throw new Error('PAGE_RUNTIME_DIRTY: 不能替换有未保存修改的配置 owner')
    previous?.unsubscribe();this.#externalDirtySources.delete(key)
    if(source){const unsubscribe=source.subscribe(()=>{for(const listener of this.#contentListeners)listener()});this.#externalDirtySources.set(key,{source,unsubscribe})}
    for(const listener of this.#contentListeners)listener()
  }
  #clearExternalDirtySources():void { for(const entry of this.#externalDirtySources.values())entry.unsubscribe();this.#externalDirtySources.clear() }
  getContent(key:string):PageContentRuntime { this.#assertAlive();if(!key)throw new Error('页面内容身份不能为空');let content=this.#content.get(key);if(!content){content=new PageContentRuntime();content.subscribe(()=>{for(const listener of this.#contentListeners)listener()});this.#content.set(key,content)}return content }
  onContentChange(listener:()=>void):()=>void { this.#assertAlive();this.#contentListeners.add(listener);return ()=>this.#contentListeners.delete(listener) }
  /** 装载工具与每个声明场景；迟到或身份错误的数据集销毁并显式失败。 */
  async load():Promise<void> {
    this.#assertAlive();if(this.isLoaded)return;if(this.#loading)return this.#loading
    const generation=++this.#generation
    const loading=this.#load(generation).finally(()=>{if(this.#loading===loading)this.#loading=undefined})
    this.#loading=loading;return loading
  }
  async #load(generation:number):Promise<void> {
    if(this.#loadTool){const tool=await this.#loadTool();this.#assertGeneration(generation);if(tool!==this.tool)throw new Error('页面工具装载身份改变')}
    this.tool.toDefinition()
    const results=await Promise.allSettled(this.call.scenarioIds.map(id=>this.#loadScenario(id)))
    const dataSets=results.flatMap(result=>result.status==='fulfilled' ? [result.value] : [])
    try {
      this.#assertGeneration(generation)
      const failure=results.find(result=>result.status==='rejected');if(failure?.status==='rejected')throw failure.reason
      if(new Set(dataSets).size!==dataSets.length)throw new Error('页面场景共享了同一个运行数据集')
      for(let i=0;i<dataSets.length;i++){const ds=dataSets[i];const id=this.call.scenarioIds[i];if(!ds || !id || ds.scenarioId!==id || ds.destroyed)throw new Error('场景装配返回错误的数据空间身份');this.#dataSets.set(id,ds)}
      this.#loaded=true;this.#configPending=false
    } catch(error) {for(const ds of dataSets)ds.destroy();if(this.#generation===generation)this.#dataSets.clear();throw error}
  }
  getDataSet(scenarioId:string):DataSet|undefined { this.#assertAlive();return this.#dataSets.get(scenarioId) }
  /** 解析完整场景绑定或显式主场景局部绑定；未声明身份立即拒绝。 */
  resolveView(binding:string):DataView|undefined {
    this.#assertAlive()
    const parts=binding.startsWith('#') ? binding.slice(1).split('@') : binding.split('@')
    const scenarioId=binding.startsWith('#') ? parts.shift() : this.call.mainScenarioId
    if(!scenarioId || parts.length!==2 || parts.some(part=>!part))throw new Error('视图绑定必须是 #scenarioId@table@view；本地绑定必须声明主场景')
    if(!this.call.scenarioIds.includes(scenarioId))throw new Error(`视图场景未声明: ${scenarioId}`)
    return this.#dataSets.get(scenarioId)?.getView(parts[0] ?? '',parts[1] ?? '')
  }
  /** 复制工具规则并展开局部绑定，引用不存在的视图时失败，不修改原工具。 */
  materialize():PageToolDefinition {
    this.#assertAlive();if(!this.isLoaded)throw new Error('页面运行实例尚未装载')
    const definition=deepClone(this.tool.toDefinition())
    const visit=(value:unknown):void=>{
      if(Array.isArray(value)){value.forEach(visit);return}
      if(!isRecord(value))return
      const binding=value['dataViewKey']
      if(typeof binding==='string' && binding){
        if(!binding.startsWith('#')){
          if(!this.call.mainScenarioId)throw new Error('局部视图绑定必须声明主场景')
          if(binding.split('@').length!==2)throw new Error('局部视图绑定必须是 table@view')
          value['dataViewKey']=`#${this.call.mainScenarioId}@${binding}`
        }
        if (!this.resolveView(String(value['dataViewKey']))) throw new Error(`页面绑定的视图不存在: ${String(value['dataViewKey'])}`)
      }
      Object.values(value).forEach(visit)
    }
    visit(definition.rule);return definition
  }
  /** 销毁本次调用全部 DataSet，并使尚未完成的装配代次失效。 */
  dispose():void { if(this.#destroyed)return;this.#destroyed=true;this.#loaded=false;this.#generation++;this.#clearExternalDirtySources();for(const content of this.#content.values())content.dispose();this.#content.clear();this.#contentListeners.clear();for(const ds of this.#dataSets.values())ds.destroy();this.#dataSets.clear() }
  #assertAlive():void { if(this.#destroyed)throw new Error('PAGE_RUNTIME_DESTROYED: 页面调用已销毁') }
  #assertGeneration(generation:number):void { this.#assertAlive();if(generation!==this.#generation)throw new Error('PAGE_RUNTIME_STALE: 页面调用代次已失效') }
}
