<template>
  <section class="readonly-info" aria-live="polite">
    <DisplayAlert v-if="bindingError" alert-type="error" :title="`只读查询失败：${bindingError}`" />
    <template v-if="bindingSession">
      <RendererButton :data-view-key="binding" label="重新加载" @click="reload" />
      <RendererTable :data-view-key="binding" :auto-columns="false" :show-data-view-meta="true" :show-aggregate-summary="false" :show-selection-summary="false" :show-pagination="true">
        <FieldText v-for="field in fields" :key="field" data-member="currentRow" :data-field="field" :label="field" readonly />
      </RendererTable>
    </template>
  </section>
</template>

<script setup lang="ts">
import {onBeforeUnmount, ref, shallowRef, watch} from 'vue'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {DisplayAlert, FieldText, RendererButton, RendererTable} from '@spark-appworks/spark-component'
import {bindBlueprintReadonlyView} from './blueprint-readonly-info'

type ReadonlyBinding = ReturnType<typeof bindBlueprintReadonlyView>

const props=defineProps<{runtime:PageRuntime;nodeId:string;binding:string;fields:readonly string[];assertCurrent:(nodeId:string,runtime:PageRuntime)=>void}>()
const bindingSession=shallowRef<ReadonlyBinding>()
const bindingError=ref('')
let revision=0

function reportLoadError(session:ReadonlyBinding, error:unknown):void {
  if(bindingSession.value!==session||session.view.loadingError) return
  bindingError.value=error instanceof Error?error.message:String(error)
}

function startLoad(session:ReadonlyBinding):void {
  void session.load().then(()=>{
    if(bindingSession.value===session)bindingError.value=''
  },error=>reportLoadError(session,error))
}

watch([()=>props.runtime,()=>props.nodeId,()=>props.binding],([runtime,nodeId,binding])=>{
  const current=++revision
  bindingSession.value?.release()
  bindingSession.value=undefined
  bindingError.value=''
  if(!nodeId)return
  try{
    const session=bindBlueprintReadonlyView({runtime,binding,nodeId,assertCurrent:()=>{
      if(current!==revision)throw new Error('只读信息查询目标已切换')
      props.assertCurrent(nodeId,runtime)
    }})
    if(current!==revision){session.release();return}
    bindingSession.value=session
    startLoad(session)
  }catch(error){
    if(current===revision)bindingError.value=error instanceof Error?error.message:String(error)
  }
},{immediate:true})

function reload():void {
  const session=bindingSession.value
  if(!session)return
  bindingError.value=''
  startLoad(session)
}

onBeforeUnmount(()=>{
  revision++
  bindingSession.value?.release()
  bindingSession.value=undefined
})
</script>

<style scoped>
.readonly-info{padding:16px}
</style>
