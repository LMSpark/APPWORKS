<!--
@module app:views/features/application/enterprise-app-auth-application/ui/apply-app-auth-page
职责：保留申请应用授权的正式独立路由。
边界：复用内嵌入口的申请工具和运行时装配，每次调用独立加载正式视图。
AI用途：接续申请交付时保留原路由并在共用申请宿主核对数据合同。
-->
<template>
  <RendererSection class="apply-app-auth-page" title="申请应用授权" :bordered="false" :grid-columns="1">
    <ApplyAppAuthContent />
  </RendererSection>
</template>

<script setup lang="ts">
import {RendererSection} from '@spark-appworks/spark-component'
import ApplyAppAuthContent from './apply-app-auth-content.vue'
</script>

<style scoped>
.apply-app-auth-page {padding: 24px}
</style>
