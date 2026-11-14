<!--
@module app:views/features/workflow/flow-runtime/bus-detail/ui/bus-flow-detail-page
职责：业务表单驱动的流程详情页占位（参考 bus-flow-detail-page）。
-->
<template>
  <RendererSection title="业务流程详情" :bordered="false" :grid-columns="1">
    <DisplayAlert alert-type="info" :closable="false" title="业务流详情页待与 bus 表单宿主对齐后接回。" />
  </RendererSection>
</template>

<script setup lang="ts">
import {DisplayAlert, RendererSection} from '@spark-appworks/spark-component'
</script>