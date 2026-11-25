<!--
@module app:views/features/workflow/flow-model/design/ui/flow-design-page
职责：按目标模型 rowid 打开流程设计工作区，可拖拽布局的 RendererGraph + 节点/边列表。
边界：消费父 PAGE_RUNTIME；布局来自 DesignJson 投影与会话内覆盖；保存走 saveFlowDesignInfo。
-->
<template>
  <RendererSection title="流程设计" class="flow-design-page" :bordered="false" :grid-columns="1" :grid-gap="12"
    :status="loading ? '正在打开流程设计…' : ''" :error="error" :retryable="!loading && !ready" @retry="load">
    <template v-if="ready && prepared" #header-actions>
      <RendererButton label="新增节点" :disabled="saving || acting || unconfirmed || loadedTarget !== flowModelId" @click="addNode" />
      <RendererButton label="删除选中" :disabled="saving || acting || unconfirmed || loadedTarget !== flowModelId || !graphSelection" @click="removeSelection" />
      <RendererButton label="取消修改" :disabled="saving || acting || unconfirmed" @click="cancelChanges" />
      <RendererButton :label="unconfirmed ? '核验原提交' : '保存设计'" button-type="primary" :disabled="saving || acting || loadedTarget !== flowModelId" @click="saveDesign" />
    </template>
    <template v-if="ready && prepared">
      <DisplayAlert alert-type="info" :closable="false" :show-icon="true" :title="`设计目标：${prepared.modelTitle}`" />
      <DisplayAlert alert-type="info" :closable="false" :show-icon="true"
        title="可拖动节点调整布局，保存后生效。" />
      <RendererGraph class="flow-design-page__graph" :data-view-key="prepared.nodeViewKey"
        :edge-data-view-key="prepared.edgeViewKey" label-field="TITLE" description-field="MEMO"
        node-caption-field="TYPEID" edge-source-field="UpNodeID" edge-target-field="NextNodeID"
        :node-positions="graphLayout.nodePositions" :edge-paths="graphLayout.edgePaths"
        :draggable-keys="draggableNodeKeys" :connectable-keys="draggableNodeKeys" :current="graphSelection"
        background-pattern="dots" node-appearance="card" :viewport-controls="true" :disabled="saving || loading || acting || unconfirmed || loadedTarget !== flowModelId"
        :on-node-move="onNodeMove" :on-connect="onGraphConnect" @select="onGraphSelect" />
      <div class="flow-design-page__tables">
        <FlowDesignNodePanel :view-key="prepared.nodeViewKey" :highlight-id="nodeHighlightId" @select-graph-id="selectNodeFromTable" />
        <FlowDesignEdgePanel :view-key="prepared.edgeViewKey" :highlight-id="edgeHighlightId" @select-graph-id="selectEdgeFromTable" />
        <FlowDesignFormPanel v-if="prepared.workFormViewKey" :view-key="prepared.workFormViewKey" class="flow-design-page__form" />
        <FlowDesignNodeAuthPanel :view-key="nodeAuthViewKey" :selected-node-id="selectedNodeId"
          :flow-model-id="loadedTarget" class="flow-design-page__auth" />
      </div>
    </template>
  </RendererSection>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref, shallowRef, watch} from 'vue'
import type {GraphSelection} from '@spark-appworks/spark-component'
import * as SparkComponent from '@spark-appworks/spark-component'
import {
  FLOW_DESIGN_SCENARIO_ID,addFlowDesignEdge,
  addFlowDesignNode,
  prepareFlowDesignViews,
  removeFlowDesignGraphSelection,
  saveFlowDesignInfo,flowDesignWorkspaceViews,flowDesignGraphLayout,stageFlowDesignGraph,cancelFlowDesignChanges,hasFlowDesignChanges,
  syncFlowDesignNodeAuthView,
  type FlowDesignPreparedViews,
} from '@/platform-adapters/resources/system/workflow/manage'
import {useSystemPageDirtySource} from '@spark-appworks/spark-app'

const {DisplayAlert, PAGE_RUNTIME, RendererButton, RendererGraph, RendererSection, useSparkComponent} = SparkComponent
import FlowDesignNodePanel from './node-panel/flow-design-node-panel.vue'
import FlowDesignEdgePanel from './edge-panel/flow-design-edge-panel.vue'
import FlowDesignFormPanel from './form-panel/flow-design-form-panel.vue'
import FlowDesignNodeAuthPanel from './node-panel/flow-design-node-auth-panel.vue'

