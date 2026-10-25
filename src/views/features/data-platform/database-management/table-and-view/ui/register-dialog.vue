<!--
@module app:views/features/data-platform/database-management/table-and-view/ui/register-dialog
职责：注册未登记物理表/视图（写命令 registerTable/registerView）；列表绑定只读命令 DataView。
-->
<template>
  <RendererDialog :model-value="true" title="注册" :width="920" :close-disabled="busy || hasPending" @update:model-value="emit('cancel')">
    <p v-if="databaseLabel">数据库：{{ databaseLabel }}</p>
    <p v-if="listError" role="alert">{{ listError }}</p>
    <div class="register-object-switch">
      <RendererButton label="物理表" :disabled="busy || hasPending || objectType === 'table'" @click="switchType('table')" />
      <RendererButton label="视图" :disabled="busy || hasPending || objectType === 'view'" @click="switchType('view')" />
    </div>
    <p v-if="loadingList" role="status">正在读取未注册{{ objectType === 'table' ? '表' : '视图' }}…</p>
    <div v-else :inert="hasPending">
      <RendererTable :data-view-key="listKey" :auto-columns="true" :stripe="true"
        :show-pagination="false" :show-data-view-meta="false" />
    </div>
    <section class="register-progress">
      <h3>本批命令与已确认项</h3>
      <p v-if="hasUnconfirmed" role="status">当前项结果未知；请核验原命令行。成功项与未提交项仍保留在此批次。</p>
      <p v-else-if="hasPending" role="status">本批仍有未完成项，将沿原命令行及选项继续。</p>
      <RendererTable :data-view-key="progressKey" :children="progressFields" :auto-columns="false" :stripe="true"
        :show-pagination="false" :show-data-view-meta="false" />
    </section>
    <RendererForm v-if="objectType === 'table' && !loadingList" :data-view-key="commandInputKey"
      data-member="currentRow" :show-data-view-meta="false" :auto-columns="false" :grid-columns="1">
      <FieldCheckbox :data-view-key="commandInputKey" data-member="currentRow" field="addDefaultFields" label="默认字段" true-value="1" false-value="0"
        checkbox-text="为选中项添加默认字段" :readonly="busy || hasPending" />
    </RendererForm>
    <template #footer>
      <RendererButton label="刷新列表" :disabled="busy || loadingList || hasPending" @click="reloadList" />
      <RendererButton v-if="!hasPending" label="取消" :disabled="busy" @click="emit('cancel')" />
      <RendererButton v-else-if="!hasUnconfirmed" :label="requiresCancel ? '取消此项并结束批次' : '取消未完成项'" :disabled="busy" @click="emit('discard-pending')" />
      <RendererButton v-if="hasUnconfirmed" label="核验保存结果" :disabled="busy" @click="emit('verify')" />
      <RendererButton v-else-if="!requiresCancel" :label="hasPending ? '继续未完成项' : '确认'" :disabled="busy || loadingList" @click="emit('confirm')" />
    </template>
  </RendererDialog>
</template>

<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {FieldCheckbox, RendererButton, RendererDialog, RendererForm, RendererTable} from '@spark-appworks/spark-component'

export type RegisterObjectType = 'table' | 'view'

const props = defineProps<{
  databaseLabel: string
  objectType: RegisterObjectType
  listKey: string
  progressKey: string
  commandInputKey: string
  busy: boolean
  hasUnconfirmed: boolean
  hasPending: boolean
  requiresCancel: boolean
  loadList: (type: RegisterObjectType) => Promise<void>
}>()

const emit = defineEmits<{
  cancel: []
  confirm: []
  verify: []
  'discard-pending': []
  'update:objectType': [RegisterObjectType]
}>()

const loadingList = ref(true)
const listError = ref('')
const progressFields = computed(() => [
  {type: 'r-text', props: {field: props.objectType === 'table' ? 'tableName' : 'viewName', label: props.objectType === 'table' ? '表名' : '视图名'}},
  ...(props.objectType === 'table' ? [{type: 'r-text', props: {field: 'addDefaultFields', label: '默认字段'}}] : []),
  {type: 'r-text', props: {field: 'registrationStatus', label: '状态'}},
])

async function reloadList(): Promise<void> {
  if (props.hasPending) return
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
