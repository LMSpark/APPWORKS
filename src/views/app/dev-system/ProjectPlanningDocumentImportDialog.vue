<!--
@module app:views/app/dev-system/ProjectPlanningDocumentImportDialog
职责：提供 DevSystem 的项目策划文档导入对话框，围绕 .docx 附件上传、附件引用绑定和 projectPlanning AI 运行状态展示。
边界：只展示附件元数据与 AI trace；Word 正文不进入前端。
AI用途：排查需求文档到 projectPlanning 的导入链路时，用本模块定位前端交互入口。
-->
<template>
  <RendererDialog
    v-model="visible"
    title="导入项目策划文档"
    width="640px"
    :close-on-click-modal="false"
    @close="handleClose"
  >
    <div class="project-planning-import">
      <div
        class="project-planning-import__upload"
        :class="{ 'project-planning-import__upload--dragover': isDragOver }"
        @dragover.prevent="isDragOver = true"
        @dragleave.prevent="isDragOver = false"
        @drop.prevent="handleDrop"
      >
        <input
          ref="fileInput"
          type="file"
          accept=".docx"
          style="display: none"
          @change="handleFileChange"
        />
        <div class="project-planning-import__upload-content">
          <NavIcon name="Upload" :size="24" />
          <p class="project-planning-import__upload-text">
            将 .docx 文件拖拽到此处，或
            <RendererButton label="点击选择文件" button-type="primary" link @click="fileInput?.click()" />
          </p>
          <p class="project-planning-import__upload-hint">仅支持 .docx 格式的项目策划文档</p>
        </div>
      </div>

      <div
        v-if="state.projectPlanningDocumentFileName.value || state.projectPlanningAttachmentRef.value"
        class="project-planning-import__file-info"
      >
        <NavIcon name="Document" :size="14" />
        <span class="project-planning-import__filename">
          {{ state.projectPlanningDocumentFileName.value || '已绑定项目策划附件' }}
        </span>
        <DisplayAlert v-if="state.projectPlanningDocumentUploading.value" title="正在上传…" alert-type="info" />
        <DisplayTag v-else-if="state.projectPlanningAttachmentRef.value" content="已绑定" tag-type="success" size="small" />
      </div>

      <div v-if="state.projectPlanningAttachmentRef.value" class="project-planning-import__ref">
        <span class="project-planning-import__ref-label">planningAttachmentRef</span>
        <code>{{ state.projectPlanningAttachmentRef.value }}</code>
      </div>

      <div v-if="state.projectPlanningAiTimeline.value.length > 0" class="project-planning-import__timeline">
        <div class="project-planning-import__timeline-header">
          <span>AI 进度</span>
          <DisplayTag :content="String(state.projectPlanningAiTimeline.value.length)" tag-type="info" size="small" />
        </div>
        <div
          v-for="event in state.projectPlanningAiTimeline.value"
          :key="event.sequence"
          class="project-planning-import__timeline-row"
        >
          <DisplayTag :content="event.type" size="small" effect="plain" />
          <span class="project-planning-import__timeline-text">{{ event.payloadPreview }}</span>
        </div>
      </div>
    </div>

    <template #footer>
      <RendererButton label="取消" @click="handleClose" />
      <RendererButton
        :label="state.projectPlanningAiRunning.value ? 'AI 正在策划...' : '开始项目策划'"
        button-type="primary"
        :loading="state.projectPlanningAiRunning.value"
        :disabled="!state.projectPlanningAttachmentRef.value || state.projectPlanningDocumentUploading.value"
        @click="state.runProjectPlanningDocumentImportAi()"
      />
    </template>
  </RendererDialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import {DisplayAlert,DisplayTag,RendererButton,RendererDialog} from '@spark-appworks/spark-component'
import NavIcon from '@/components/NavIcon.vue'
import type { DevState } from './useDevState'

const props = defineProps<{
  state: DevState
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
})

const fileInput = ref<HTMLInputElement | null>(null)
const isDragOver = ref(false)

function handleFileChange(event: Event): void {
  const input = event.target
  if (!(input instanceof HTMLInputElement)) return
  const file = input.files?.[0]
  if (file) {
    void props.state.handleProjectPlanningDocumentFileSelected(file)
  }
  input.value = ''
}

function handleDrop(event: DragEvent): void {
  isDragOver.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file) {
    void props.state.handleProjectPlanningDocumentFileSelected(file)
  }
}

function handleClose(): void {
  props.state.closeProjectPlanningDocumentImportDialog()
}
</script>

<style scoped>
.project-planning-import {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.project-planning-import__upload {
  border: 2px dashed var(--el-border-color);
  border-radius: 8px;
  padding: 24px;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.2s, background-color 0.2s;
}

.project-planning-import__upload:hover,
.project-planning-import__upload--dragover {
  border-color: var(--el-color-primary);
  background-color: var(--el-color-primary-light-9);
}

.project-planning-import__upload-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: var(--el-text-color-regular);
}

.project-planning-import__upload-text {
  margin: 0;
  font-size: 14px;
}

.project-planning-import__upload-hint {
  margin: 0;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.project-planning-import__file-info,
.project-planning-import__ref {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
  font-size: 13px;
}

.project-planning-import__filename,
.project-planning-import__timeline-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-planning-import__ref-label {
  color: var(--el-text-color-secondary);
}

.project-planning-import__ref code {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--el-color-primary);
}

.project-planning-import__timeline {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.project-planning-import__timeline-header,
.project-planning-import__timeline-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.project-planning-import__timeline-header {
  justify-content: space-between;
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-regular);
}

.project-planning-import__timeline-row {
  min-height: 28px;
  padding: 6px 8px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  font-size: 12px;
}
</style>
