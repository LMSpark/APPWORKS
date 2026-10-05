<template>
  <section class="stage-pane">
    <el-form label-width="110px">
      <el-form-item label="数据空间"><el-input v-model="form.formKey" placeholder="选择或输入现有 DataSpace FormKey" /></el-form-item>
      <el-form-item label="配置类型"><el-input v-model="form.dataSpaceType" placeholder="DataSpace 类型" /></el-form-item>
    </el-form>
    <div class="stage-actions"><el-button type="primary" :loading="saving" @click="$emit('save')">保存数据规划</el-button></div>
  </section>
</template>

<script setup lang="ts">
defineProps<{ form: { formKey: string; dataSpaceType: string }; saving: boolean }>()
defineEmits<{ save: [] }>()
</script>

