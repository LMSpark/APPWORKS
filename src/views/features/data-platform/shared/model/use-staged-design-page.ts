/**
 * @module app:views/features/data-platform/shared/model/use-staged-design-page
 * 编辑器页共用：PageRuntime + 设计 file DataView（refresh/saveChanges），页面不直连 HTTP。
 */
import {computed, onBeforeUnmount, ref, shallowRef, watch, type ComputedRef} from 'vue'
import type {DataSet, DataView} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {PAGE_RUNTIME, useSparkComponent} from '@spark-appworks/spark-component'
import {useSystemPageDirtySource} from '@spark-appworks/spark-app'
import {setDesignScopeValue} from '@/lowcode/resources/repository/staged-design-file-view'

export type StagedDesignPageConfig = Readonly<{
  pageId: string
  scenarioId: ComputedRef<string>
  scopeId: ComputedRef<string | undefined>
  scopeInputTable: string
  scopeField: string
  designViewTable: string
  loadDataSets: (input: Readonly<{scenarioId: string; scopeId: string}>) => Promise<readonly DataSet[]>
  missingScopeMessage: string
}>

export function useStagedDesignPage(config: StagedDesignPageConfig) {
  const {sparkProvide, sparkRemove} = useSparkComponent({type: config.pageId})
  const runtime = shallowRef<PageRuntime>()
  const loading = ref(false), ready = ref(false), busy = ref(false), error = ref('')
  let generation = 0, active = true
  const loadedScenario = ref(''), boundScope = ref('')
  const isCurrent = (own: number): boolean => active && own === generation

  function currentDataSet(): DataSet | undefined {
    const scenario = loadedScenario.value
    return scenario ? runtime.value?.getDataSet(scenario) : undefined
  }

  const ownedView = (): DataView | undefined => currentDataSet()?.getView(config.designViewTable, 'default')
  const designView = computed(() => {
    if (!ready.value || loading.value || loadedScenario.value !== config.scenarioId.value || boundScope.value !== config.scopeId.value?.trim()) return undefined
    const view = ownedView()
    return view?.loadingError ? undefined : view
  })
  const designError = computed(() => {loading.value; ready.value; return ownedView()?.loadingError?.message ?? ''})

  function hasPending(): boolean {
    const current = runtime.value
    return !!current && (current.isDirty || current.call.scenarioIds.some(id => {
      const ds = current.getDataSet(id)
      return ds && Object.values(ds.tables).some(table => Object.values(table.views).some(view => view.hasUnconfirmedSave || view.mutating))
    }))
  }
  useSystemPageDirtySource({get isDirty() {return loading.value || busy.value || hasPending()}})

  async function refreshDesign(options: Readonly<{discardChanges?: boolean}> = {}): Promise<void> {
    const scope = config.scopeId.value?.trim()
    const ds = currentDataSet()
    if (!active || !ds || !scope || loadedScenario.value !== config.scenarioId.value || busy.value) {
      error.value = !scope ? config.missingScopeMessage : '设计目标已变化或操作尚未完成'
      return
    }
    if (options.discardChanges) {
      try {
        const view = designView.value
        if (!view) throw new Error('设计目标已变化或尚未读取完成')
        if (view.hasUnconfirmedSave) throw new Error('设计保存结果尚未确认，请通过原保存入口核验')
        view.discardPendingChanges()
      } catch (cause) {error.value = cause instanceof Error ? cause.message : String(cause); return}
    }
    const own = ++generation
    loading.value = true; ready.value = false; error.value = ''
    try {await readDesign({dataSet: ds, scope, generation: own}); if (isCurrent(own)) ready.value = true}
    catch (cause) {if (isCurrent(own)) {
      error.value = cause instanceof Error ? cause.message : String(cause)
      ready.value = boundScope.value === scope && (hasPending() || !!ownedView()?.loadingError)
    }}
    finally {if (isCurrent(own)) loading.value = false}
  }

  async function readDesign(input: {dataSet: DataSet; scope: string; generation: number}): Promise<void> {
    const view = input.dataSet.getView(config.designViewTable, 'default')
    if (!view) throw new Error('设计视图缺失')
    view.assertResultReplacementAllowed()
    setDesignScopeValue({dataSet: input.dataSet, tableName: config.scopeInputTable, field: config.scopeField, scopeId: input.scope})
    boundScope.value = input.scope
    await view.refresh()
    if (!isCurrent(input.generation)) return
    if (view.loadingError) throw view.loadingError
  }

  watch([config.scenarioId, config.scopeId], async ([scenario, requestedScope]) => {
    const own = ++generation
    ready.value = false; loading.value = true; error.value = ''
    try {
      if (!scenario) throw new Error('缺少导航绑定的数据空间ID')
      const scope = requestedScope?.trim()
      if (!scope) throw new Error(config.missingScopeMessage)
      if (busy.value) throw new Error('设计保存尚未完成，请返回原目标核验')
      if (loadedScenario.value !== scenario || !runtime.value || boundScope.value !== scope && !hasPending()) {
        if (hasPending()) throw new Error('原设计仍有未保存修改或待核验提交，请返回原目标处理')
        sparkRemove(PAGE_RUNTIME); runtime.value?.dispose(); runtime.value = undefined
        loadedScenario.value = ''; boundScope.value = ''
        const loaded = await config.loadDataSets({scenarioId: scenario, scopeId: scope})
        if (!isCurrent(own)) {loaded.forEach(ds => ds.destroy()); return}
        if (!loaded.some(ds => ds.scenarioId === scenario)) {loaded.forEach(ds => ds.destroy()); throw new Error('设计工作区缺少主空间')}
        const ids = loaded.map(ds => ds.scenarioId).filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
        if (ids.length !== loaded.length || new Set(ids).size !== ids.length) {loaded.forEach(ds => ds.destroy()); throw new Error('设计工作区空间身份缺失或重复')}
        const next = new PageRuntime({pageId: config.pageId, scenarioIds: ids, loadScenario: id => {
          const ds = loaded.find(value => value.scenarioId === id)
          if (!ds) throw new Error('设计工作区空间未装配')
          return Promise.resolve(ds)
        }})
        await next.load()
        if (!isCurrent(own)) {next.dispose(); return}
        runtime.value = next; loadedScenario.value = scenario
        sparkProvide(PAGE_RUNTIME, next)
      }
      if (hasPending()) {
        if (boundScope.value !== scope) throw new Error('原设计仍有未保存修改或待核验提交，请返回原目标处理')
      } else {
        const ds = currentDataSet()
        if (!ds) throw new Error('设计数据空间缺失')
        await readDesign({dataSet: ds, scope, generation: own})
      }
      if (isCurrent(own)) ready.value = true
    } catch (cause) {
      if (isCurrent(own)) {
        error.value = cause instanceof Error ? cause.message : String(cause)
        ready.value = loadedScenario.value === scenario && boundScope.value === requestedScope?.trim() && !!ownedView()?.loadingError
      }
    } finally {
      if (isCurrent(own)) loading.value = false
    }
  }, {immediate: true})

  onBeforeUnmount(() => {
    active = false; generation++
    sparkRemove(PAGE_RUNTIME); runtime.value?.dispose()
  })

  async function saveChanges(options: Readonly<{viewKey?: string; ids?: ReadonlyArray<string | number>}> = {}): Promise<void> {
    const view = options.viewKey ? runtime.value?.resolveView(options.viewKey) : designView.value
    const ds = view?.dataSet
    if (!active || !ds || !ready.value || loading.value || loadedScenario.value !== config.scenarioId.value
      || boundScope.value !== config.scopeId.value?.trim() || busy.value) return
    const own = generation
    busy.value = true; error.value = ''
    try {
      const result = await ds.saveChanges({views: [{tableName: view.tableName, viewId: view.viewId,
        ...(options.ids ? {ids: [...options.ids]} : {})}]})
      if (!result.success) throw new Error(result.message ?? '保存失败')
    } catch (cause) {if (isCurrent(own)) error.value = cause instanceof Error ? cause.message : String(cause)}
    finally {busy.value = false}
  }

  function updateDesignField(view: DataView | undefined, field: string, value: unknown): void {
    if (!active || !view || view !== designView.value || busy.value) {error.value = '设计目标已变化或尚未读取完成'; return}
    const row = view.rows[0]
    const pk = view.primaryKey
    if (!row || !pk) return
    const rowId = row[pk]
    if (typeof rowId !== 'string' && typeof rowId !== 'number') return
    void view.editRowById(rowId, {[field]: value})
  }

  return {runtime, designView, designError, loading, ready, busy, error, saveChanges, refreshDesign, updateDesignField}
}
