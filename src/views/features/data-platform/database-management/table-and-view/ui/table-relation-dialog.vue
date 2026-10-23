<!--
@module app:views/features/data-platform/database-management/table-and-view/ui/table-relation-dialog
职责：表关系新增/编辑；提交草稿由页面写入 Base_TblRln staged 并 saveChanges。
-->
<template>
  <RendererDialog
    :model-value="true"
    :title="draft.mode === 'edit' ? '编辑表关系' : '新增表关系'"
    :width="640"
    :close-disabled="busy"
    @update:model-value="emit('cancel')"
  >
    <p v-if="currentTableLabel">当前表：{{ currentTableLabel }}（作为{{ draft.currentRole === 'master' ? '主表' : '从表' }}）</p>
    <p v-if="actionError" role="alert">{{ actionError }}</p>
    <label class="relation-field">
      <span>当前表作为</span>
      <select v-model="roleModel" :disabled="busy || draft.mode === 'edit'">
        <option value="master">主表</option>
        <option value="child">从表</option>
      </select>
    </label>
    <label class="relation-field">
      <span>{{ draft.currentRole === 'master' ? '从表' : '主表' }}</span>
      <select v-model="peerIdModel" :disabled="busy">
        <option value="">请选择</option>
        <option v-for="item in peerTableOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
      </select>
    </label>
    <label class="relation-field">
      <span>关系表达式</span>
      <input v-model="rlnameModel" type="text" :disabled="busy" placeholder="例如 Orders.Id=Other.OrderId">
    </label>
    <label class="relation-field relation-field--inline">
      <input v-model="cascadeModel" type="checkbox" :disabled="busy">
      <span>级联删除</span>
    </label>
    <template #footer>
      <RendererButton label="取消" :disabled="busy" @click="emit('cancel')" />
      <RendererButton label="保存" :disabled="busy" @click="emit('save')" />
    </template>
  </RendererDialog>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {RendererButton, RendererDialog} from '@spark-appworks/spark-component'
import type {DatabaseCatalogRelationFormDraft} from '@/lowcode/resources/database/database-catalog-relation-form-ops'

const props = defineProps<{
  draft: DatabaseCatalogRelationFormDraft
  currentTableLabel: string
  peerTableOptions: ReadonlyArray<Readonly<{value: string; label: string}>>
  peerTableId: string
  busy: boolean
  actionError: string
}>()

const emit = defineEmits<{
  cancel: []
  save: []
  'update:draft': [DatabaseCatalogRelationFormDraft]
  'update:peer-table-id': [string]
}>()

const roleModel = computed({
  get: () => props.draft.currentRole,
  set: value => {
    if (value !== 'master' && value !== 'child') return
    emit('update:draft', {...props.draft, currentRole: value})
  },
})

const peerIdModel = computed({
  get: () => props.peerTableId,
  set: value => emit('update:peer-table-id', value),
})

const rlnameModel = computed({
  get: () => props.draft.rlname,
  set: value => emit('update:draft', {...props.draft, rlname: value}),
})

const cascadeModel = computed({
  get: () => props.draft.IsCascadeDeletion === '1',
  set: value => emit('update:draft', {...props.draft, IsCascadeDeletion: value ? '1' : '0'}),
})
</script>

<style scoped>
.relation-field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-top: 0.75rem;
}

.relation-field--inline {
  flex-direction: row;
  align-items: center;
}

.relation-field select,
.relation-field input[type='text'] {
  width: 100%;
}
</style>
