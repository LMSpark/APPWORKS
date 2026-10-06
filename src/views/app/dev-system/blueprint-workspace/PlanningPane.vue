<!--
@module app:views/app/dev-system/blueprint-workspace/PlanningPane
职责：编辑当前能力功能策划说明。
边界：只编辑传入文本并发出保存动作，不自行构造蓝图节点或IO。
AI用途：为正式节点补充能力说明并提交父工作台保存。
-->
<template>
  <section class="stage-pane">
    <FieldHtmlEditor v-model="model" label="功能策划" :rows="16" />
    <div class="stage-actions"><el-button type="primary" :loading="saving" @click="$emit('save')">保存功能策划</el-button></div>
  </section>
</template>

<script setup lang="ts">
import { FieldHtmlEditor } from '@spark-appworks/spark-component'
defineProps<{ saving: boolean }>()
defineEmits<{ save: [] }>()
const model = defineModel<string>({ required: true })
</script>

