<!--
@module app:views/app/demo/TemplateDslDemo
职责：提供主应用 TemplateDslDemo 能力，围绕 模块入口、副作用注册或内部组合逻辑 连接视图、服务、布局、路由或平台租户流程。
边界：只处理 app 层编排和 UI 入口，不定义底层包的核心协议，也不绕过配置真源。
AI用途：需要理解应用入口、平台视图或业务服务接线时，用本模块定位 views/app/demo/TemplateDslDemo。
-->
<template>
  <section class="template-dsl-demo">
    <el-card shadow="never" class="template-dsl-demo__card">
      <template #header>
        <div class="template-dsl-demo__header">
          <h2>Template DSL Demo</h2>
          <el-tag type="info">system-page</el-tag>
        </div>
      </template>

      <p>该页面用于承接导航中的 <code>/demo/template-dsl</code> system-page 路由。</p>
      <p>当前为占位实现，避免未注册 system-page 触发动态路由告警。</p>
    </el-card>
  </section>
</template>

<script setup lang="ts">
/**
 * @description Template DSL demo placeholder; 仅用于路由占位和开发演示，不进入运行时组件扫描。
 */
defineOptions({ name: 'TemplateDslDemo' })
</script>

<style scoped>
.template-dsl-demo {
  padding: 20px;
}

.template-dsl-demo__card {
  max-width: 840px;
}

.template-dsl-demo__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.template-dsl-demo__header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.template-dsl-demo p {
  margin: 0 0 8px;
  line-height: 1.7;
}
</style>
