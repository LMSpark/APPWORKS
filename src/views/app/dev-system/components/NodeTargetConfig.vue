<!--
@module app:views/app/dev-system/components/NodeTargetConfig
职责：编辑导航目标和打开方式，按明确cfg目标创建工具。
边界：正式kind与交付表面分离；工具创建走Workspace真实三文件能力。
AI用途：选择原生页面、配置工具或外部链接并检查嵌入能力。
-->
<template>
  <div v-if="state.blueprintDraft.navigation">
    <RendererDivider content-position="left" content="导航目标" />
    <RendererForm v-if="blueprintViewKey" :data-view-key="blueprintViewKey" :auto-columns="false" :show-data-view-meta="false" context-data-member="currentRow" label-width="120px">
      <FieldSelect v-if="access('NavigationUrl').read && !customTargetEditing" :data-view-key="blueprintViewKey" data-member="currentRow" data-field="NavigationUrl" label="页面或工具" placeholder="搜索已登记页面或工具" :options="targetOptions" :filterable="true" :clearable="true" :readonly="!access('NavigationUrl').write" @update:model-value="state.handlePathChange(String($event))" />
      <FieldText v-else-if="access('NavigationUrl').read" :data-view-key="blueprintViewKey" data-member="currentRow" data-field="NavigationUrl" label="自定义目标 URL" placeholder="vue:页面路径或外部地址" :readonly="!access('NavigationUrl').write" @update:model-value="state.markBlueprintDirty" />
      <FieldText v-if="access('MobileUrl').read" :data-view-key="blueprintViewKey" data-member="currentRow" data-field="MobileUrl" label="移动端目标" :readonly="!access('MobileUrl').write" @update:model-value="state.markBlueprintDirty" />
      <FieldSelect v-if="access('NavigationType').read" :data-view-key="blueprintViewKey" data-member="currentRow" data-field="NavigationType" label="打开方式" :options="openModeOptions" :readonly="!access('NavigationType').write" :clearable="false" @update:model-value="state.markBlueprintDirty" />
    </RendererForm>
    <RendererButton v-if="access('NavigationUrl').read" :label="customTargetEditing ? '同步当前工具目标' : '输入自定义目标'" :disabled="!access('NavigationUrl').write" @click="customTargetEditing ? applyCustomTarget() : customTargetEditing = true" />
    <RendererButton v-if="flags.isPage.value || flags.isContent.value" label="创建并绑定当前工具" :disabled="!toolId || !access('NavigationUrl').write || creating" :loading="creating" @click="createTool" />
    <DisplayAlert v-if="flags.isEmbedded.value" :description="`嵌入检测：${state.linkProbeInfo.value?.reason ?? '尚未检测'}`" alert-type="info" />
    <RendererButton v-if="flags.isEmbedded.value" label="检测嵌入" :disabled="state.linkProbeLoading.value" :loading="state.linkProbeLoading.value" @click="state.probeLinkTarget" />
  </div>
</template>
<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {buildDataViewKey} from '@spark-appworks/spark-data'
import type {DevState} from '../useDevState'
import {useNodeKindFlags} from '../composables/useNodeKindFlags'
import {getVuePageOptions} from '@/registries/vue-page-registry'
import * as SparkComponent from '@spark-appworks/spark-component'

const {DisplayAlert, FieldText, FieldSelect, RendererForm, RendererDivider, RendererButton} = SparkComponent
const props=defineProps<{state:DevState}>()
const flags=useNodeKindFlags(props.state)
const creating=ref(false)
const customTargetEditing=ref(false)
const access=(field:string)=>props.state.blueprintNodeFieldAccess(field)
const blueprintViewKey=computed(()=>{
  const view=props.state.blueprintWorkspaceDataView.value?.view
  const scenarioId=view?.dataSet?.scenarioId
  const modelName=view?.dataTable?.modelBinding?.modelName
  return view&&scenarioId&&modelName?buildDataViewKey(modelName,view.viewId,scenarioId):''
})
const toolId=computed(()=>{
  const target=props.state.blueprintDraft.navigation?.target ?? ''
  return target.startsWith('cfg:')?target.slice(4).trim():''
})
const targetOptions=computed(()=>[
  ...getVuePageOptions().map(page=>({value:page.path,label:`页面 · ${page.title}`})),
  ...props.state.pageList.value.filter(page=>page.designSurface==='config-files').map(page=>({value:`cfg:${page.pageId}`,label:`工具 · ${page.title}`})),
])
const openModeOptions=computed(()=>{
  const view=props.state.blueprintWorkspaceDataView.value?.view
  const type=view?.columns.find(column=>column.name==='NavigationType')?.type
  const numeric=type!==undefined&&['number','int','integer','decimal','float','double'].includes(type)
  const values=numeric?[4,3,2,1,0]:['4','3','2','1','0']
  return values.map((value,index)=>({value,label:['子系统','当前窗口','新窗口','对话框','嵌入'][index]}))
})
watch(()=>[blueprintViewKey.value,props.state.projectId,props.state.selectedNode.value?.nodeId] as const,()=>{customTargetEditing.value=false})
function applyCustomTarget():void {
  const target=props.state.blueprintWorkspaceDataView.value?.value('NavigationUrl')
  if(typeof target!=='string')return
  props.state.handlePathChange(target)
  customTargetEditing.value=false
}
async function createTool():Promise<void> {
  const pageId=toolId.value
  if(!pageId)return
  creating.value=true
  try {
    await props.state.createPageForSelectedNode({pageId,title:props.state.blueprintDraft.navigation?.title??props.state.blueprintDraft.capability.name??'',icon:props.state.blueprintDraft.navigation?.icon??'Document'})
  } catch(error) {
    props.state.addStatus(`工具创建失败: ${String(error)}`,'error')
  } finally {
    creating.value=false
  }
}
</script>
