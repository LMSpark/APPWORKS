<!--
@module app:views/features/workflow/flow-runtime/detail/ui/flow-run-detail-step-table
职责：运行详情钻取弹窗内的步骤子集表格（内存行，不另开 DataView）。
-->
<template>
  <el-table :data="tableRows" border stripe height="380" row-key="rowid" empty-text="暂无步骤数据" class="flow-run-detail-step-table">
    <el-table-column prop="description" label="摘要" min-width="280" show-overflow-tooltip />
    <el-table-column prop="STARTTIME" label="开始时间" min-width="160" show-overflow-tooltip />
    <el-table-column prop="StepState" label="步骤状态" min-width="100" show-overflow-tooltip />
  </el-table>
</template>

<script setup lang="ts">
import {computed} from 'vue'

const props = defineProps<{rows: readonly Record<string, unknown>[]}>()
const tableRows = computed(() => [...props.rows])
</script>