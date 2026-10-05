<template>
  <section class="stage-pane">
    <el-form label-width="110px">
      <el-form-item label="导航可见"><el-switch v-model="form.visible" /></el-form-item>
      <el-form-item label="导航类型"><el-input-number v-model="form.navigationType" :min="0" /></el-form-item>
      <el-form-item label="运行资源"><el-input :model-value="runtimeSummary" disabled /></el-form-item>
    </el-form>
    <div class="stage-actions"><el-button type="primary" :loading="saving" @click="$emit('save')">保存发布配置</el-button></div>
  </section>
</template>

<script setup lang="ts">
defineProps<{ form: { visible: boolean; navigationType: number }; runtimeSummary: string; saving: boolean }>()
defineEmits<{ save: [] }>()
</script>

