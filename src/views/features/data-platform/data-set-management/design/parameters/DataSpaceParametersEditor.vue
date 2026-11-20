<template>
  <section class="data-space-parameters-editor" aria-label="输入参数编辑器">
    <RendererForm :data-view-key="dataViewKey" data-member="currentRow" :auto-columns="false" :show-data-view-meta="false" :grid-columns="1">
      <FieldJson :data-view-key="dataViewKey" data-member="currentRow" field="inputParams" label=""
        mode="rows" row-edit-mode="inline" :row-adapter="rowAdapter" :children="fields" :readonly="disabled" :max-height="460"
        :on-editing-change="value => onEditingChange?.(value)" />
    </RendererForm>
    <p v-if="!secureIdAvailable" role="alert">当前环境不能安全生成输入参数 ID，新增及无 ID 参数保持只读。</p>
  </section>
</template>
<script setup lang="ts">
import {FieldJson, RendererForm} from '@spark-appworks/spark-component'
import {DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import type {DataSpaceParametersEditorProps} from './DataSpaceParametersEditor.props'
defineProps<DataSpaceParametersEditorProps>()
const rowAdapter = DataSpaceDesignApi.inputParameterRowAdapter()
const secureIdAvailable = typeof globalThis.crypto?.getRandomValues === 'function'
const fields = [
  {type:'r-text',props:{field:'Name',label:'名称',maxlength:100,minWidth:220}},
  {type:'r-text',props:{field:'Description',label:'描述',maxlength:200,minWidth:260}},
  {type:'r-checkbox',props:{field:'IsBusParam',label:'主业务参数',width:120,valueAlign:'center'}},
]
</script>
<style scoped>
.data-space-parameters-editor {box-sizing:border-box;width:100%;min-width:0;}
</style>
