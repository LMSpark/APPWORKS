<!--
@module app:views/app/dev-system/blueprint-workspace/EstimatePane
职责：编辑当前节点估算与交付责任字段。
边界：仅发出保存动作，真实写入及节点身份校验由父工作台执行。
AI用途：维护节点工作量并按当前节点ID关联项目经理任务。
-->
<template>
  <section class="stage-pane">
    <el-form label-width="100px" class="estimate-grid">
      <el-form-item label="难度系数"><el-input-number v-model="form.difficultyFactor" :min="0" /></el-form-item>
      <el-form-item label="工时"><el-input-number v-model="form.manhour" :min="0" /></el-form-item>
      <el-form-item label="数量"><el-input-number v-model="form.quantity" :min="0" /></el-form-item>
      <el-form-item label="小计"><el-input-number v-model="form.sum" :min="0" /></el-form-item>
      <el-form-item label="合计"><el-input-number v-model="form.total" :min="0" /></el-form-item>
      <el-form-item label="负责人"><el-input v-model="form.personInCharge" /></el-form-item>
      <el-form-item label="状态"><el-input v-model="form.status" /></el-form-item>
    </el-form>
    <el-alert type="info" :closable="false" title="任务由项目经理侧管理，并以当前节点 ID 关联。" />
    <div class="stage-actions"><el-button type="primary" :loading="saving" @click="$emit('save')">保存节点估算</el-button></div>
  </section>
</template>

<script setup lang="ts">
defineProps<{ form: { difficultyFactor: number; manhour: number; quantity: number; sum: number; total: number; personInCharge: string; status: string }; saving: boolean }>()
defineEmits<{ save: [] }>()
</script>

