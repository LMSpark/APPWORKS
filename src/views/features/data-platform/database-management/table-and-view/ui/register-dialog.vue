<!--
@module app:views/features/data-platform/database-management/table-and-view/ui/register-dialog
职责：注册未登记物理表/视图（写命令 registerTable/registerView）；列表绑定只读命令 DataView。
-->
<template>
  <RendererDialog :model-value="true" title="注册" :width="920" :close-disabled="busy" @update:model-value="emit('cancel')">
    <p v-if="databaseLabel">数据库：{{ databaseLabel }}</p>
    <p v-if="listError" role="alert">{{ listError }}</p>
    <div class="register-object-switch">
      <RendererButton label="物理表" :disabled="busy || objectType === 'table'" @click="switchType('table')" />
      <RendererButton label="视图" :disabled="busy || objectType === 'view'" @click="switchType('view')" />
    </div>
    <p v-if="loadingList" role="status">正在读取未注册{{ objectType === 'table' ? '表' : '视图' }}…</p>
    <RendererTable v-else :data-view-key="listKey" :auto-columns="true" :stripe="true"
      :show-pagination="false" :show-data-view-meta="false" />
    <label v-if="objectType === 'table' && !loadingList" class="register-default-fields">
      <input v-model="addDefaultFields" type="checkbox" :disabled="busy">
      为选中项添加默认字段
    </label>
    <template #footer>
      <RendererButton label="刷新列表" :disabled="busy || loadingList" @click="reloadList" />
      <RendererButton label="取消" :disabled="busy" @click="emit('cancel')" />
      <RendererButton label="确认" :disabled="busy || loadingList" @click="emit('confirm', {addDefaultFields})" />
    </template>
  </RendererDialog>
</template>

<script setup lang="ts">
import {ref, watch} from 'vue'
import {RendererButton, RendererDialog, RendererTable} from '@spark-appworks/spark-component'

export type RegisterObjectType = 'table' | 'view'

const props = defineProps<{
  databaseLabel: string
  objectType: RegisterObjectType
  listKey: string
  busy: boolean
  loadList: (type: RegisterObjectType) => Promise<void>
}>()

const emit = defineEmits<{
  cancel: []
  confirm: [payload: Readonly<{addDefaultFields: boolean}>]
  'update:objectType': [RegisterObjectType]
}>()

const loadingList = ref(true)
const addDefaultFields = ref(true)
const listError = ref('')

async function reloadList(): Promise<void> {
  loadingList.value = true
  listError.value = ''
  try {
    await props.loadList(props.objectType)
  } catch (cause) {
    listError.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    loadingList.value = false
  }
}

function switchType(type: RegisterObjectType): void {
  if (type === props.objectType) return
  emit('update:objectType', type)
}

watch(() => props.objectType, () => { void reloadList() }, {immediate: true})
</script>

<style scoped>
.register-object-switch {
  display: flex;
  gap: 0.5rem;
  margin: 0.75rem 0;
}

.register-default-fields {
  display: block;
  margin-top: 0.75rem;
}
</style>
