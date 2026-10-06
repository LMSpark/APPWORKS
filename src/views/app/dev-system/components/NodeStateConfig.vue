<!--
@module app:views/app/dev-system/components/NodeStateConfig
职责：编辑正式导航发布、子项显示、分组和排序。
边界：状态写入navigation分组，业务kind不由显示状态推断。
AI用途：调整节点导航展示并经领域dirty与Workspace保存。
-->
<template>
  <div v-if="state.blueprintDraft.navigation">
    <el-divider content-position="left">导航显示</el-divider>
    <el-form-item label="发布到菜单"><el-switch v-model="state.blueprintDraft.navigation.publishInMenu" @change="state.markBlueprintDirty" /></el-form-item>
    <el-form-item label="显示子项"><el-switch v-model="state.blueprintDraft.navigation.showChildren" @change="state.markBlueprintDirty" /></el-form-item>
    <el-form-item label="开始分组"><el-switch v-model="state.blueprintDraft.navigation.beginGroup" @change="state.markBlueprintDirty" /></el-form-item>
    <el-form-item label="排序"><el-input-number v-model="state.blueprintDraft.navigation.order" @change="state.markBlueprintDirty" /></el-form-item>
  </div>
</template>
<script setup lang="ts">
import type { DevState } from '../useDevState'
defineProps<{ state: DevState }>()
</script>
