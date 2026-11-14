<!--
@module app:views/features/workflow/flow-append-user/ui/flow-append-user
职责：流程参与人追加（列表、加人、撤回）；嵌入办理页或对话框宿主。
边界：写操作经 lowcode FlowAppendUserClient；列表消费监控场景步骤 DataView。
-->
<template>
  <RendererSection
    class="flow-append-user"
    :class="{'flow-append-user--embedded': embedded}"
    title="追加参与人"
    :bordered="!embedded"
    :grid-columns="1"
    :status="pageLoading ? '正在加载…' : ''"
    :error="pageError"
    :retryable="!!pageError && !pageLoading"
    @retry="loadPageData"
  >
    <template #header-actions>
      <div class="flow-append-user__node" v-if="embedded">
        <span class="flow-append-user__node-label">节点</span>
        <span class="flow-append-user__node-value">{{ contextTitle }}</span>
      </div>
      <RendererButton label="添加办理人" button-type="primary" :disabled="pageLoading" @click="openAddDialog" />
    </template>
  <p v-if="!embedded" class="flow-append-user__node-title">{{ contextTitle }}</p>
    <el-table
      v-loading="pageLoading"
      :data="appendList"
      border
      height="380"
      row-key="rowid"
      empty-text="暂无追加办理记录"
      class="flow-append-user__table"
    >
      <el-table-column prop="ReceiveUserName" label="办理人" min-width="180" show-overflow-tooltip />
      <el-table-column prop="StepState" label="步骤状态" min-width="120" show-overflow-tooltip />
      <el-table-column prop="STATUS" label="办理状态" min-width="120" show-overflow-tooltip />
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="{row}">
          <el-button
            link
            type="primary"
            :disabled="!canRevoke(row) || revokeRowId === row.rowid"
            :loading="revokeRowId === row.rowid"
            @click="revokeRecord(row)"
          >
            撤回
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <RendererDialog
      v-model="addDialog.visible"
      title="添加办理人"
      :width="560"
      :append-to-body="true"
      :close-on-click-modal="false"
      :destroy-on-close="true"
      @closed="resetAddDialog"
    >
      <div v-loading="addDialog.loading" class="flow-append-user__dialog-body">
        <el-select
          v-if="selectOptions.length > 0"
          v-model="addDialog.selectedIds"
          multiple
          filterable
          collapse-tags
          collapse-tags-tooltip
          placeholder="选择办理人"
          class="flow-append-user__user-select"
        >
          <el-option
            v-for="item in selectOptions"
            :key="item.UserId"
            :label="item.UserName || item.UserId"
            :value="item.UserId"
          />
        </el-select>
        <DisplayAlert v-else alert-type="warning" :closable="false" :show-icon="true" title="未获取到可选办理人。" />
        <p class="flow-append-user__dialog-tip">最少 {{ addDialog.minNum }} 人，最多 {{ addDialog.maxNum }} 人</p>
      </div>
      <template #footer>
        <RendererButton label="取消" :disabled="addDialog.submitting" @click="resetAddDialog" />
        <RendererButton label="确认" button-type="primary" :disabled="addDialog.submitting" @click="submitAddDialog" />
      </template>
    </RendererDialog>
  </RendererSection>
</template>

<script setup lang="ts">
import {DisplayAlert, RendererButton, RendererDialog, RendererSection} from '@spark-appworks/spark-component'
import type {FlowAppendUserContext} from '@/lowcode/resources/system/workflow/manage'
import {useFlowAppendUser} from './use-flow-append-user'

const props = withDefaults(defineProps<{
  context: FlowAppendUserContext
  embedded?: boolean
  userDirectoryViewKey?: string
}>(), {embedded: false})

const {
  embedded,
  contextTitle,
  pageLoading,
  pageError,
  appendList,
  revokeRowId,
  addDialog,
  selectOptions,
  canRevoke,
  openAddDialog,
  submitAddDialog,
  resetAddDialog,
  revokeRecord,
  loadPageData,
} = useFlowAppendUser({
  context: () => props.context,
  embedded: () => props.embedded,
  ...(props.userDirectoryViewKey ? {userDirectoryViewKey: () => props.userDirectoryViewKey} : {}),
})

</script>

<style scoped>
.flow-append-user--embedded :deep(.renderer-section__header) {
  flex-wrap: wrap;
  gap: 8px;
}
.flow-append-user__node {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-right: 12px;
}
.flow-append-user__node-label {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.flow-append-user__node-value {
  font-weight: 600;
}
.flow-append-user__node-title {
  margin: 0 0 8px;
  font-weight: 600;
}
.flow-append-user__dialog-body {
  min-height: 120px;
}
.flow-append-user__user-select {
  width: 100%;
}
.flow-append-user__dialog-tip {
  margin: 12px 0 0;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
</style>