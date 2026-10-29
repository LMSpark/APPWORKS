<!--
@module app:views/app/dev-system/components/NodeLayoutConfig
职责：通过标准字段组件编辑正式ChildItemLocation值。
边界：布局标签不改写wire值；字段权限和提交由当前蓝图DataView承接。
AI用途：仅在模块节点配置子项布局。
-->
<template>
  <div v-if="flags.isModule.value && state.blueprintDraft.navigation && blueprintViewKey">
    <RendererDivider content-position="left" content="布局配置" />
    <RendererForm :data-view-key="blueprintViewKey" :auto-columns="false" :show-data-view-meta="false" context-data-member="currentRow" label-width="120px">
      <FieldRadio v-if="access('ChildItemLocation').read" :data-view-key="blueprintViewKey" data-member="currentRow" data-field="ChildItemLocation" label="子项布局" :options="placementOptions" :button-style="true" :readonly="!access('ChildItemLocation').write" @update:model-value="state.markBlueprintDirty" />
    </RendererForm>
  </div>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {buildDataViewKey} from '@spark-appworks/spark-data'
import type {DevState} from '../useDevState'
import {useNodeKindFlags} from '../composables/useNodeKindFlags'
import * as SparkComponent from '@spark-appworks/spark-component'

const {FieldRadio, RendererForm, RendererDivider}=SparkComponent
const props=defineProps<{state:DevState}>()
const state=props.state
const flags=useNodeKindFlags(state)
const access=(field:string)=>state.blueprintNodeFieldAccess(field)
const blueprintViewKey=computed(()=>{
  const view=state.blueprintWorkspaceDataView.value?.view
  const scenarioId=view?.dataSet?.scenarioId
  const modelName=view?.dataTable?.modelBinding?.modelName
  return view&&scenarioId&&modelName?buildDataViewKey(modelName,view.viewId,scenarioId):''
})
const placementOptions=[
  {value:'Top',label:'顶部'},
  {value:'Left',label:'左侧'},
  {value:'Right',label:'右侧'},
  {value:'Parent',label:'继承父级'},
  {value:'Tabs',label:'页签'},
  {value:'Popup',label:'弹出窗口'},
]
</script>
