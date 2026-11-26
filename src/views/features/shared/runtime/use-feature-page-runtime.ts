/**
 * @module app:views/features/shared/runtime/use-feature-page-runtime
 * 职责：按导航身份装配功能页的正式运行实例并加载主视图；可在同一实例内一并装配伙伴数据空间。
 * 边界：校验导航身份并释放过期实例，不承载页面字段或业务数据副本；主场景始终是 scenarioId。
 * AI用途：原生功能页以一个主模型视图为入口时复用；navigationId 允许页面以独立导航身份消费其他空间。
 */
import {computed, onBeforeUnmount, ref, toValue, watch, type MaybeRefOrGetter, type Ref} from 'vue'
import {useRoute} from 'vue-router'
import type {PageTool} from '@spark-appworks/spark-project-model'
import {NativePageRuntimeSession} from '@spark-appworks/spark-app'
import {buildDataViewKey} from '@spark-appworks/spark-data'
import {PAGE_RUNTIME, useSparkComponent} from '@spark-appworks/spark-component'
import {loadLowcodeRuntimeScenario} from '@/platform-adapters/data-space/lowcode-data-space-runtime'
import {resolveExecutionProjectId} from '@/services/application-scope'

/** 一个原生功能页的正式数据身份及组件上下文。 */
type FeaturePageRuntimeOptions = Readonly<{
  /** 本页消费的正式数据空间身份。 */
  scenarioId: string
  /** 正式工具定义；与主场景共用同一运行实例。 */
  tool?: PageTool | ((navigationId: string) => PageTool)
  /** 页面导航节点及其蓝图场景身份；省略时页面与数据空间同一身份。 */
  navigationId?: string
  /** 主视图所属的正式模型名称，而非物理来源别名。 */
  modelName: MaybeRefOrGetter<string>
  /** 主视图命名键；默认 default。 */
  viewId?: MaybeRefOrGetter<string>
  /** 本页能力树节点类型，不作为数据身份。 */
  componentType: string
  /** 用于入口及主视图诊断的页面名称。 */
  title: string
  /** 与主视图同批读取 default 视图的选项模型；任一失败即入口失败，不使用旧候选。 */
  optionModels?: readonly string[]
  /** 同一运行实例一并装配的其他正式数据空间，组件以完整视图键消费；不改变主场景。 */
  peerScenarioIds?: readonly string[]
  /** 与主视图同批读取的完整视图键（可属伙伴空间）；任一失败即入口失败。 */
  optionViews?: readonly string[]
  /** 主视图及各选项视图首次查询前写入的查询参数；每次装配时取值，抛错即入口失败。 */
  queryContext?: () => Readonly<Record<string, string>>
  /** 当前实例仍持有未完成的业务操作时，暂停替换运行实例。 */
  preserveRuntime?: () => boolean
}>

/** 在路由的执行作用域（应用或目录）内加载主视图，切换或卸载时撤销原实例。 */
export function useFeaturePageRuntime(options: FeaturePageRuntimeOptions) {
  const {scenarioId, componentType, title} = options
  const resolveViewKey = () => buildDataViewKey(
    toValue(options.modelName),
    toValue(options.viewId ?? 'default'),
    scenarioId,
  )
  const viewKey: Ref<string> = ref(resolveViewKey())
  const peers = options.peerScenarioIds ?? []
  const route = useRoute()
  const {sparkProvide, sparkRemove} = useSparkComponent({type: componentType})
  const session = new NativePageRuntimeSession({
    provide: () => undefined,
    remove: () => sparkRemove(PAGE_RUNTIME),
  })
  const ready = ref(false), loading = ref(false), error = ref('')
  const reloadBlocked = ref(false)
  const target = computed(() => ({
    projectId: resolveExecutionProjectId(route.path),
    scenario: route.meta['blueprintScenarioId'],
    nodeId: route.meta['nodeId'],
    state: route.meta['systemPageIdentityState'],
  }))
  let active = true, generation = 0
  const isCurrent = (runtime: ReturnType<NativePageRuntimeSession['acquire']>, own: number) =>
    active && own === generation && session.isCurrent(runtime)

  async function loadCurrentRoute(): Promise<void> {
    if (session.runtime && options.preserveRuntime?.()) {
      reloadBlocked.value = true
      return
    }
    reloadBlocked.value = false
    const {projectId, nodeId: nodeIdRaw, state} = target.value
    const nodeId = typeof nodeIdRaw === 'string' ? nodeIdRaw.trim() : ''
    const own = ++generation
    ready.value = false; loading.value = true; error.value = ''; session.dispose()
    let current: ReturnType<NativePageRuntimeSession['acquire']> | undefined
    try {
      const navigationId = options.navigationId ?? nodeId
      if (!projectId || !nodeId || nodeId !== navigationId || state !== 'resolved') {
        throw new Error(`${title}入口缺少正式导航身份或数据空间绑定`)
      }
      if (peers.some(peer => !peer || peer === scenarioId) || new Set(peers).size !== peers.length) {
        throw new Error(`${title}伙伴数据空间身份无效或重复`)
      }
      const context = options.queryContext?.()
      const tool = typeof options.tool === 'function' ? options.tool(nodeId) : options.tool
      current = session.acquire({
        ...(tool ? {tool} : {pageId:nodeId}),
        scenarioIds: [scenarioId, ...peers],
        ...(peers.length > 0 ? {mainScenarioId: scenarioId} : {}),
        targetId: `${projectId}:${nodeId}`,
        loadScenario: id => loadLowcodeRuntimeScenario({projectId, scenarioId: id}),
      })
      await current.load()
      if (!isCurrent(current, own)) return
      const modelName = toValue(options.modelName)
      const viewId = toValue(options.viewId ?? 'default')
      const view = current.resolveView(buildDataViewKey(modelName, viewId, scenarioId))
      if (!view) throw new Error(`${title}缺少正式${modelName}@${viewId}视图`)
      const runtime = current
      const views = [view, ...(options.optionModels ?? []).map(name => {
        const option = runtime.resolveView(buildDataViewKey(name, 'default', scenarioId))
        if (!option) throw new Error(`${title}缺少正式${name}选项视图`)
        return option
      }), ...(options.optionViews ?? []).map(key => {
        const option = runtime.resolveView(key)
        if (!option) throw new Error(`${title}缺少正式选项视图 ${key}`)
        return option
      })]
      if (context) for (const item of views) item.queryContext = {...item.queryContext, ...context}
      await Promise.all(views.map(item => item.refresh()))
      const failed = views.find(item => item.loadingError)
      if (failed?.loadingError) throw failed.loadingError
      if (!isCurrent(current, own)) return
      sparkProvide(PAGE_RUNTIME, current)
      ready.value = true
    } catch (cause) {
      if (current && session.isCurrent(current)) session.dispose()
      if (active && own === generation) error.value = cause instanceof Error ? cause.message : String(cause)
    } finally {
      if (active && own === generation) loading.value = false
    }
  }

  watch(target, loadCurrentRoute, {immediate: true})
  watch(
    () => [toValue(options.modelName), toValue(options.viewId ?? 'default')] as const,
    (next, prev) => {
      viewKey.value = buildDataViewKey(next[0], next[1], scenarioId)
      if (prev[0] !== next[0] || prev[1] !== next[1]) void loadCurrentRoute()
    },
  )
  onBeforeUnmount(() => {active = false; generation++; session.dispose()})
  return {viewKey, session, ready, loading, error, reloadBlocked, loadCurrentRoute}
}
