<!--
@module app:views/features/workflow/flow-append-user/ui/flow-append-user
职责：流程参与人追加窄组件占位，由运行页嵌入。
-->
<template>
  <RendererSection title="追加参与人" :bordered="true" :grid-columns="1">
    <DisplayAlert alert-type="warning" :closable="false" :show-icon="true" title="FlowAppendUser 专用命令尚未接回。" />
  </RendererSection>
</template>

<script setup lang="ts">
import {DisplayAlert, RendererSection} from '@spark-appworks/spark-component'
defineProps<{wfid?: string; stepId?: string}>()
</script>