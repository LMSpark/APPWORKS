/**
 * @module app:views/features/shared/runtime/use-feature-page-runtime
 * 职责：按导航身份装配单数据空间功能页的正式运行实例并加载主视图。
 * 边界：校验导航身份并释放过期实例，不承载页面字段或业务数据副本。
 * AI用途：原生功能页以一个主模型视图为入口时复用；navigationId 允许页面以独立导航身份消费其他空间。
 */
import {computed, onBeforeUnmount, ref, watch} from 'vue'
import {useRoute} from 'vue-router'
import {NativePageRuntimeSession} from '@spark-appworks/spark-app'
import {buildDataViewKey} from '@spark-appworks/spark-data'
import {PAGE_RUNTIME, useSparkComponent} from '@spark-appworks/spark-component'
import {loadLowcodeRuntimeScenario} from '@/lowcode/data-space/lowcode-data-space-runtime'
import {parseApplicationPathScope} from '@/services/application-scope'

/** 一个原生功能页的正式数据身份及组件上下文。 */
type FeaturePageRuntimeOptions = Readonly<{
  /** 本页消费的正式数据空间身份。 */
  scenarioId: string
  /** 页面导航节点及其蓝图场景身份；省略时页面与数据空间同一身份。 */
  navigationId?: string
  /** 主视图所属的正式模型名称，而非物理来源别名。 */
  modelName: string
  /** 本页能力树节点类型，不作为数据身份。 */
  componentType: string
  /** 用于入口及主视图诊断的页面名称。 */
  title: string
  /** 与主视图同批读取 default 视图的选项模型；任一失败即入口失败，不使用旧候选。 */
  optionModels?: readonly string[]
}>

/** 当前应用作用域内加载主视图，切换或卸载时撤销原实例。 */
export function useFeaturePageRuntime(options: FeaturePageRuntimeOptions) {
  const {scenarioId, modelName, componentType, title} = options
  const navigationId = options.navigationId ?? scenarioId
  const viewKey = buildDataViewKey(modelName, 'default', scenarioId)
  const route = useRoute()
  const {sparkProvide, sparkRemove} = useSparkComponent({type: componentType})
  const session = new NativePageRuntimeSession({
    provide: () => undefined,
    remove: () => sparkRemove(PAGE_RUNTIME),
  })
  const ready = ref(false), loading = ref(false), error = ref('')
  const target = computed(() => ({
    projectId: parseApplicationPathScope(route.path)?.projectId,
    scenario: route.meta['blueprintScenarioId'],
    nodeId: route.meta['nodeId'],
    state: route.meta['systemPageIdentityState'],
  }))
  let active = true, generation = 0
  const isCurrent = (runtime: ReturnType<NativePageRuntimeSession['acquire']>, own: number) =>
    active && own === generation && session.isCurrent(runtime)

  async function loadCurrentRoute(): Promise<void> {
    const {projectId, scenario, nodeId, state} = target.value
    const own = ++generation
    ready.value = false; loading.value = true; error.value = ''; session.dispose()
    let current: ReturnType<NativePageRuntimeSession['acquire']> | undefined
    try {
      if (!projectId || scenario !== scenarioId || nodeId !== navigationId || state !== 'resolved') {
        throw new Error(`${title}入口缺少正式导航身份或数据空间绑定`)
      }
      current = session.acquire({
        pageId: nodeId,
        scenarioIds: [scenarioId],
        targetId: `${projectId}:${nodeId}`,
        loadScenario: id => loadLowcodeRuntimeScenario({projectId, scenarioId: id}),
      })
      await current.load()
      if (!isCurrent(current, own)) return
      const view = current.getDataSet(scenarioId)?.getView(modelName, 'default')
      if (!view) throw new Error(`${title}缺少正式${modelName}视图`)
      const dataSet = current.getDataSet(scenarioId)
      const views = [view, ...(options.optionModels ?? []).map(name => {
        const option = dataSet?.getView(name, 'default')
        if (!option) throw new Error(`${title}缺少正式${name}选项视图`)
        return option
      })]
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
  onBeforeUnmount(() => {active = false; generation++; session.dispose()})
  return {viewKey, session, ready, loading, error, loadCurrentRoute}
}
