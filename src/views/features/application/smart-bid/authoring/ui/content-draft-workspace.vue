<!--
@module app:views/features/application/smart-bid/authoring/ui/content-draft-workspace
职责：在宿主本次运行实例内呈现个人内容草稿与正文，并取消指定草稿的本地编辑。
边界：宿主提供当前会话作者及有效性核验；不加载空间、不复制草稿、不执行通用远端保存或正式采用。
AI用途：业务宿主已加载正式空间时，绑定本次个人草稿并消费pending事件保护离页及目标切换。
-->
<template>
  <RendererSection title="正文编制" v-bind="state.view ? {dataViewKey} : {}" :grid-columns="1" :error="state.error || presentation.error || actionError"
    status="远端保存待建；当前编辑保留在本页，尚未形成正式修订。">
    <template v-if="state.view" #header-actions>
      <RendererButton :data-view-key="dataViewKey" label="取消本次草稿编辑" data-action="cancel-content-draft"
        :disabled="!state.view.hasEditingChanges(draftId)" @click="cancel" />
    </template>
    <RendererForm v-if="presentation.layout" :key="formGeneration" v-bind="presentation.layout" />
  </RendererSection>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref, shallowRef, toRaw, watch} from 'vue'
import {parseDataViewKey, type DataTable, type DataView} from '@spark-appworks/spark-data'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import type {JsonPath} from '@spark-appworks/spark-json-document'
import {PAGE_RUNTIME, RendererButton, RendererForm, RendererSection, useSparkComponent} from '@spark-appworks/spark-component'
import {contentTreeEditorLayout} from '@/services/smart-bid/content-tree-editor-layout'
import {contentDraftSaveRule} from '@/services/smart-bid/content-draft-save-rule'

const props = defineProps<{
  runtime: PageRuntime
  dataViewKey: string
  projectId: string
  draftId: string | number
  /** 宿主从当前认证会话读取，不接受业务路由或AI参数指定作者。 */
  actorUserId: string
  /** 每次呈现及取消均核验当前应用、会话和本次运行实例。 */
  assertCurrent: () => void
}>()
const {sparkProvide, sparkRemove} = useSparkComponent({type:'content-draft-workspace'})
/** 宿主据此阻止带未保存输入的离页/目标切换；失效时仍报告原视图的未保存编辑。 */
const emit = defineEmits<{pending: [value: boolean]}>()
const revision = ref(0), selectedPath = ref<JsonPath | null>(null), editing = ref(false), actionError = ref('')
const formGeneration = ref(0)
const editorBinding = shallowRef<{view: DataView; id: string | number}>()
let unsubscribe: (() => void) | undefined
const guardedTables = new WeakSet<DataTable>()
watch(() => {
  revision.value
  return editing.value || editorBinding.value?.view.hasEditingChanges(editorBinding.value.id) === true
}, value => emit('pending',value), {immediate:true})
const state = computed<{view?: DataView; error: string}>(() => {
  revision.value
  try {
    props.assertCurrent()
    const binding = parseDataViewKey(props.dataViewKey)
    if (!binding?.scope || binding.tableName !== 'WorkingDraft') throw Error('正文编制必须绑定完整WorkingDraft视图')
    const view = toRaw(props.runtime).resolveView(props.dataViewKey), row = view?.getEditingRow(props.draftId)
    if (!props.actorUserId.trim() || !view || view.dataTable?.modelBinding?.modelName !== 'WorkingDraft'
      || !row || row['projectId'] !== props.projectId || row['userId'] !== props.actorUserId
      || view.fieldAccess(row,'userId').read !== 'visible') throw Error('当前作者的项目草稿不可读取')
    return {view,error:''}
  } catch (cause) {return {error:cause instanceof Error ? cause.message : String(cause)}}
})
const presentation = computed(() => {
  const view = state.value.view
  if (!view) return {error:''}
  try {
    const original={runtime:toRaw(props.runtime),key:props.dataViewKey,projectId:props.projectId,draftId:props.draftId,
      actorUserId:props.actorUserId,assertCurrent:props.assertCurrent}
    const beforeWrite=()=>{
      try {
        original.assertCurrent()
        if(toRaw(props.runtime)!==original.runtime||props.dataViewKey!==original.key||props.projectId!==original.projectId
          ||props.draftId!==original.draftId||props.actorUserId!==original.actorUserId||state.value.view!==view)throw Error('当前编制目标已变化')
      } catch(cause){revision.value++;throw cause}
    }
    const layout=contentTreeEditorLayout({view,dataViewKey:props.dataViewKey,projectId:props.projectId,draftId:props.draftId,
      selectedPath:selectedPath.value,onSelectedPathChange:path=>{if(!editing.value)selectedPath.value=path},
      onEditingChange:value=>{editing.value=value}})
    // 标准JSON字段的change先于默认写回；这里只核宿主证明，实际值仍由原字段绑定提交。
    return {error:'',layout:{...layout,...(layout.children ? {children:layout.children.map(node=>typeof node==='object'
      ? {...node,props:{...node.props,onChange:beforeWrite}} : node)} : {})}}
  } catch (cause) {return {error:cause instanceof Error ? cause.message : String(cause)}}
})
watch(() => [props.runtime,props.dataViewKey,props.projectId,props.draftId,props.actorUserId] as const, () => {
  unsubscribe?.();unsubscribe=undefined;selectedPath.value=null;editing.value=false;actionError.value=''
  formGeneration.value++
  sparkRemove(PAGE_RUNTIME)
  // Subscribe to the original model even before its first row/query proof arrives.
  // Availability controls rendering and editing, not the lifecycle subscription.
  try {
    const binding=parseDataViewKey(props.dataViewKey)
    if(!binding?.scope || binding.tableName!=='WorkingDraft')return
    const runtime=toRaw(props.runtime), view=runtime.resolveView(props.dataViewKey), ds=view?.dataSet
    if(!ds)return
    const changed=()=>{revision.value++}
    unsubscribe=ds.onAnyViewChange({rowsChanged:changed,editingChanged:changed,requestStateChanged:changed,configChanged:changed,mutatingChanged:changed})
    sparkProvide(PAGE_RUNTIME,runtime)
  } catch(cause){actionError.value=cause instanceof Error?cause.message:String(cause)}
},{immediate:true})
watch(() => [state.value.view,props.draftId] as const, ([view,draftId]) => {
  const table=view?.dataTable, ds=view?.dataSet
  if(!view || !table || !ds)return
  editorBinding.value={view,id:draftId}
  // Until an authoritative command is bound, even a generic parent save cannot silently persist this editor's draft.
  if (!guardedTables.has(table)) {
    const rule=contentDraftSaveRule(props.projectId)
    table.setQuerySaveRule({groups:[...(table.querySaveRule?.groups ?? []),...rule.groups,
      {fields:['draft'],validate:()=>{throw Error('CONTENT_DRAFT_REMOTE_SAVE_UNAVAILABLE')}}]})
    guardedTables.add(table)
  }
},{immediate:true})
function cancel(): void {
  actionError.value=''
  try {
    props.assertCurrent()
    const view=state.value.view
    if(!view)throw Error(state.value.error)
    view.discardEditingRows([props.draftId]);selectedPath.value=null;editing.value=false
  } catch(cause){actionError.value=cause instanceof Error?cause.message:String(cause)}
}
onBeforeUnmount(()=>{unsubscribe?.();sparkRemove(PAGE_RUNTIME)})
</script>
