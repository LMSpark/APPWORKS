<!--
@module app:views/app/dev-system/components/NodeStateConfig
职责：编辑正式导航发布、子项显示、分组和排序。
边界：状态字段直接绑定当前蓝图DataView；显示方式与对齐沿正式独立字典视图读取。
AI用途：调整节点导航展示并经原DataView显式保存。
-->
<template>
  <div v-if="state.blueprintDraft.navigation && blueprintBindingReady">
    <RendererDivider content-position="left" content="导航显示" />
    <DisplayAlert v-if="optionError" :description="`导航字典读取失败：${optionError}`" alert-type="error" />
    <RendererForm v-bind="blueprintContainerProps" :auto-columns="false" :show-data-view-meta="false" context-data-member="currentRow" label-width="120px">
      <FieldSwitch v-if="access('IsShowAtNav').read && isBooleanField('IsShowAtNav')" v-bind="blueprintFieldProps" data-member="currentRow" data-field="IsShowAtNav" label="发布到菜单" active-text="是" inactive-text="否" :readonly="!access('IsShowAtNav').write" @update:model-value="state.markBlueprintDirty" />
      <FieldRadio v-else-if="access('IsShowAtNav').read" v-bind="blueprintFieldProps" data-member="currentRow" data-field="IsShowAtNav" label="发布到菜单" :options="binaryOptions('IsShowAtNav')" :button-style="true" :readonly="!access('IsShowAtNav').write" @update:model-value="state.markBlueprintDirty" />
      <FieldSwitch v-if="access('IsShowChildItem').read && isBooleanField('IsShowChildItem')" v-bind="blueprintFieldProps" data-member="currentRow" data-field="IsShowChildItem" label="显示子项" active-text="是" inactive-text="否" :readonly="!access('IsShowChildItem').write" @update:model-value="state.markBlueprintDirty" />
      <FieldRadio v-else-if="access('IsShowChildItem').read" v-bind="blueprintFieldProps" data-member="currentRow" data-field="IsShowChildItem" label="显示子项" :options="binaryOptions('IsShowChildItem')" :button-style="true" :readonly="!access('IsShowChildItem').write" @update:model-value="state.markBlueprintDirty" />
      <FieldSelect v-if="access('NavigationShowType').read" v-bind="blueprintFieldProps" data-member="currentRow" data-field="NavigationShowType" label="显示方式" :option-data-view-key="showTypeOptionsKey" option-value-field="val" option-label-field="txt" :readonly="!optionsReady || !access('NavigationShowType').write" @update:model-value="state.notifyExternalDataViewChanged" />
      <FieldSelect v-if="access('HorizontalAlignment').read" v-bind="blueprintFieldProps" data-member="currentRow" data-field="HorizontalAlignment" label="水平对齐" :option-data-view-key="alignmentOptionsKey" option-value-field="val" option-label-field="txt" :readonly="!optionsReady || !access('HorizontalAlignment').write" @update:model-value="state.notifyExternalDataViewChanged" />
      <FieldSwitch v-if="access('BeginGroup').read && isBooleanField('BeginGroup')" v-bind="blueprintFieldProps" data-member="currentRow" data-field="BeginGroup" label="开始分组" active-text="是" inactive-text="否" :readonly="!access('BeginGroup').write" @update:model-value="state.markBlueprintDirty" />
      <FieldRadio v-else-if="access('BeginGroup').read" v-bind="blueprintFieldProps" data-member="currentRow" data-field="BeginGroup" label="开始分组" :options="binaryOptions('BeginGroup')" :button-style="true" :readonly="!access('BeginGroup').write" @update:model-value="state.markBlueprintDirty" />
      <FieldNumber v-if="access('FunOrderValue').read" v-bind="blueprintFieldProps" data-member="currentRow" data-field="FunOrderValue" label="排序" :readonly="!access('FunOrderValue').write" @update:model-value="state.markBlueprintDirty" />
    </RendererForm>
  </div>
</template>
<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {buildDataViewKey} from '@spark-appworks/spark-data'
import type {DevState} from '../useDevState'
import * as SparkComponent from '@spark-appworks/spark-component'
import {LowcodeDictionary} from '@/lowcode/resources/dictionary/lowcode-dictionary'

const {DisplayAlert,FieldNumber,FieldRadio,FieldSelect,FieldSwitch,RendererDivider,RendererForm}=SparkComponent
const props=defineProps<{state:DevState}>()
const state=props.state
const access=(field:string)=>state.blueprintNodeFieldAccess(field)
const blueprintComponentBinding=computed(()=>{
  const owner=state.blueprintWorkspaceDataView.value
  return owner?.projectId===state.projectId?owner.standardComponentBinding:undefined
})
const blueprintViewKey=computed(()=>blueprintComponentBinding.value?.dataViewKey??'')
const blueprintDirectSource=computed(()=>blueprintComponentBinding.value?.dataSource)
const blueprintContainerProps=computed(()=>blueprintViewKey.value?{dataViewKey:blueprintViewKey.value}
  :blueprintDirectSource.value?{dataSource:blueprintDirectSource.value}: {})
const blueprintFieldProps=computed(()=>blueprintViewKey.value?{dataViewKey:blueprintViewKey.value}: {})
const blueprintBindingReady=computed(()=>Boolean(blueprintViewKey.value||blueprintDirectSource.value))
const showTypeOptionsKey=buildDataViewKey('_Base_DictData','NavigationShowType_Content',LowcodeDictionary.editorScenarioId)
const alignmentOptionsKey=buildDataViewKey('_Base_DictData','Navigationposition',LowcodeDictionary.editorScenarioId)
const optionError=ref('')
const optionsReady=ref(false)
let generation=0
function binaryOptions(field:string):Array<{value:string|number;label:string}> {
  const column=state.blueprintWorkspaceDataView.value?.view?.columns.find(item=>item.name===field)
  const type=column?.type
  if(type!==undefined&&['number','int','integer','decimal','float','double'].includes(type))return [{label:'是',value:1},{label:'否',value:0}]
  return [{label:'是',value:'1'},{label:'否',value:'0'}]
}
function isBooleanField(field:string):boolean {
  const type=state.blueprintWorkspaceDataView.value?.view?.columns.find(item=>item.name===field)?.type
  return type==='boolean'||type==='bool'
}
watch(()=>blueprintComponentBinding.value,async(binding)=>{
  const current=++generation
  optionsReady.value=false
  optionError.value=''
  if(!binding)return
  try {
    await state.loadNavigationDictionaryOptions()
    if(generation===current)optionsReady.value=true
  } catch(error) {
    if(generation===current)optionError.value=error instanceof Error?error.message:String(error)
  }
},{immediate:true})
</script>
