<!--
@module @spark-appworks/spark-component:components/fields/data-components/text/FieldJson/FieldJson
职责：将本仓JSON编辑器接入标准字段上下文、权限与写回链。
边界：绑定切换和失权后旧事件不得写回，不执行规则或发保存请求。
AI用途：通过r-json维护JSON配置字段，不在业务页面手传值或另建草稿。
-->
<template>
  <JsonViewRows v-if="props.dataMember === 'rows'" v-bind="props.dataViewKey === undefined ? {} : {dataViewKey: props.dataViewKey}" data-member="rows"
    :include-query-info="props.includeQueryInfo" :mode="mode === 'rows' || mode === 'properties' || mode === 'form' || mode === 'outline' ? 'table' : mode" :height="height" />
  <FieldContextRenderer v-else v-bind="fieldCtx">
    <template #form>
      <p v-if="error" role="alert">{{ error }}</p>
      <el-button v-if="completeMode && (completeInput || writing || rejectedInput)" link size="small" data-json-cancel-editor-input
        :disabled="writing || !permission.isCurrentFieldEditable.value" @mousedown.prevent @click="resetEditor">取消输入</el-button>
      <JsonArrayOutline v-if="mode === 'outline'" :key="revision" :model-value="editorText" :children="props.children"
        :children-field="props.outlineChildrenField" :id-field="props.outlineIdField" :parent-field="props.outlineParentField"
        :selected-path="props.selectedPath" :height="height" @select-path="props.onSelectedPathChange?.($event)" />
      <JsonObjectForm v-else-if="mode === 'form'" :key="revision" :model-value="editorText" :read-only="!permission.isCurrentFieldEditable.value"
        :schema="props.schema" :commit="writeForRevision" @editing-change="props.onEditingChange?.($event)" />
      <JsonObjectProperties v-else-if="mode === 'properties'" :key="revision" :model-value="editorText" :read-only="!permission.isCurrentFieldEditable.value"
        :schema="props.schema" :value-label="props.valueLabel" :height="height" :commit="writeForRevision" @editing-change="props.onEditingChange?.($event)" />
      <JsonArrayRows v-else-if="mode === 'rows'" :key="revision" :model-value="editorText" :read-only="!permission.isCurrentFieldEditable.value"
        :children="props.children" :height="height" :max-height="props.maxHeight" :row-edit-mode="props.rowEditMode"
        :toolbar="props.toolbar" :reorderable="props.reorderable" :row-adapter="props.rowAdapter" :row-operations="props.rowOperations" :commit="writeForRevision" @editing-change="props.onEditingChange?.($event)" />
      <JsonTreeEditor v-else-if="mode === 'tree'" :key="revision" :model-value="editorText" :read-only="writing || !permission.isCurrentFieldEditable.value"
        :height="height" v-bind="treePolicy ? {policy:treePolicy} : {}" @update:model-value="writeForRevision" @editing-change="completeInput = $event" />
      <SparkJsonEditor v-else :key="revision" :model-value="editorText" :read-only="writing || !permission.isCurrentFieldEditable.value"
        :mode="mode" :height="height" @update:model-value="writeForRevision" @editing-change="completeInput = $event" />
    </template>
  </FieldContextRenderer>