const props = defineProps<{flowModelId: string}>()
const emit=defineEmits<{closeBlocked:[value:boolean]}>()
const flowModelId = computed(() => String(props.flowModelId ?? '').trim())
const {sparkConsume} = useSparkComponent({type: 'flow-design-page'})
const ready = ref(false), loading = ref(false), saving = ref(false), acting=ref(false),error = ref(''),revision=ref(0)
let off:(()=>void)|undefined
const prepared = shallowRef<FlowDesignPreparedViews>(),loadedTarget=ref('')
const nodeAuthViewKey = ref('')
const graphSelection = ref<Readonly<{kind: 'node' | 'edge'; id: string | number}> | null>(null)
const selectedNodeId = computed(() => {
  const sel = graphSelection.value
  if (!sel || sel.kind !== 'node') return ''
  return String(sel.id).trim()
})
const currentCommand=()=>{const runtime=sparkConsume(PAGE_RUNTIME),own=generation,targetId=flowModelId.value
 if(!runtime)throw Error('流程设计缺少父页运行实例')
 if(loadedTarget.value&&loadedTarget.value!==targetId)throw Error('原流程仍有修改，不能操作新目标')
 return {runtime,flowModelId:targetId,assertCurrent:()=>{if(own!==generation||flowModelId.value!==targetId||sparkConsume(PAGE_RUNTIME)!==runtime)throw Error('原流程设计目标已变化')}}}
const graphLayout=computed(()=>{revision.value;if(!ready.value||loadedTarget.value!==flowModelId.value)return {nodePositions:{},edgePaths:{}};return flowDesignGraphLayout(currentCommand())})
const unconfirmed=computed(()=>{revision.value;if(!ready.value)return false;try{const runtime=sparkConsume(PAGE_RUNTIME);return !!runtime&&flowDesignWorkspaceViews({runtime,flowModelId:loadedTarget.value}).some(view=>view.hasUnconfirmedSave)}catch{return true}})
const closeBlocked=computed(()=>{revision.value;if(saving.value||acting.value)return true;if(!ready.value)return false;try{const runtime=sparkConsume(PAGE_RUNTIME);return !!runtime&&hasFlowDesignChanges({runtime,flowModelId:loadedTarget.value})}catch{return true}})
watch(closeBlocked,value=>emit('closeBlocked',value),{immediate:true})
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

function onGraphSelect(event: GraphSelection): void {
  graphSelection.value = {kind: event.kind, id: event.id}
  if (event.kind === 'node') void refreshNodeAuth(String(event.id))
}

function selectNodeFromTable(id: string | number): void {
  graphSelection.value = {kind: 'node', id}
  void refreshNodeAuth(String(id))
}

function selectEdgeFromTable(id: string | number): void {
  graphSelection.value = {kind: 'edge', id}
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
 try{const command=currentCommand(),result=await addFlowDesignEdge({...command,parentId:String(event.source),childId:String(event.target),layoutOverride:{}})
  command.assertCurrent();await stageFlowDesignGraph(command);graphSelection.value={kind:'edge',id:result.edgeId}}
 catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}finally{acting.value=false}
}
async function addNode():Promise<void>{
 if(saving.value||acting.value||unconfirmed.value)return
 acting.value=true
 try{const command=currentCommand(),result=await addFlowDesignNode({...command,layoutOverride:{}})
  command.assertCurrent();await stageFlowDesignGraph({...command,layoutOverride:result.layoutOverride});graphSelection.value={kind:'node',id:result.nodeId}}
 catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}finally{acting.value=false}
}
async function removeSelection():Promise<void>{
 const selection=graphSelection.value
 if(!selection||saving.value||acting.value||unconfirmed.value)return
 acting.value=true
 try{const command=currentCommand();await removeFlowDesignGraphSelection({...command,selection:{kind:selection.kind,id:String(selection.id)},layoutOverride:{}})
  command.assertCurrent();await stageFlowDesignGraph(command);graphSelection.value=null}
 catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}finally{acting.value=false}
}
function cancelChanges():void{
 try{const runtime=sparkConsume(PAGE_RUNTIME);if(!runtime)throw Error('缺少原实例');cancelFlowDesignChanges({runtime,flowModelId:loadedTarget.value});graphSelection.value=null;error.value='';if(loadedTarget.value!==flowModelId.value)void load()}catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}
}

