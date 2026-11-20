<!--
@module app:views/features/organization/user-management/ui/user-management-page
职责：展示当前租户人员任职目录并提供姓名、机构查询、重置、刷新和分页。
边界：人员及机构选项均读取机构空间正式 DataView，选项与主视图同批装配；不提供人员编辑或跨租户切换。
AI用途：恢复人员目录时，核对导航身份与所消费机构空间的绑定。
-->
<template>
  <RendererSection :title="ready ? '' : '人员管理'" :bordered="false" :grid-columns="1" :grid-gap="12"
    :status="loading ? '正在读取人员…' : ''" :error="error" :retryable="!loading && !ready" @retry="loadCurrentRoute">
    <SparkPageRenderer v-if="runtime" :page-runtime="runtime" :route-snapshot="routeSnapshot" :auto-load="false" />
  </RendererSection>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useRoute} from 'vue-router'
import {RendererSection, SparkPageRenderer} from '@spark-appworks/spark-component'
import {buildDataViewKey} from '@spark-appworks/spark-data'
import {PageTool} from '@spark-appworks/spark-project-model'
import {useFeaturePageRuntime} from '@/views/features/shared/runtime/use-feature-page-runtime'
import rule from './tool/rule.json?raw'
import script from './tool/script.js?raw'
import style from './tool/style.css?raw'

const navigationId = '1B7FD70E326717B8E4B611D0431FFCBA'
const scenarioId = '4138A7C47ECB96EA85CA61A8A8B7191F'
const tool = new PageTool({pageId: navigationId})
tool.hydrateFileText('rule.json', rule)
tool.hydrateFileText('script.js', script)
tool.hydrateFileText('style.css', style)
tool.markLoaded()
const {session, ready, loading, error, loadCurrentRoute} = useFeaturePageRuntime({
  navigationId, scenarioId, modelName: 'View_UserDJAndDepCSR', componentType: 'user-management-page', title: '人员管理',
  optionViews: [buildDataViewKey('Base_DepartInfo', 'options', scenarioId)],
  tool,
})
const runtime = computed(() => ready.value ? session.runtime : undefined)
const route = useRoute()
const routeSnapshot = computed(() => {
  const {path, fullPath, name, params, query, hash} = route
  return {path, fullPath, name: name ?? null, params, query, hash}
})
</script>
