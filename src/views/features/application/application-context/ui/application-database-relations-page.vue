<!--
@module app:views/features/application/application-context/ui/application-database-relations-page
职责：关联数据库页外壳：装配93DF场景PageRuntime，确定目标应用身份后承载关联数据库内容。
边界：业务读写在 application-database-relations-content；本页只解析 sysid（应用管理携带或当前应用自身）并提供运行实例。
AI用途：导航直达关联数据库时定位本页；应用管理内以弹窗复用同一内容组件。
-->
<template>
  <RendererSection class="database-relations-page" title="关联数据库" :description="sysid" :bordered="false" :grid-columns="1">
    <p v-if="loading" role="status">正在读取数据库信息…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <RendererButton v-if="error && !loading && !ready" label="重试" @click="loadCurrentRoute" />
    <ApplicationDatabaseRelationsContent v-if="ready" :sysid="sysid" />
  </RendererSection>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useRoute} from 'vue-router'
import {RendererButton, RendererSection} from '@spark-appworks/spark-component'
import {useFeaturePageRuntime} from '@/views/features/shared/runtime/use-feature-page-runtime'
import {parseApplicationPathScope} from '@/services/application-scope'
import ApplicationDatabaseRelationsContent from './application-database-relations-content.vue'

const {ready, loading, error, loadCurrentRoute} = useFeaturePageRuntime({
  scenarioId: '93DF05182084B1F0E8DA7283E83BBE0C', modelName: '_base_dbInfo',
  componentType: 'application-database-relations-page', title: '关联数据库',
})
const route = useRoute()
/** 原页面由应用管理携带sysid进入；导航直达时管理当前应用自身的数据库关联。 */
const sysid = computed(() => {
  const query = route.query['sysid']
  return (typeof query === 'string' && query.trim()) || parseApplicationPathScope(route.path)?.projectId || ''
})
</script>

<style scoped>
.database-relations-page {padding: 24px}
</style>
