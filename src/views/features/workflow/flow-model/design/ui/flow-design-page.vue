<!--
@module app:views/features/workflow/flow-model/design/ui/flow-design-page
职责：把原目录调用的设计工具绑定到正式模型、图、表单、授权和文件视图。
边界：复用父 PAGE_RUNTIME 和原保存编排，只提供本轮设计所需的动作。
-->
<template>
  <SparkPageRenderer v-if="runtime && host" :page-runtime="runtime" :host="host" :route-snapshot="routeSnapshot"
    :auto-load="false" />
  <RendererSection v-else title="流程设计" :bordered="false" :grid-columns="1"
    :status="loading ? '正在打开流程设计…' : ''" :error="error" :retryable="!loading" @retry="load()" />
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref, shallowRef, watch} from 'vue'
import {useRoute} from 'vue-router'
import {PAGE_RUNTIME, RendererSection, SparkPageRenderer, useSparkComponent, type GraphSelection} from '@spark-appworks/spark-component'
import {isRecord} from '@spark-appworks/spark-utils'
import {
  FLOW_DESIGN_SCENARIO_ID, FLOW_RELATION_EDGE_MARKERS, addFlowDesignEdge,
  addFlowDesignNode,
  prepareFlowDesignViews,
  removeFlowDesignGraphSelection,
  saveFlowDesignInfo,flowDesignWorkspaceViews,flowDesignGraphLayout,stageFlowDesignGraph,cancelFlowDesignChanges,hasFlowDesignChanges,
  syncFlowDesignNodeAuthView,
  type FlowDesignPreparedViews,
} from '@/platform-adapters/resources/system/workflow/manage'
import {useSystemPageDirtySource} from '@spark-appworks/spark-app'

import FlowDesignNodePanel from './node-panel/flow-design-node-panel.vue'
import FlowDesignEdgePanel from './edge-panel/flow-design-edge-panel.vue'
import FlowDesignFormPanel from './form-panel/flow-design-form-panel.vue'
import FlowDesignNodeAuthPanel from './node-panel/flow-design-node-auth-panel.vue'

const props = defineProps<{flowModelId: string; assertOpen?: () => void; afterSave?: () => Promise<void>}>()
const emit=defineEmits<{closeBlocked:[value:boolean]}>()
const route = useRoute()
const flowModelId = computed(() => String(props.flowModelId ?? '').trim())
const {sparkConsume} = useSparkComponent({type: 'flow-design-page'})
const ready = ref(false), loading = ref(false), saving = ref(false), acting=ref(false),error = ref(''),revision=ref(0)
let off:(()=>void)|undefined
const prepared = shallowRef<FlowDesignPreparedViews>(),loadedTarget=ref('')
const nodeAuthViewKey = ref('')
let nodeAuthSelectionVersion = 0
const graphSelection = ref<Readonly<{kind: 'node' | 'edge'; id: string | number}> | null>(null)
const selectedNodeId = computed(() => {
  const sel = graphSelection.value
  if (!sel || sel.kind !== 'node') return ''
  return String(sel.id).trim()
})
const currentCommand=()=>{const runtime=sparkConsume(PAGE_RUNTIME),own=generation,targetId=flowModelId.value
 props.assertOpen?.()
 if(!runtime)throw Error('流程设计缺少父页运行实例')
 if(loadedTarget.value&&loadedTarget.value!==targetId)throw Error('原流程仍有修改，不能操作新目标')
 return {runtime,flowModelId:targetId,assertCurrent:()=>{props.assertOpen?.()
  if(own!==generation||flowModelId.value!==targetId||sparkConsume(PAGE_RUNTIME)!==runtime)throw Error('原流程设计目标已变化')}}}
