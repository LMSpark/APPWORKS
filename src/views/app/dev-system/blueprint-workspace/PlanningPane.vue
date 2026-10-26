<!--
@module app:views/app/dev-system/blueprint-workspace/PlanningPane
职责：编辑当前能力功能策划说明。
边界：只编辑传入文本并发出保存动作，不自行构造蓝图节点或IO。
AI用途：为正式节点补充能力说明并提交父工作台保存。
-->
<template>
  <section class="stage-pane">
    <FieldHtmlEditor v-if="fieldAccess.read" v-model="model" label="功能策划" :rows="16" :readonly="!fieldAccess.write" />
    <el-alert v-else title="当前查询没有返回该字段或读取权限" type="warning" :closable="false" />
    <div class="stage-actions"><el-button type="primary" :loading="saving" :disabled="!fieldAccess.write" @click="$emit('save')">保存节点修改</el-button></div>
  </section>
</template>

<script setup lang="ts">
import { FieldHtmlEditor } from '@spark-appworks/spark-component'
defineProps<{ saving: boolean; fieldAccess: {read: boolean; write: boolean} }>()
defineEmits<{ save: [] }>()
const model = defineModel<string>({ required: true })
</script>

