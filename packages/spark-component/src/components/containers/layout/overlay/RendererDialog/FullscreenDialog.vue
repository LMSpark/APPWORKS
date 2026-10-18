<!--
@module @spark-appworks/spark-component:components/containers/layout/overlay/RendererDialog/FullscreenDialog
职责：承接参考FullscreenDialog的手动/窄屏全屏和关闭复位。
边界：内部窗口控件；不创建数据上下文、过滤草稿或保存通道。
AI用途：由标准r-dialog与专题弹窗复用，不在业务页复制尺寸逻辑。
-->
<template>
  <el-dialog v-bind="$attrs" class="renderer-fullscreen-dialog" :model-value="modelValue" :title="title"
    :width="width" :top="top" :append-to-body="appendToBody" :fullscreen="effectiveFullscreen" :before-close="beforeClose"
    @update:model-value="changeVisible" @open="emit('open')" @close="emit('close')" @opened="emit('opened')" @closed="emit('closed')">
    <template #header="header">
      <div class="renderer-fullscreen-dialog__header">
        <slot name="header" v-bind="header" :fullscreen="effectiveFullscreen">
          <h2 :id="header?.titleId" :class="header?.titleClass">{{ title }}</h2>
        </slot>
        <button v-if="fullscreenable && !viewportFullscreen" type="button" class="renderer-fullscreen-dialog__toggle"
          :aria-label="manualFullscreen ? '退出全屏' : '全屏'" :title="manualFullscreen ? '退出全屏' : '全屏'"
          @click.stop="setFullscreen(!manualFullscreen)"><span aria-hidden="true">{{ manualFullscreen ? '⤢' : '⛶' }}</span></button>
      </div>
    </template>
    <slot :fullscreen="effectiveFullscreen" />
    <template v-if="$slots['footer']" #footer><slot name="footer" :fullscreen="effectiveFullscreen" /></template>
  </el-dialog>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref, watch} from 'vue'
import type {FullscreenDialogProps} from './FullscreenDialog.props'
defineOptions({inheritAttrs: false})
const props = withDefaults(defineProps<FullscreenDialogProps>(), {modelValue: false, fullscreen: false,
  fullscreenable: true, autoFullscreenBelow: 0, resetFullscreenOnClose: false})
const emit = defineEmits<{'update:modelValue': [visible: boolean]; 'update:fullscreen': [fullscreen: boolean];
  open: []; close: []; opened: []; closed: []}>()
const manualFullscreen = ref(props.fullscreen), viewportFullscreen = ref(false)
const effectiveFullscreen = computed(() => manualFullscreen.value || viewportFullscreen.value)
function updateViewport(): void {
  viewportFullscreen.value = typeof window !== 'undefined' && props.autoFullscreenBelow > 0 && window.innerWidth <= props.autoFullscreenBelow
}
function setFullscreen(value: boolean): void {manualFullscreen.value = value; emit('update:fullscreen', value)}
function resetFullscreen(): void {if (props.resetFullscreenOnClose && manualFullscreen.value) setFullscreen(false)}
function changeVisible(value: boolean): void {emit('update:modelValue', value); if (!value) resetFullscreen()}
watch(() => props.fullscreen, value => {manualFullscreen.value = value})
watch(() => props.modelValue, visible => {if (!visible) resetFullscreen()})
watch(() => props.autoFullscreenBelow, updateViewport)
onMounted(() => {updateViewport(); window.addEventListener('resize', updateViewport)})
onBeforeUnmount(() => {if (typeof window !== 'undefined') window.removeEventListener('resize', updateViewport)})
</script>

<style scoped>
.renderer-fullscreen-dialog__header {display:flex; align-items:center; width:100%; min-width:0; padding-right:36px; box-sizing:border-box}
.renderer-fullscreen-dialog__header > :first-child {flex:1; min-width:0; margin:0}
.renderer-fullscreen-dialog__toggle {flex:none; display:inline-grid; place-items:center; width:28px; height:28px; margin-left:8px; padding:0; cursor:pointer; color:var(--el-color-primary); background:var(--el-bg-color); border:1px solid var(--el-border-color); border-radius:4px}
.renderer-fullscreen-dialog__toggle:hover {color:var(--el-color-white); background:var(--el-color-primary)}
:global(.renderer-fullscreen-dialog .el-dialog__header) {position:relative}
:global(.renderer-fullscreen-dialog .el-dialog__headerbtn) {top:50%; right:0; transform:translateY(-50%)}
:global(.el-overlay-dialog:has(> .el-dialog.renderer-fullscreen-dialog.is-fullscreen)) {display:block; padding:0; overflow:hidden}
:global(.el-dialog.renderer-fullscreen-dialog.is-fullscreen) {display:flex; flex-direction:column; width:100% !important; max-width:none !important; height:100dvh !important; max-height:none !important; margin:0 !important; border-radius:0; --el-dialog-margin-top:0px}
:global(.el-dialog.renderer-fullscreen-dialog.is-fullscreen > .el-dialog__body) {flex:1; min-height:0; overflow:auto}
</style>
