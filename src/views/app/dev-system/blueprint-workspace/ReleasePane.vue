<!--
@module app:views/app/dev-system/blueprint-workspace/ReleasePane
职责：编辑导航发布可见性和类型并展示运行资源摘要。
边界：运行资源只读投影，发布写入由父工作台真实API确认。
AI用途：设置正式节点导航发布参数并查看cfg或vue资源表面。
-->
<template>
  <section class="stage-pane">
    <el-form label-width="110px">
      <el-form-item v-if="visibilityAccess.read" label="导航可见"><el-switch v-model="form.visible" :disabled="!visibilityAccess.write" /></el-form-item>
      <el-form-item v-if="navigationAccess.read" label="导航类型"><el-input-number v-model="form.navigationType" :min="0" :disabled="!navigationAccess.write" /></el-form-item>
      <el-alert v-if="!visibilityAccess.read && !navigationAccess.read" title="当前查询未返回发布字段或读取权限" type="warning" :closable="false" />
      <el-form-item label="运行资源"><el-input :model-value="runtimeSummary" disabled /></el-form-item>
    </el-form>
    <div class="stage-actions"><el-button type="primary" :loading="saving" :disabled="!visibilityAccess.write && !navigationAccess.write" @click="$emit('save')">保存节点修改</el-button></div>
  </section>
</template>

<script setup lang="ts">
defineProps<{ form: { visible: boolean; navigationType: number }; runtimeSummary: string; saving: boolean; visibilityAccess: {read: boolean; write: boolean}; navigationAccess: {read: boolean; write: boolean} }>()
defineEmits<{ save: [] }>()
</script>

