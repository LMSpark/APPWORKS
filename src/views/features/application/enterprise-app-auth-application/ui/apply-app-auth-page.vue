<!--
@module app:views/features/application/enterprise-app-auth-application/ui/apply-app-auth-page
职责：申请应用授权的独立路由；借“我的申请”导航身份，在同一运行实例装配 0221 与 C06D 场景后承载申请内容。
边界：主场景 47DA 只用于导航身份校验与装配；已发布应用列表经 C06D 应用主表视图，新增申请经 0221 视图完成。
-->
<template>
  <RendererSection class="apply-app-auth-page" title="申请应用授权" :bordered="false" :grid-columns="1">
    <p v-if="loading" role="status">正在装配申请应用授权…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <RendererButton v-if="error && !loading && !ready" label="重试" @click="loadCurrentRoute" />
    <ApplyAppAuthContent v-if="ready" />
  </RendererSection>
</template>

<script setup lang="ts">
import {RendererButton, RendererSection} from '@spark-appworks/spark-component'
import {useFeaturePageRuntime} from '@/views/features/shared/runtime/use-feature-page-runtime'
import {APP_AUTH_SCENARIOS, readAppAuthSession} from '../model/enterprise-app-auth-application-model'
import ApplyAppAuthContent from './apply-app-auth-content.vue'

const {ready, loading, error, loadCurrentRoute} = useFeaturePageRuntime({
  scenarioId: APP_AUTH_SCENARIOS.myRequests, modelName: 'enterprise_app_auth', componentType: 'apply-app-auth-page', title: '申请应用授权',
  peerScenarioIds: [APP_AUTH_SCENARIOS.apply, APP_AUTH_SCENARIOS.review], queryContext: () => ({entShortName: readAppAuthSession().entShortName}),
})
</script>

<style scoped>
.apply-app-auth-page {padding: 24px}
</style>
