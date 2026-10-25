<!--
@module app:views/features/data-platform/database-management/table-and-view/ui/table-relation-dialog
职责：表关系窄编辑工作区；所有字段均绑定原 Base_TblRln DataView。
-->
<template>
  <RendererDialog :model-value="true" :title="session.mode === 'edit' ? '编辑表关系' : '新增表关系'" :width="680"
    :close-disabled="locked" @update:model-value="emit('cancel')">
    <p v-if="currentTableLabel">当前物理表：{{ currentTableLabel }}；当前作为{{ session.currentRole === 'master' ? '主表' : '从表' }}</p>
    <p v-if="actionError" role="alert">{{ actionError }}</p>
    <RendererForm :data-view-key="dataViewKey" context-data-member="currentRow" :auto-columns="false"
      :show-data-view-meta="false" :grid-columns="1" :form-props="{disabled: locked}">
      <FieldText field="rlname" label="关系名称" placeholder="请输入关系名称" />
      <FieldSelect :field="peerField" :label="session.currentRole === 'master' ? '从表' : '主表'"
        :option-data-view-key="peerDataViewKey" option-data-member="rows"
        option-label-field="tblname" option-value-field="rowid" :filterable="true"
        :disabled="locked" :on-change="onPeerChange" />
      <FieldSelect field="IsCascadeDeletion" label="级联删除" :clearable="false"
        :options="cascadeOptions" :disabled="locked" />
    </RendererForm>
    <section class="relation-expression" aria-label="关系表达式">
      <h3>关系表达式</h3>
      <p v-if="expressionLoading" role="status">正在读取当前主从表字段…</p>
      <p v-else-if="expressionError" role="alert">{{ expressionError }}</p>
      <template v-else>
        <p v-if="expressionWarning" role="status">{{ expressionWarning }}</p>
        <p v-if="!columns.length" role="status">请先选择另一端物理表，表达式候选按已选端点读取。</p>
        <RendererFilterExpression v-if="columns.length" :data-view-key="dataViewKey" data-member="currentRow" field="RelshipExp"
          format="spark-json" :columns="columns" :function-context="functionContext"
          display="dialog" display-mode="box" :disabled="locked" :on-editing-change="onExpressionEditingChange" />
      </template>
    </section>
    <template #footer>
      <RendererButton label="当前作为主表" :disabled="locked || session.currentRole === 'master'" @click="emit('switchRole', 'master')" />
      <RendererButton label="当前作为从表" :disabled="locked || session.currentRole === 'child'" @click="emit('switchRole', 'child')" />
      <RendererButton label="取消" :disabled="locked" @click="emit('cancel')" />
      <RendererButton :label="unconfirmed ? '核验保存结果' : '保存'" :disabled="busy" @click="emit('save')" />
    </template>
  </RendererDialog>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {FieldSelect, FieldText, RendererButton, RendererDialog, RendererFilterExpression, RendererForm} from '@spark-appworks/spark-component'
import type {DataColumn, DataViewFilterFunctionContext} from '@spark-appworks/spark-data'
import type {DatabaseCatalogRelationSession} from '@/lowcode/resources/database/database-catalog-relation-form-ops'

const cascadeOptions = [{value: 0, label: '否'}, {value: 1, label: '是'}]

const props = defineProps<{
  dataViewKey: string
  peerDataViewKey: string
  peerField: 'pktbid' | 'fktbid'
  session: DatabaseCatalogRelationSession
  currentTableLabel: string
  columns: readonly DataColumn[]
  functionContext: DataViewFilterFunctionContext
  expressionLoading: boolean
  expressionError: string
  expressionWarning: string
  onExpressionEditingChange: (editing: boolean) => void
  busy: boolean
  unconfirmed: boolean
  actionError: string
  onPeerChange: (...args: unknown[]) => void | Promise<void>
}>()
const locked = computed(() => props.busy || props.unconfirmed)

const emit = defineEmits<{
  cancel: []
  save: []
  switchRole: [role: 'master' | 'child']
}>()
</script>

<style scoped>
.relation-expression {margin-top: 1rem;}
.relation-expression h3 {font-size: 1rem; margin: 0 0 0.5rem;}
</style>
