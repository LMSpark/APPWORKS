<!--
@module app:views/features/organization/job-management/ui/job-management-page
职责：展示当前租户岗位目录并提供查询、重置、刷新和分页。
边界：岗位及机构选项均读取正式 DataView，选项与主视图同批装配；不提供岗位编辑或跨租户切换。
AI用途：恢复岗位目录时，核对正式导航身份与机构选项绑定。
-->
<template>
  <RendererSection :title="ready ? '' : '岗位管理'" :bordered="false" :grid-columns="1" :grid-gap="12"
    :status="loading ? '正在读取岗位…' : ''" :error="error" :retryable="!loading && !ready" @retry="loadCurrentRoute">
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

const scenarioId = '0A835EB88AAC2BDFBDE344477C6827BB'
const tool = new PageTool({pageId: scenarioId})
tool.hydrateFileText('rule.json', rule)
tool.hydrateFileText('script.js', script)
tool.hydrateFileText('style.css', style)
tool.markLoaded()
const {session, ready, loading, error, loadCurrentRoute} = useFeaturePageRuntime({
  scenarioId, modelName: 'Base_JobInfo', componentType: 'job-management-page', title: '岗位管理',
  optionModels: ['Base_DepartInfo'],
  tool,
})
const runtime = computed(() => ready.value ? session.runtime : undefined)
const route = useRoute()
const routeSnapshot = computed(() => {
  const {path, fullPath, name, params, query, hash} = route
  return {path, fullPath, name: name ?? null, params, query, hash}
})
</script>