const graphLayout=computed(()=>{revision.value;if(!ready.value||loadedTarget.value!==flowModelId.value)return {nodePositions:{},edgePaths:{}};return flowDesignGraphLayout(currentCommand())})
const unconfirmed=computed(()=>{revision.value;if(!ready.value)return false;try{const runtime=sparkConsume(PAGE_RUNTIME);return !runtime||flowDesignWorkspaceViews({runtime,flowModelId:loadedTarget.value}).some(view=>view.hasUnconfirmedSave)}catch{return true}})
const closeBlocked=computed(()=>{revision.value;if(saving.value||acting.value)return true;if(!ready.value)return false;try{const runtime=sparkConsume(PAGE_RUNTIME);return !runtime||hasFlowDesignChanges({runtime,flowModelId:loadedTarget.value})}catch{return true}})
watch(closeBlocked,value=>emit('closeBlocked',value),{immediate:true,flush:'sync'})
useSystemPageDirtySource({get isDirty(){return closeBlocked.value}})
const draggableNodeKeys = computed(() => {
  revision.value
  const runtime = sparkConsume(PAGE_RUNTIME)
  const key = prepared.value?.nodeViewKey
  if (!runtime || !key) return []
  const view = runtime.resolveView(key)
  if (!view || view.destroyed) return []
  return view.rows.flatMap(row => {
    if (view.fieldAccess(row, view.primaryKey).read !== 'visible') return []
    const id = view.getPkKey(row)
    return id === undefined ? [] : [id]
  })
})
const nodeHighlightId = computed(() => graphSelection.value?.kind === 'node' ? graphSelection.value.id : null)
const edgeHighlightId = computed(() => graphSelection.value?.kind === 'edge' ? graphSelection.value.id : null)
let generation = 0
let active = true
const runtime = computed(() => ready.value && prepared.value ? sparkConsume(PAGE_RUNTIME) : undefined)
const routeSnapshot = computed(() => {
  const {path, fullPath, name, params, query, hash} = route
  return {path, fullPath, name: name ?? null, params, query, hash}
})
const graphDisabled = computed(() => saving.value || loading.value || acting.value || unconfirmed.value
  || loadedTarget.value !== flowModelId.value)

function isGraphId(value: unknown): value is string | number {
  return typeof value === 'string' || typeof value === 'number'
}
const host = computed(() => {
  const current = runtime.value
  if (!current) return undefined
  const assertCurrent = () => {
    props.assertOpen?.()
    if (!active || current.destroyed || sparkConsume(PAGE_RUNTIME) !== current) throw Error('原流程设计实例已失效')
  }
  return {runtime: current, assertCurrent, async invoke(command: string, input: unknown) {
    assertCurrent()
    if (command === 'approvalDesign.connect') {
      return {
        edgeMarkers: FLOW_RELATION_EDGE_MARKERS,
        panels: {node: FlowDesignNodePanel, edge: FlowDesignEdgePanel, form: FlowDesignFormPanel, auth: FlowDesignNodeAuthPanel},
        state: () => {
          const data = prepared.value
          if (!data) return undefined
          return {modelTitle: data.modelTitle, nodeViewKey: data.nodeViewKey, edgeViewKey: data.edgeViewKey,
            workFormViewKey: data.workFormViewKey, nodeAuthViewKey: nodeAuthViewKey.value, selectedNodeId: selectedNodeId.value,
            flowModelId: loadedTarget.value, graphSelection: graphSelection.value, graphLayout: graphLayout.value,
            draggableNodeKeys: draggableNodeKeys.value, nodeHighlightId: nodeHighlightId.value, edgeHighlightId: edgeHighlightId.value,
            graphDisabled: graphDisabled.value, loading: loading.value, error: error.value, unconfirmed: unconfirmed.value,
            cancelDisabled: loading.value || saving.value || acting.value || unconfirmed.value,
            saveDisabled: saving.value || acting.value || loadedTarget.value !== flowModelId.value}
        },
      }
    }
    if (command === 'approvalDesign.cancel') {
      if (!loading.value && !saving.value && !acting.value && !unconfirmed.value) await cancelChanges()
      return undefined
    }
    if (command === 'approvalDesign.save') {
      if (!acting.value) await saveDesign()
      return undefined
    }
    if (graphDisabled.value) return undefined
    switch (command) {
      case 'approvalDesign.selectNode': if (isGraphId(input)) onGraphSelect({kind: 'node', id: input}); break
      case 'approvalDesign.selectEdge': if (isGraphId(input)) onGraphSelect({kind: 'edge', id: input}); break
      case 'approvalDesign.selectGraph':
        if (isRecord(input) && (input['kind'] === 'node' || input['kind'] === 'edge') && isGraphId(input['id'])) {
          const accepted = onGraphSelect({kind: input['kind'], id: input['id']})
          const control = input['control']
          if (!accepted && isRecord(control) && typeof control['cancel'] === 'boolean') control['cancel'] = true
        }
        break
      case 'approvalDesign.move':
        if (isRecord(input) && isGraphId(input['id']) && typeof input['x'] === 'number' && Number.isFinite(input['x'])
          && typeof input['y'] === 'number' && Number.isFinite(input['y'])) {
          await onNodeMove({id: input['id'], x: input['x'], y: input['y']})
        }
        break
      case 'approvalDesign.link':
        if (isRecord(input) && isGraphId(input['source']) && isGraphId(input['target'])) {
          await onGraphConnect({source: input['source'], target: input['target']})
        }
        break
      case 'approvalDesign.add': await addNode(); break
      case 'approvalDesign.remove': await removeSelection(); break
      default: throw Error('流程设计工具动作未登记')
    }
    return undefined
  }}
})

