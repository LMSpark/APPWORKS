<!--
@module app:views/features/workflow/flow-workbench/ui/flow-workbench-todo-panel
职责：工作台待办列表面板占位（参考 packages/ui 路径未在 1147b00 的 appworks 出现）。
-->
<template>
  <RendererSection title="流程待办" :bordered="true" :grid-columns="1">
    <DisplayAlert alert-type="info" :closable="false" title="待办面板待 FlowWorkbench 合同与宿主接线。" />
  </RendererSection>
</template>

<script setup lang="ts">
import {DisplayAlert, RendererSection} from '@spark-appworks/spark-component'
</script>