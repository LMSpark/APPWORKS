<!--
@module app:views/features/application/application-function-management/ui/page-design/DeliveryPane
职责：展示页面工具三文件编辑与真实运行实例预览。
边界：三文件独立追加编号快照，场景pagedata不进入工具发布指针。
AI用途：编辑rule/script/style并触发父工作台真实交付动作。
-->
<template>
  <section class="delivery-pane">
    <div class="delivery-actions">
      <span>三个文件独立追加版本；页面数据来自 DataSpace。</span>
      <RendererButton label="保存三个交付文件" button-type="primary" :loading="saving" :disabled="!canPublish" @click="$emit('save')" />
    </div>
    <RendererTabs v-model="activeFile" class="delivery-tabs">
      <RendererTabPane v-for="(file, index) in files" :key="file" :label="file" :name="file" :index="index">
        <DevFileEditor v-if="activeFile === file" :state="state" :active-file="file" :show-tabs="false" />
      </RendererTabPane>
      <RendererTabPane label="预览" name="preview" :index="files.length" :lazy="true"><DevPreviewTab :state="state" :refresh-token="previewRefreshToken" v-bind="registerPreviewGuard ? {registerPreviewGuard} : {}" /></RendererTabPane>
    </RendererTabs>
  </section>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { PageToolFileName } from '@spark-appworks/spark-project-model'
import { RendererButton, RendererTabPane, RendererTabs } from '@spark-appworks/spark-component'
import DevFileEditor from '../DevFileEditor.vue'
import DevPreviewTab from '../DevPreviewTab.vue'
import type { DevState } from '../blueprint-state/useDevState'
import type { DevPreviewRequest } from './use-page-design'
const props=defineProps<{ state: DevState; saving: boolean; canPublish: boolean; previewRequest?: DevPreviewRequest; registerPreviewGuard?: (guard: () => boolean) => () => void }>()
defineEmits<{ save: [] }>()
const files: readonly PageToolFileName[] = ['rule.json', 'script.js', 'style.css']
const activeFile = ref<PageToolFileName | 'preview'>('rule.json')
const previewRefreshToken = ref(0)
watch(activeFile, (value, previous) => {
  if (value==='preview' && previous!=='preview') previewRefreshToken.value++
}, {flush:'sync'})
watch(()=>props.previewRequest, request => {
  if (!request) return
  if (activeFile.value==='preview') previewRefreshToken.value++
  else activeFile.value='preview'
}, {immediate:true,flush:'sync'})
</script>

<style scoped>
.delivery-pane { display: flex; flex-direction: column; }
.delivery-actions { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; color: var(--el-text-color-secondary); }
.delivery-tabs { flex: 1; min-height: 0; }
</style>