function assertNodeAuthCanChangeSelection(): void {
  const view = sparkConsume(PAGE_RUNTIME)?.getDataSet(FLOW_DESIGN_SCENARIO_ID)?.getView('FunctionNodeAuth', 'nodeAuth')
  if (view?.mutating) throw Error('当前节点权限正在提交，请稍候再切换')
  view?.assertResultReplacementAllowed()
}

function applyGraphSelection(selection: Pick<GraphSelection, 'kind' | 'id'> | null): void {
  nodeAuthSelectionVersion++
  nodeAuthViewKey.value = ''
  graphSelection.value = selection
  if (selection?.kind !== 'node') return
  const viewKey = prepared.value?.nodeViewKey
  const view = viewKey ? sparkConsume(PAGE_RUNTIME)?.resolveView(viewKey) : undefined
  if (view?.dirtyTracking.isPendingCreate(selection.id)) return
  void refreshNodeAuth(selection.id, nodeAuthSelectionVersion)
}

function onGraphSelect(event: Pick<GraphSelection, 'kind' | 'id'>): boolean {
  const previous = graphSelection.value
  if (previous?.kind === event.kind && previous.id === event.id && nodeAuthViewKey.value) return true
  try {
    assertNodeAuthCanChangeSelection()
    applyGraphSelection(event)
    return true
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
    return false
  }
}

async function onNodeMove(event:{id:string|number;x:number;y:number}):Promise<void>{
 if(saving.value||acting.value||unconfirmed.value)return
 acting.value=true
 try{await stageFlowDesignGraph({...currentCommand(),layoutOverride:{nodePositions:{[String(event.id)]:{x:event.x,y:event.y}}}})}
 catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}finally{acting.value=false}
}
async function onGraphConnect(event:{source:string|number;target:string|number}):Promise<void>{
 if(saving.value||acting.value||unconfirmed.value)return
 acting.value=true
 try{assertNodeAuthCanChangeSelection();const command=currentCommand(),result=await addFlowDesignEdge({...command,parentId:String(event.source),childId:String(event.target),layoutOverride:{}})
  command.assertCurrent();await stageFlowDesignGraph(command);applyGraphSelection({kind:'edge',id:result.edgeId})}
 catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}finally{acting.value=false}
}
async function addNode():Promise<void>{
 if(saving.value||acting.value||unconfirmed.value)return
 acting.value=true
 try{assertNodeAuthCanChangeSelection();const command=currentCommand(),result=await addFlowDesignNode({...command,layoutOverride:{}})
  command.assertCurrent();await stageFlowDesignGraph({...command,layoutOverride:result.layoutOverride});applyGraphSelection({kind:'node',id:result.nodeId})}
 catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}finally{acting.value=false}
}
async function removeSelection():Promise<void>{
 const selection=graphSelection.value
 if(!selection||saving.value||acting.value||unconfirmed.value)return
 acting.value=true
 try{assertNodeAuthCanChangeSelection();const command=currentCommand();await removeFlowDesignGraphSelection({...command,selection:{kind:selection.kind,id:String(selection.id)},layoutOverride:{}})
  command.assertCurrent();await stageFlowDesignGraph(command);applyGraphSelection(null)}
 catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}finally{acting.value=false}
}
async function cancelChanges():Promise<void>{
 try{const runtime=sparkConsume(PAGE_RUNTIME);if(!runtime)throw Error('缺少原实例');cancelFlowDesignChanges({runtime,flowModelId:loadedTarget.value});applyGraphSelection(null);error.value='';if(loadedTarget.value!==flowModelId.value)await load(true)}catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}
}

