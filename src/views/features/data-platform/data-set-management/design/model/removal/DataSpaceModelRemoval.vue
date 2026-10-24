<!--
@module app:views/features/data-platform/data-set-management/design/model/removal/DataSpaceModelRemoval
职责：展示精确删除清单、显式确认和未决结果。
边界：复用原DataView权限及会话操作，不直接请求或在挂载时查询。
AI用途：行已消失时仍保留核验入口，不把取消当作撤销已派发删除。
-->
<template>
  <section aria-label="正式模型删除">
    <h3>删除模型</h3>
    <p v-if="error" role="alert">{{ error }}</p>
    <p>仅删除此模型、所属字段和直接模型关系。物理资源、资源功能策略、其他 CRUD 模型保留。</p>
    <p>请先解除并保存本空间视图绑定，并核查其他页面、脚本的引用；这些外部引用不在本次自动检查范围内。</p>
    <RendererButton v-if="state.status === 'idle'" button-type="danger" data-action="preview-remove-model" :disabled="disabled || busy" @click="run('preview')" label="预览模型删除" />
    <template v-if="state.preview">
      <p>待删除：{{ state.preview.name }} · {{ modelId }}</p>
      <ul><li v-for="record in state.preview.records" :key="record.table">{{ record.table }}：{{ record.ids.length }} 条（{{ record.ids.join('、') }}）</li></ul>
      <p v-if="state.preview.layout">该模型的布局坐标将在数据库删除确认后单独清理；其他模型布局保留。</p>
    </template>
    <template v-if="state.status === 'ready'">
      <p role="alert">确认后通过 SPARK 批量接口一次提交上述记录，并逐组核验回执；批量请求不等同于事务保证。</p>
      <RendererButton button-type="danger" data-action="confirm-remove-model" :disabled="busy || disabled" @click="run('save')" label="确认删除上述记录" />
      <RendererButton data-action="cancel-remove-model" :disabled="busy" @click="cancel" label="取消删除" />
    </template>
    <template v-if="['unknown', 'readback', 'different'].includes(state.status)">
      <p role="alert">删除结果尚未完全确认。核验将沿原提交捕获向 SPARK 请求正式恢复回执，再回读模型、字段和关系；不会重复删除。</p>
      <ul><li v-for="item in state.verification" :key="`${item.table}:${item.id}`">{{ item.table }}/{{ item.id }}：{{ item.result }}</li></ul>
      <RendererButton data-action="verify-remove-model" :disabled="busy" @click="run('verify')" label="核验删除结果" />
      <RendererButton v-if="state.canDiscardNotApplied" data-action="discard-not-applied-remove-model" :disabled="busy" @click="discardNotApplied" label="放弃本次未执行的删除并重读" />
    </template>
    <template v-if="state.status === 'configuration'">
      <p role="alert">数据库记录已删除并回读确认，布局文件尚未处理完成。继续将核对当前远端配置，只清理此模型坐标；不会再次删除数据库记录。</p>
      <RendererButton data-action="resume-remove-model-layout" :disabled="busy" @click="run('verify')" label="核对当前配置并清理布局" />
    </template>
  </section>
</template>
<script setup lang="ts">
import {computed, onBeforeUnmount, ref} from 'vue'
import {RendererButton} from '@spark-appworks/spark-component'
import type {DataSpaceModelRemovalProps} from './DataSpaceModelRemoval.props'

const props = defineProps<DataSpaceModelRemovalProps>()
const emit = defineEmits<{changed: []; begin: [modelId: string]; ended: [confirmed: boolean, close?: boolean]}>()
const busy = ref(false), error = ref(''), tick = ref(0)
let active = true
const owner = computed(() => props.session.getModelRemove(props.modelId))
const state = computed(() => {props.revision; tick.value; return owner.value.getState()})
const describe = (cause: unknown) => cause instanceof Error ? cause.message : String(cause)
async function run(action: 'preview' | 'save' | 'verify'): Promise<void> {
  if (!active || busy.value || props.disabled && action !== 'verify') return
  busy.value = true; error.value = ''; emit('begin', props.modelId)
  let confirmed = false
  try {
    confirmed = action === 'preview' ? (await owner.value.preview(), false) : action === 'save' ? await owner.value.save() : await owner.value.verify()
  } catch (cause) {if (active) error.value = describe(cause)}
  finally {
    if (active) {
      busy.value = false; tick.value++; emit('changed')
      if (owner.value.getState().status === 'idle') emit('ended', confirmed)
    }
  }
}
function cancel(): void {
  try {owner.value.cancel(); error.value = ''; tick.value++; emit('changed'); emit('ended', false, true)} catch (cause) {error.value = describe(cause)}
}
async function discardNotApplied(): Promise<void> {
  if (!active || busy.value) return
  busy.value = true; error.value = ''; emit('begin', props.modelId)
  try {await owner.value.discardNotApplied(); if (active) {tick.value++; emit('changed'); emit('ended', false, true)}}
  catch (cause) {if (active) error.value = describe(cause)}
  finally {if (active) {busy.value = false; tick.value++; emit('changed')}}
}
/** 画布删除入口复用相同预览及权限检查；此命令不派发删除。 */
defineExpose({preview: () => run('preview')})
onBeforeUnmount(() => {active = false})
</script>
<style scoped>
section {border-top:1px solid var(--el-border-color); margin-top:1rem; padding-top:1rem;}
p,li {overflow-wrap:anywhere;}
[role="alert"] {color:var(--el-color-danger); white-space:pre-wrap;}
</style>
