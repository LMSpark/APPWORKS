<!--
@module app:views/features/organization/organization-structure/ui/organization-structure-page
职责：展示当前租户机构目录并提供查询、重置、刷新和分页。
边界：只读取正式机构 DataView，不提供机构编辑或跨租户切换。
AI用途：恢复组织机构目录时，核对正式导航身份及只读数据绑定。
-->
<template>
  <RendererSection :title="ready ? '' : '机构管理'" :bordered="false" :grid-columns="1" :grid-gap="12"
    :status="loading ? '正在读取机构…' : ''" :error="error" :retryable="!loading && !ready" @retry="loadCurrentRoute">
    <SparkPageRenderer v-if="runtime" :page-runtime="runtime" :route-snapshot="routeSnapshot" :auto-load="false" />
  </RendererSection>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useRoute} from 'vue-router'
import {RendererSection, SparkPageRenderer} from '@spark-appworks/spark-component'
import {PageTool} from '@spark-appworks/spark-project-model'
import {useFeaturePageRuntime} from '@/views/features/shared/runtime/use-feature-page-runtime'
import rule from './tool/rule.json?raw'
import script from './tool/script.js?raw'
import style from './tool/style.css?raw'

const scenarioId = '4138A7C47ECB96EA85CA61A8A8B7191F'
const tool = new PageTool({pageId: scenarioId})
tool.hydrateFileText('rule.json', rule)
tool.hydrateFileText('script.js', script)
tool.hydrateFileText('style.css', style)
tool.markLoaded()
const {session, ready, loading, error, loadCurrentRoute} = useFeaturePageRuntime({
  scenarioId, modelName: 'Base_DepartInfo', componentType: 'organization-structure-page', title: '机构管理',
  tool,
})
const runtime = computed(() => ready.value ? session.runtime : undefined)
const route = useRoute()
const routeSnapshot = computed(() => {
  const {path, fullPath, name, params, query, hash} = route
  return {path, fullPath, name: name ?? null, params, query, hash}
})
</script>
