<!--
@module app:layout/AppFooter
职责：提供主应用 AppFooter 能力，围绕 模块入口、副作用注册或内部组合逻辑 连接视图、服务、布局、路由或平台租户流程。
边界：只处理 app 层编排和 UI 入口，不定义底层包的核心协议，也不绕过配置真源。
AI用途：需要理解应用入口、平台视图或业务服务接线时，用本模块定位 layout/AppFooter。
-->
<template>
  <div class="app-footer">
    <slot>
      <span>{{ text }}</span>
    </slot>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  text?: string
}>(), {
  text: `© ${new Date().getFullYear()} SPARK AppWorks — SPARK 融合平台 · 应用工场`,
})
</script>

<style scoped>
.app-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}
</style>
