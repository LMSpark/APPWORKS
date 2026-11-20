<!--
@module app:views/features/data-platform/database-management/table-and-view/ui/copy-table-dialog
职责：复制物理表对话框；提交新表名/描述，由页面调用 spark-data 复制编排。
-->
<template>
  <RendererDialog :model-value="true" title="复制表" :width="520" :close-disabled="busy" @update:model-value="emit('cancel')">
    <p v-if="sourceLabel">源表：{{ sourceLabel }}</p>
    <p v-if="actionError" role="alert">{{ actionError }}</p>
    <label class="copy-table-field">
      <span>新表名</span>
      <input v-model="tblname" type="text" :disabled="busy" placeholder="请输入新表名">
    </label>
    <label class="copy-table-field">
      <span>描述</span>
      <textarea v-model="tbldesc" :disabled="busy" rows="3" placeholder="请输入描述" />
    </label>
    <template #footer>
      <RendererButton label="取消" :disabled="busy" @click="emit('cancel')" />
      <RendererButton label="保存" :disabled="busy" @click="submit" />
    </template>
  </RendererDialog>
</template>

<script setup lang="ts">
import {ref, watch} from 'vue'
import {RendererButton, RendererDialog} from '@spark-appworks/spark-component'

const props = defineProps<{
  sourceLabel: string
  busy: boolean
  actionError: string
}>()

const emit = defineEmits<{
  cancel: []
  save: [payload: Readonly<{tblname: string; tbldesc: string}>]
}>()

const tblname = ref('')
const tbldesc = ref('')

watch(() => props.sourceLabel, () => {
  tblname.value = ''
  tbldesc.value = ''
}, {immediate: true})

function submit(): void {
  emit('save', {tblname: tblname.value.trim(), tbldesc: tbldesc.value.trim()})
}
</script>

<style scoped>
.copy-table-field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-top: 0.75rem;
}

.copy-table-field input,
.copy-table-field textarea {
  width: 100%;
  box-sizing: border-box;
}
</style>
