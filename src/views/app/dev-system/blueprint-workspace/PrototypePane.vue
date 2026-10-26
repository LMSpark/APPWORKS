<!--
@module app:views/app/dev-system/blueprint-workspace/PrototypePane
职责：编辑当前节点原型HTML说明。
边界：原型归prototype分组，不作为PageTool运行规则。
AI用途：编辑原型说明并提交父工作台真实保存。
-->
<template>
  <section class="stage-pane">
    <FieldHtmlEditor v-if="fieldAccess.read" v-model="model" label="原型设计" :rows="16" :readonly="!fieldAccess.write" />
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

