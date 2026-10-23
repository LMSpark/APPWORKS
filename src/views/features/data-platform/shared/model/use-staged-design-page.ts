/**
 * @module app:views/features/data-platform/shared/model/use-staged-design-page
 * 编辑器页共用：PageRuntime + 设计 file DataView（refresh/saveChanges），页面不直连 HTTP。
 */
import {computed, onBeforeUnmount, ref, shallowRef, watch, type ComputedRef} from 'vue'
import type {DataSet, DataView} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {PAGE_RUNTIME, useSparkComponent} from '@spark-appworks/spark-component'
import {setDesignScopeValue} from '@/lowcode/resources/shared/staged-design-file-view'

export type StagedDesignPageConfig = Readonly<{
  pageId: string
  scenarioId: ComputedRef<string>
  scopeId: ComputedRef<string | undefined>
  scopeInputTable: string
  scopeField: string
  designViewTable: string
  loadDataSet: (scenarioId: string) => Promise<DataSet>
  missingScopeMessage: string
}>

export function useStagedDesignPage(config: StagedDesignPageConfig) {
  const {sparkProvide, sparkRemove} = useSparkComponent({type: config.pageId})
  const runtime = shallowRef<PageRuntime>()
  const loading = ref(false), ready = ref(false), busy = ref(false), error = ref('')
  let generation = 0, active = true

  function currentDataSet(): DataSet | undefined {
    const scenario = config.scenarioId.value
    return scenario ? runtime.value?.getDataSet(scenario) : undefined
  }

  const designView = computed(() => currentDataSet()?.getView(config.designViewTable, 'default'))

  async function refreshDesign(): Promise<void> {
    const scope = config.scopeId.value?.trim()
    const ds = currentDataSet()
    if (!ds || !scope) return
    setDesignScopeValue({dataSet: ds, tableName: config.scopeInputTable, field: config.scopeField, scopeId: scope})
    const view = designView.value
    if (!view) return
    await view.refresh()
    if (view.loadingError) throw view.loadingError
  }

  watch(config.scenarioId, async scenario => {
    const own = ++generation
    ready.value = false; loading.value = true; error.value = ''
    sparkRemove(PAGE_RUNTIME); runtime.value?.dispose(); runtime.value = undefined
    try {
      if (!scenario) throw new Error('缺少导航绑定的数据空间ID')
      const loaded = await config.loadDataSet(scenario)
      if (own !== generation) {loaded.destroy(); return}
      runtime.value = new PageRuntime({pageId: config.pageId, scenarioIds: [scenario], loadScenario: () => Promise.resolve(loaded)})
      await runtime.value.load()
      if (own !== generation) {runtime.value.dispose(); return}
      sparkProvide(PAGE_RUNTIME, runtime.value)
      const scope = config.scopeId.value?.trim()
      if (!scope) {
        error.value = config.missingScopeMessage
        ready.value = true
        return
      }
      await refreshDesign()
      ready.value = true
    } catch (cause) {
      if (active && own === generation) error.value = cause instanceof Error ? cause.message : String(cause)
    } finally {
      if (active && own === generation) loading.value = false
    }
  }, {immediate: true})

  watch(config.scopeId, async scope => {
    if (!runtime.value || !ready.value) return
    if (!scope?.trim()) {error.value = config.missingScopeMessage; return}
    error.value = ''
    loading.value = true
    try {await refreshDesign()}
    catch (cause) {error.value = cause instanceof Error ? cause.message : String(cause)}
    finally {loading.value = false}
  })

  onBeforeUnmount(() => {
    active = false; generation++
    sparkRemove(PAGE_RUNTIME); runtime.value?.dispose()
  })

  async function saveChanges(): Promise<void> {
    const ds = currentDataSet()
    if (!ds || busy.value) return
    busy.value = true; error.value = ''
    try {
      const result = await ds.saveChanges({views: [{tableName: config.designViewTable, viewId: 'default'}]})
      if (!result.success) throw new Error(result.message ?? '保存失败')
    } catch (cause) {error.value = cause instanceof Error ? cause.message : String(cause)}
    finally {busy.value = false}
  }

  function updateDesignField(view: DataView | undefined, field: string, value: unknown): void {
    if (!view) return
    const row = view.rows[0]
    const pk = view.primaryKey
    if (!row || !pk) return
    const rowId = row[pk]
    if (typeof rowId !== 'string' && typeof rowId !== 'number') return
    void view.editRowById(rowId, {[field]: value})
  }

  return {runtime, designView, loading, ready, busy, error, saveChanges, refreshDesign, updateDesignField}
}
