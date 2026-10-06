<!--
@module app:views/app/dev-system/blueprint-workspace/PrototypePane
职责：编辑当前节点原型HTML说明。
边界：原型归prototype分组，不作为PageTool运行规则。
AI用途：编辑原型说明并提交父工作台真实保存。
-->
<template>
  <section class="stage-pane">
    <FieldHtmlEditor v-model="model" label="原型设计" :rows="16" />
    <div class="stage-actions"><el-button type="primary" :loading="saving" @click="$emit('save')">保存原型</el-button></div>
  </section>
</template>

<script setup lang="ts">
import { FieldHtmlEditor } from '@spark-appworks/spark-component'
defineProps<{ saving: boolean }>()
defineEmits<{ save: [] }>()
const model = defineModel<string>({ required: true })
</script>