</template>
<script setup lang="ts">
import {computed, onBeforeUnmount, ref, watch} from 'vue'
import {asJsonValue, parseJsonDocument, serializeJsonDocument, type JsonPath} from '@spark-appworks/spark-json-document'
import {useBasicFieldState} from '../../composables/state/useBasicFieldState'
import FieldContextRenderer from '../../../non-data-components/FieldContextRenderer.vue'
import SparkJsonEditor from '../../../../editors/SparkJsonEditor.vue'
import JsonTreeEditor from '../../../../editors/JsonTreeEditor.vue'
import JsonArrayRows from './JsonArrayRows.vue'
import JsonArrayOutline from './JsonArrayOutline.vue'
import JsonViewRows from './JsonViewRows.vue'
import JsonObjectProperties from './JsonObjectProperties.vue'
import JsonObjectForm from './JsonObjectForm.vue'
import type {RJsonProps} from './FieldJson.props'
import {JsonFieldPath} from '../../../context/json/json-field-path'
const props=withDefaults(defineProps<RJsonProps>(),{type:'r-json',mode:'tree',height:320})
const emit=defineEmits<{'update:modelValue':[value:string]}>()
const nativeTreePolicy={
  canEditKey:(path:JsonPath)=>path.length>1 && typeof path.at(-1)==='string',
  isProtected:(path:JsonPath)=>path.length===1,
  canAddChild:(path:JsonPath)=>path.length>0,
}
const treePolicy=computed(()=>props.treePolicy??(props.valueFormat === 'native'?nativeTreePolicy:undefined))
function pathRoot(raw: unknown) {return JsonFieldPath.root(raw, props.valueFormat === 'native')}
function toText(raw: unknown): string {
  if (props.valuePath?.length) {
    try {
      const path = props.valuePath, parent = JsonFieldPath.parent(pathRoot(raw), path)
      const value = Array.isArray(parent) ? parent[Number(path.at(-1))]! : parent[String(path.at(-1))]!
      return props.valueFormat === 'native' && props.mode === 'tree' ? serializeJsonDocument({value}) : JSON.stringify(value)
    } catch (cause) {return cause instanceof Error ? cause.message : String(cause)}
  }
  if(props.valueFormat !== 'native') return typeof raw === 'string' ? raw : ''
  const input=raw === undefined ? props.emptyValue ?? null : raw
  const value=asJsonValue(input)
  if(value === null && input !== null) return '无效的原生JSON值'
  return props.mode === 'tree' ? serializeJsonDocument({value}) : JSON.stringify(value)
}
function editorValue(text: string): unknown {
  if(props.valueFormat !== 'native') return text
  if(props.mode === 'tree') {
    const document=parseJsonDocument(text)
    if(Array.isArray(document) || !Object.hasOwn(document,'value') || Object.keys(document).length !== 1) throw new Error('请在value节点中编辑此项配置')
    return document['value']
  }
  const parsed: unknown=JSON.parse(text), value=asJsonValue(parsed)
  if(value === null && parsed !== null) throw new Error('输入超出有效JSON值范围')
  return value
}
function toSource(text: string): unknown {
  const value = editorValue(text), path = props.valuePath
  if (activeWrite && activeWrite.revision !== revision.value) throw new Error('JSON编辑上下文已变化')
  if (activeWrite && editorText.value !== activeWrite.previous) throw new Error('JSON编辑值已变化，请重新编辑')
  if (!path?.length) return value
  const raw = props.modelValue ?? props.value ?? permission.currentRow.value?.[permission.fieldName.value]
  // 合并最新原字段，保留未由当前子路径编辑的成员。
  const next: unknown = props.valueFormat === 'native' ? value : JSON.parse(text)
  const root = JsonFieldPath.replace(pathRoot(raw), path, next)
  return props.valueFormat === 'native' ? root : serializeJsonDocument(root)
}
const {permission,fieldCtx,handleControlledChange}=useBasicFieldState<string>({props,fieldType:'r-json',fallbackValue:'',coerce:toText,toSourceValue:toSource,emitUpdate:value=>emit('update:modelValue',value)})
// 原行完全缺少字段时，公共字段链返回空文本；仅显示初始结构，不制造编辑覆盖。
const editorText=computed(()=>props.valueFormat==='native' && permission.fieldValue.value==='' ? toText(undefined) : permission.fieldValue.value)
const revision=ref(0), error=ref('')
const completeInput=ref(false), writing=ref(false), rejectedInput=ref(false)
const completeMode=computed(()=>props.mode === 'tree' || props.mode === 'text' || props.mode === 'table')
watch(()=>[completeMode.value, completeInput.value || writing.value || rejectedInput.value] as const,
  ([complete,pending],previous)=>{if(complete || previous?.[0])props.onEditingChange?.(complete && pending)}, {immediate:true,flush:'sync'})
let activeWrite: {revision: number; previous: string} | undefined
const resetEditor=()=>{revision.value++;error.value='';completeInput.value=false;writing.value=false;rejectedInput.value=false}
// 同主键的数据重新装载也会更换写入上下文，旧编辑器必须释放，新的交互重新捕获守卫。
watch(permission.dataSource,(view,_,cleanup)=>{
  if(!view)return
  const discarded = (ids: ReadonlyArray<string | number> | undefined) => {
    const row = permission.currentRow.value
    const key = row ? view.getPkKey(row) : undefined
    if (ids === undefined || key !== undefined && ids.includes(key)) resetEditor()
  }
  view.events.on('rowsChanged',resetEditor)
  view.events.on('editingDiscarded',discarded)
  cleanup(()=>{view.events.off('rowsChanged',resetEditor);view.events.off('editingDiscarded',discarded)})
},{immediate:true,flush:'sync'})
// 标准容器原地更新行镜像；按主键识别换行，不能仅观察对象引用。
watch([permission.dataSource,()=>{const row=permission.currentRow.value;return row?permission.dataSource.value?.getPkKey(row):undefined},permission.fieldName,permission.isCurrentFieldEditable,()=>props.mode,()=>props.valueFormat,()=>props.dataViewKey,()=>props.dataMember],resetEditor,{flush:'sync'})
watch(() => JSON.stringify(props.valuePath ?? []), resetEditor, {flush:'sync'})
watch(() => props.rowAdapter, resetEditor, {flush:'sync'})
watch(() => props.rowEditMode, resetEditor, {flush:'sync'})
watch(() => JSON.stringify(props.rowOperations), resetEditor, {flush:'sync'})
onBeforeUnmount(()=>{revision.value++;if(completeMode.value)props.onEditingChange?.(false)})
const writeForRevision=computed(()=>{
  const own=revision.value, valid=permission.captureWriteGuard()
  return async(value:string):Promise<boolean>=>{
    if(own!==revision.value || !valid() || activeWrite) return false
    activeWrite = {revision: own, previous: editorText.value}
    writing.value=true
    try {
      toSource(value);error.value=''
      const accepted=await handleControlledChange(value)
      if(own===revision.value && completeMode.value) {
        rejectedInput.value=!accepted
        if(!accepted)error.value='原字段未接受修改；请检查数据权限和绑定。'
      }
      return accepted
    } catch(cause) {
      if(own===revision.value) {error.value=cause instanceof Error ? cause.message : String(cause);rejectedInput.value=completeMode.value}
      return false
    } finally {activeWrite = undefined;if(own===revision.value)writing.value=false}
  }
})
</script>
