<!--
@module app:views/platform/login/verification-code-button
职责：在注册抽屉内经发送验证码命令视图提交一次发送请求；成功后 60 秒倒计时禁用，明确失败可立即重发。
边界：每次发送新增一行命令并只保存该行；失败的待提交行随即放弃，不复制或保留注册输入。
-->
<template>
  <RendererButton :data-view-key="dataViewKey" :label="label" :disabled="disabled || sending || remaining > 0" @click="send" />
</template>
<script setup lang="ts">
import {computed, onBeforeUnmount, ref} from 'vue'
import {PAGE_SERVICE, PAGE_RUNTIME, RendererButton, useSparkComponent, consumeRequiredPageService} from '@spark-appworks/spark-component'

/** request 为本次发送的企业、验证方式、验证账号与场景；dataViewKey 为发送验证码命令视图。 */
const props = defineProps<{dataViewKey: string; request: Readonly<{enterpriseName: string; channel: string; account: string; scene: string}>; disabled?: boolean}>()
const {sparkConsume} = useSparkComponent({type: 'verification-code-button'})
const pageService = consumeRequiredPageService(sparkConsume, 'verification-code-button')

const sending = ref(false), remaining = ref(0)
let timer: ReturnType<typeof setInterval> | undefined, active = true
const label = computed(() => remaining.value > 0 ? `${remaining.value} 秒后重发` : '发送验证码')

async function send(): Promise<void> {
  const view = sparkConsume(PAGE_RUNTIME)?.resolveView(props.dataViewKey), dataSet = view?.dataSet
  if (!view || !dataSet || sending.value || remaining.value > 0) return
  sending.value = true
  let id: string | number | undefined
  try {
    id = view.getPkKey(await view.addRow({...props.request}))
    if (id === undefined) throw new Error('发送验证码命令未生成记录身份')
    const result = await dataSet.saveChanges({views: [{tableName: view.tableName, viewId: view.viewId, ids: [id]}]})
    if (!result.success) throw result.error ?? new Error('验证码发送未确认')
    if (!active) return
    pageService.showMessage('验证码已发送', 'success')
    remaining.value = 60
    timer = setInterval(() => {
      remaining.value -= 1
      if (remaining.value <= 0) {clearInterval(timer); timer = undefined}
    }, 1000)
  } catch (cause) {
    if (id !== undefined && !view.destroyed && view.dirtyTracking.isPendingCreate(id)) view.discardPendingChanges([id])
    if (active) pageService.showMessage(cause instanceof Error ? cause.message : String(cause), 'error')
  } finally {
    if (active) sending.value = false
  }
}

onBeforeUnmount(() => {active = false; if (timer) clearInterval(timer)})
</script>
