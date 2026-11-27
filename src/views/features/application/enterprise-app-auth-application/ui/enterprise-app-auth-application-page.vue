<!--
@module app:views/features/application/enterprise-app-auth-application/ui/enterprise-app-auth-application-page
职责：以正式审核场景装配申请列表与审核工具。
边界：列表和审核编辑使用同一调用中的不同正式视图，保留原页面入口。
AI用途：变更审核页面时沿原生入口绑定已登记 C06D 场景，通过工具规则选择视图和页面交互。
-->
<template>
  <SparkPageRenderer v-if="rendererHost" :page-runtime="rendererHost.runtime" :route-snapshot="routeSnapshot" :host="rendererHost" :auto-load="false" />
  <RendererSection v-else title="申请列表" :bordered="false" :grid-columns="1">
    <p v-if="loading" role="status">正在读取申请列表…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <RendererButton v-if="error && !loading && !ready" label="重试" @click="loadCurrentRoute" />
  </RendererSection>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useRoute} from 'vue-router'
import {buildDataViewKey} from '@spark-appworks/spark-data'
import {PageTool} from '@spark-appworks/spark-project-model'
import {RendererButton, RendererSection, SparkPageRenderer, consumeRequiredPageService, useSparkComponent} from '@spark-appworks/spark-component'
import {useFeaturePageRuntime} from '@/views/features/shared/runtime/use-feature-page-runtime'
import {APP_AUTH_SCENARIOS, readAppAuthSession} from '../model/enterprise-app-auth-application-model'
import {createAppAuthReview} from './app-auth-review'
import rule from './review-tool/rule.json?raw'
import script from './review-tool/script.js?raw'
import style from './review-tool/style.css?raw'

const {sparkConsume} = useSparkComponent({type: 'enterprise-app-auth-application-page'})
const pageService = consumeRequiredPageService(sparkConsume, 'enterprise-app-auth-application-page')
const scenarioId = APP_AUTH_SCENARIOS.review
const modelName = 'enterprise_app_auth'
const byShortNameKey = buildDataViewKey('Base_Enterprise_Info', 'byShortName', scenarioId)
const auditKey = buildDataViewKey(modelName, 'audit', scenarioId)
const route = useRoute()
const routeSnapshot = computed(() => {
  const {path, fullPath, name, params, query, hash} = route
  return {path, fullPath, name: name ?? null, params, query, hash}
})
const {viewKey, session, ready, loading, error, loadCurrentRoute} = useFeaturePageRuntime({
  scenarioId, modelName, componentType: 'enterprise-app-auth-application-page', title: '申请列表',
  tool: pageId => {
    const tool = new PageTool({pageId})
    tool.hydrateFileText('rule.json', rule)
    tool.hydrateFileText('script.js', script)
    tool.hydrateFileText('style.css', style)
    tool.markLoaded()
    return tool
  },
  optionModels: ['Base_Enterprise_Info', 'Base_AppSystemList', 'app_auth_status'], optionViews: [byShortNameKey],
  queryContext: () => ({entShortName: readAppAuthSession().entShortName}),
})

const rendererHost = computed(() => {
  const runtime = ready.value ? session.runtime : undefined
  if (!runtime) return undefined
  const list = runtime.resolveView(viewKey.value)
  const audit = runtime.resolveView(auditKey)
  if (!list || !audit) throw new Error('申请审核缺少正式视图')
  const isCurrent = () => ready.value && session.isCurrent(runtime)
  const assertCurrent = () => {
    if (!isCurrent()) throw new Error('申请审核运行实例已失效')
  }
  const review = createAppAuthReview({list, audit, isCurrent, showSuccess: message => pageService.showMessage(message, 'success')})
  return {runtime, assertCurrent, invoke(command: string) {
    assertCurrent()
    return command === 'review.connect' ? review : undefined
  }}
})
</script>