async function refreshNodeAuth(selectedId: string | number, selectionVersion: number): Promise<void> {
  const nodeId = String(selectedId).trim()
  if (loadedTarget.value !== flowModelId.value || !nodeId) return
  const isSelected = () => selectionVersion === nodeAuthSelectionVersion && selectedNodeId.value === nodeId
  const targetId = loadedTarget.value
  try {
    const command = currentCommand()
    const nodeKey = prepared.value?.nodeViewKey
    const nodeView = nodeKey ? command.runtime.resolveView(nodeKey) : undefined
    const row = nodeView?.rows.find(item => nodeView.getPkKey(item) === selectedId)
    if (!nodeKey || !nodeView || !row) throw Error('未读取到原流程节点')
    const assertNodeRead = nodeView.captureReadRow(row, [nodeView.primaryKey])
    const assertCurrent = () => {
      command.assertCurrent()
      if (!isSelected() || prepared.value?.nodeViewKey !== nodeKey || command.runtime.resolveView(nodeKey) !== nodeView) {
        throw Error('原节点配置目标已变化')
      }
      assertNodeRead()
    }
    const viewKey = await syncFlowDesignNodeAuthView({
      runtime: command.runtime,
      flowModelId: command.flowModelId,
      selectedNodeId: nodeId,
      assertCurrent,
    })
    assertCurrent()
    nodeAuthViewKey.value = viewKey
  } catch (cause) {
    if (isSelected() && active && loadedTarget.value === targetId && flowModelId.value === targetId) {
      error.value = cause instanceof Error ? cause.message : String(cause)
    }
  }
}

async function refreshPrepared(clearSelection = false): Promise<void> {
  const own = generation, targetId = flowModelId.value
  try {
    props.assertOpen?.()
    const runtime = sparkConsume(PAGE_RUNTIME)
    if (!runtime) throw new Error('流程设计缺少父页运行实例')
    const next = await prepareFlowDesignViews(runtime, targetId, {assertCurrent: () => {
      props.assertOpen?.()
      if (own !== generation || flowModelId.value !== targetId || sparkConsume(PAGE_RUNTIME) !== runtime) throw Error('原流程设计读取已失效')
    }})
    if (own !== generation) return
    loadedTarget.value=targetId
    prepared.value = next
    off?.();const dataSet=runtime.getDataSet(FLOW_DESIGN_SCENARIO_ID)
    const changed=()=>{revision.value++}
    off=dataSet?.onAnyViewChange({rowsChanged:changed,editingChanged:changed,requestStateChanged:changed,mutatingChanged:changed})
    ready.value = true
    if (clearSelection) applyGraphSelection(null)
  } catch (cause) {
    if (own === generation) error.value = cause instanceof Error ? cause.message : String(cause)
  }
}

async function load(preserveTool = false): Promise<void> {
  const own = ++generation
  if(ready.value&&loadedTarget.value){try{const runtime=sparkConsume(PAGE_RUNTIME)
    if(runtime&&hasFlowDesignChanges({runtime,flowModelId:loadedTarget.value})){error.value=`流程${loadedTarget.value}仍有未保存修改，请先处理原工作区`;return}}
    catch(cause){error.value=cause instanceof Error?cause.message:String(cause);return}}

  if (!preserveTool) {
    ready.value = false
    prepared.value = undefined
  }
  loading.value = true
  error.value = ''
  applyGraphSelection(null)
  try {
    await refreshPrepared(true)
  } finally {
    if (own === generation) loading.value = false
  }
}

async function saveDesign(): Promise<void> {
  if (saving.value || loadedTarget.value!==flowModelId.value) return
  const own = ++generation, targetId = flowModelId.value
  saving.value = true
  error.value = ''
  try {
    const runtime = sparkConsume(PAGE_RUNTIME)
    if (!runtime) throw new Error('流程设计缺少父页运行实例')
    const changed = hasFlowDesignChanges({runtime, flowModelId: targetId})
    const result=await saveFlowDesignInfo({
      runtime,
      flowModelId: targetId,
      assertCurrent: () => {
        props.assertOpen?.()
        if (own !== generation || flowModelId.value !== targetId || sparkConsume(PAGE_RUNTIME) !== runtime) throw Error('原流程设计保存已失效')
      },
    })
    if (own !== generation) return
    if(result.complete) {
      await refreshPrepared(true)
      if (changed && own === generation) await props.afterSave?.()
    }
    else error.value='原提交核验完成，仍有未保存修改，请再次明确保存'
  } catch (cause) {
    if (own === generation) error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    saving.value = false
  }
}

watch(flowModelId, () => { void load() }, {immediate: true})
onBeforeUnmount(() => { active = false; generation++;off?.() })
</script>
