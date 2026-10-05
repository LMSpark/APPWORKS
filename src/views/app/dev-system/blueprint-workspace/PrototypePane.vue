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

