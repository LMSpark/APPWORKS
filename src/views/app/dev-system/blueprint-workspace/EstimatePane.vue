<!--
@module app:views/app/dev-system/blueprint-workspace/EstimatePane
职责：编辑当前节点估算与交付责任字段。
边界：仅发出保存动作，真实写入及节点身份校验由父工作台执行。
AI用途：维护节点工作量并按当前节点ID关联项目经理任务。
-->
<template>
  <section class="stage-pane">
    <el-alert v-if="!hasAnyReadableField" title="当前查询未返回估算字段或读取权限" type="warning" :closable="false" />
    <el-form label-width="100px" class="estimate-grid">
      <el-form-item v-if="fieldAccess.DifficultyFactor.read" label="难度系数"><el-input-number v-model="form.difficultyFactor" :min="0" :disabled="!fieldAccess.DifficultyFactor.write" /></el-form-item>
      <el-form-item v-if="fieldAccess.Manhour.read" label="工时"><el-input-number v-model="form.manhour" :min="0" :disabled="!fieldAccess.Manhour.write" /></el-form-item>
      <el-form-item v-if="fieldAccess.Number.read" label="数量"><el-input-number v-model="form.quantity" :min="0" :disabled="!fieldAccess.Number.write" /></el-form-item>
      <el-form-item v-if="fieldAccess.Sum.read" label="小计"><el-input-number v-model="form.sum" :min="0" :disabled="!fieldAccess.Sum.write" /></el-form-item>
      <el-form-item v-if="fieldAccess.Total.read" label="合计"><el-input-number v-model="form.total" :min="0" :disabled="!fieldAccess.Total.write" /></el-form-item>
      <el-form-item v-if="fieldAccess.personCharge.read" label="负责人"><el-input v-model="form.personInCharge" :disabled="!fieldAccess.personCharge.write" /></el-form-item>
      <el-form-item v-if="fieldAccess.status.read" label="状态"><el-input v-model="form.status" :disabled="!fieldAccess.status.write" /></el-form-item>
    </el-form>
    <el-alert type="info" :closable="false" title="任务由项目经理侧管理，并以当前节点 ID 关联。" />
    <div class="stage-actions"><el-button type="primary" :loading="saving" :disabled="!hasAnyWritableField" @click="$emit('save')">保存节点修改</el-button></div>
  </section>
</template>

<script setup lang="ts">
import {computed} from 'vue'
type Access = {read: boolean; write: boolean}
type EstimateAccess = {DifficultyFactor: Access; Manhour: Access; Number: Access; Sum: Access; Total: Access; personCharge: Access; status: Access}
const props = defineProps<{ form: { difficultyFactor: number; manhour: number; quantity: number; sum: number; total: number; personInCharge: string; status: string }; saving: boolean; fieldAccess: EstimateAccess }>()
const hasAnyReadableField = computed(() => Object.values(props.fieldAccess).some(access => access.read))
const hasAnyWritableField = computed(() => Object.values(props.fieldAccess).some(access => access.write))
defineEmits<{ save: [] }>()
</script>