async function refreshNodeAuth(nodeId: string): Promise<void> {
  if(loadedTarget.value!==flowModelId.value)return
  const own = generation, targetId = flowModelId.value
  const runtime = sparkConsume(PAGE_RUNTIME)
  if (!runtime || !nodeId.trim()) {
    nodeAuthViewKey.value = ''
    return
  }
  try {
    const next = await syncFlowDesignNodeAuthView({
      runtime,
      flowModelId: targetId,
      selectedNodeId: nodeId,
      assertCurrent: () => {if (own !== generation || flowModelId.value !== targetId || selectedNodeId.value !== nodeId || sparkConsume(PAGE_RUNTIME) !== runtime) throw Error('原节点配置目标已变化')},
    })
    if (own === generation && selectedNodeId.value === nodeId) nodeAuthViewKey.value = next
  } catch (cause) {
    if (own === generation && flowModelId.value === targetId && selectedNodeId.value === nodeId) error.value = cause instanceof Error ? cause.message : String(cause)
  }
}

async function refreshPrepared(clearSelection = false): Promise<void> {
  const own = generation, targetId = flowModelId.value
  try {
    const runtime = sparkConsume(PAGE_RUNTIME)
    if (!runtime) throw new Error('流程设计缺少父页运行实例')
    const next = await prepareFlowDesignViews(runtime, targetId, {assertCurrent: () => {if (own !== generation || flowModelId.value !== targetId || sparkConsume(PAGE_RUNTIME) !== runtime) throw Error('原流程设计读取已失效')}})
    if (own !== generation) return
    loadedTarget.value=targetId
    prepared.value = next
    off?.();const dataSet=runtime.getDataSet(FLOW_DESIGN_SCENARIO_ID)
    const changed=()=>{revision.value++}
    off=dataSet?.onAnyViewChange({rowsChanged:changed,editingChanged:changed,requestStateChanged:changed,mutatingChanged:changed})
    ready.value = true
    if (clearSelection) {
      graphSelection.value = null
      nodeAuthViewKey.value = ''
    }
  } catch (cause) {
    if (own === generation) error.value = cause instanceof Error ? cause.message : String(cause)
  }
}

async function load(): Promise<void> {
  const own = ++generation
  if(ready.value&&loadedTarget.value){try{const runtime=sparkConsume(PAGE_RUNTIME)
    if(runtime&&hasFlowDesignChanges({runtime,flowModelId:loadedTarget.value})){error.value=`流程${loadedTarget.value}仍有未保存修改，请先处理原工作区`;return}}
    catch(cause){error.value=cause instanceof Error?cause.message:String(cause);return}}

  ready.value = false
  loading.value = true
  error.value = ''
  prepared.value = undefined
  graphSelection.value = null
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
    const result=await saveFlowDesignInfo({
      runtime,
      flowModelId: targetId,
      assertCurrent: () => {if (own !== generation || flowModelId.value !== targetId || sparkConsume(PAGE_RUNTIME) !== runtime) throw Error('原流程设计保存已失效')},
    })
    if (own !== generation) return
    if(result.complete)await load()
    else error.value='原提交核验完成，仍有未保存修改，请再次明确保存'
  } catch (cause) {
    if (own === generation) error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    saving.value = false
  }
}

watch(flowModelId, () => { void load() }, {immediate: true})
onBeforeUnmount(() => { generation++;off?.() })
</script>

<style scoped>
.flow-design-page {min-height: 420px; padding: 8px}
.flow-design-page__graph {min-height: 360px; height: 42vh}
.flow-design-page__tables {display: grid; grid-template-columns: 1fr 1fr; gap: 12px}
.flow-design-page__form,
.flow-design-page__auth {grid-column: 1 / -1}
@media (max-width: 960px) {
  .flow-design-page__tables {grid-template-columns: 1fr}
  .flow-design-page__form {grid-column: auto}
}
</style>
