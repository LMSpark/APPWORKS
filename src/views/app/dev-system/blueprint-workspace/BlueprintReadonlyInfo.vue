<template>
  <section class="readonly-info" aria-live="polite">
    <DisplayAlert v-if="error" alert-type="error" :title="`只读查询失败：${error}`" />
    <DisplayAlert v-else-if="loading" title="正在加载只读数据…" alert-type="info" />
    <RendererTable v-else-if="loaded" :data-view-key="binding" :auto-columns="false" :show-data-view-meta="false" :show-aggregate-summary="false" :show-selection-summary="false" :show-pagination="true">
      <FieldText v-for="field in fields" :key="field" data-member="currentRow" :data-field="field" :label="field" readonly />
    </RendererTable>
  </section>
</template>

<script setup lang="ts">
import {onBeforeUnmount, ref, watch} from 'vue'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {DisplayAlert,FieldText, RendererTable} from '@spark-appworks/spark-component'
import {queryBlueprintReadonlyView} from './blueprint-readonly-info'

const props=defineProps<{runtime:PageRuntime;nodeId:string;binding:string;fields:readonly string[];assertCurrent:(nodeId:string,runtime:PageRuntime)=>void}>()
const loading=ref(false),loaded=ref(false),error=ref<string>()
let revision=0
watch(()=>[props.runtime.instanceId,props.nodeId,props.binding] as const,async([,nodeId,binding])=>{
  const current=++revision
  loaded.value=false;error.value=undefined
  if(!nodeId)return
  loading.value=true
  try{const runtime=props.runtime;await queryBlueprintReadonlyView({runtime,binding,nodeId,assertCurrent:()=>props.assertCurrent(nodeId,runtime)});if(current===revision)loaded.value=true}
  catch(failure){if(current===revision)error.value=failure instanceof Error?failure.message:String(failure)}
  finally{if(current===revision)loading.value=false}
},{immediate:true})
onBeforeUnmount(()=>{revision++})
</script>

<style scoped>
.readonly-info{padding:16px}
</style>
