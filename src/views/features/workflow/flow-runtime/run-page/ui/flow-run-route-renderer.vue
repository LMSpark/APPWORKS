<!--
@module app:views/features/workflow/flow-runtime/run-page/ui/flow-run-route-renderer
职责：在办理页内按已解析路由挂载业务 Vue 页，并向注册表暴露 flowSubmit* 回调。
-->
<template>
  <div class="flow-run-route-renderer">
    <DisplayAlert v-if="renderError" alert-type="error" :closable="false" :show-icon="true" :title="renderError" />
    <div v-else-if="!businessComponent" class="flow-run-route-renderer__loading">业务页面加载中…</div>
    <component :is="businessComponent" v-else v-bind="routeProps" :key="cacheKey" @vue:mounted="syncExpose" @vue:unmounted="() => registry.set(tabKey, null)" />
  </div>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, provide, ref, shallowReactive, shallowRef, watch, type Component} from 'vue'
import {DisplayAlert} from '@spark-appworks/spark-component'
import {isRecord} from '@spark-appworks/spark-utils'
import {loadRouteLocation, routeLocationKey, type RouteLocationResolved} from 'vue-router'
import type {FlowRunBusinessPageExpose} from '../model/flow-run-business-tab'

const props = defineProps<{
  route: RouteLocationResolved
  cacheKey: string
  tabKey: string
  registry: {set: (key: string, value: FlowRunBusinessPageExpose | null) => void}
  fallbackProps?: Readonly<Record<string, unknown>>
}>()

const businessComponent = shallowRef<Component | null>(null)
// Embedded business pages consume their own route rather than the outer workflow route.
const embeddedRoute = shallowReactive({...props.route, name: props.route.name ?? undefined})
provide(routeLocationKey, embeddedRoute)
const renderError = ref('')
let loadVersion = 0

function readExposeCarrier(instance: unknown): FlowRunBusinessPageExpose | null {
  if (!isRecord(instance)) return null
  const exposed = instance['exposed']
  if (isRecord(exposed)) return exposed
  const proxy = instance['proxy']
  if (isRecord(proxy)) return proxy
  return null
}

function syncExpose(instance: unknown): void {
  const component = isRecord(instance) ? instance['component'] : null
  props.registry.set(props.tabKey, readExposeCarrier(component))
}

const routeProps = computed(() => {
  const query = isRecord(props.route.query) ? props.route.query : {}
  const normalized: Record<string, string> = {}
  for (const [key, value] of Object.entries(query)) {
    normalized[key] = Array.isArray(value) ? String(value[0] ?? '') : String(value ?? '')
  }
  return {...(props.fallbackProps ?? {}), ...normalized}
})

watch(() => props.route, async route => {
  Object.assign(embeddedRoute, route, {name: route.name ?? undefined})
  const version = ++loadVersion
  businessComponent.value = null
  renderError.value = ''
  props.registry.set(props.tabKey, null)
  try {
    const loaded = await loadRouteLocation(route)
    if (version !== loadVersion) return
    const matched = loaded.matched.at(-1)
    let record = matched?.components?.['default']
    if (!record && matched && isRecord(matched)) {
      const legacy = matched['component']
      if (legacy) record = legacy
    }
    if (!record) {
      renderError.value = '业务页面组件解析失败'
      return
    }
    businessComponent.value = record
  } catch (error) {
    if (version !== loadVersion) return
    renderError.value = error instanceof Error ? error.message : '加载业务页面失败'
  }
}, {immediate: true})

onBeforeUnmount(() => {
  loadVersion += 1
  props.registry.set(props.tabKey, null)
})
</script>

<style scoped>
.flow-run-route-renderer {min-height: 240px}
.flow-run-route-renderer__loading {padding: 24px; color: var(--el-text-color-secondary)}
</style>
