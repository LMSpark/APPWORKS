<!--
@module app:views/app/dev-system/blueprint-workspace/DeliveryPane
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
      <RendererTabPane label="预览" name="preview" :index="files.length"><DevPreviewTab v-if="activeFile === 'preview'" :state="state" :refresh-token="0" /></RendererTabPane>
    </RendererTabs>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { PageToolFileName } from '@spark-appworks/spark-project-model'
import { RendererButton, RendererTabPane, RendererTabs } from '@spark-appworks/spark-component'
import DevFileEditor from '../DevFileEditor.vue'
import DevPreviewTab from '../DevPreviewTab.vue'
import type { DevState } from '../useDevState'
defineProps<{ state: DevState; saving: boolean; canPublish: boolean }>()
defineEmits<{ save: [] }>()
const files: readonly PageToolFileName[] = ['rule.json', 'script.js', 'style.css']
const activeFile = ref<PageToolFileName | 'preview'>('rule.json')
</script>

<style scoped>
.delivery-pane { display: flex; flex-direction: column; }
.delivery-actions { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; color: var(--el-text-color-secondary); }
.delivery-tabs { flex: 1; min-height: 0; }
</style>
