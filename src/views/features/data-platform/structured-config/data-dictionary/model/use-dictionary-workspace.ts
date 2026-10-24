/**
 * @module app:views/features/data-platform/structured-config/data-dictionary/model/use-dictionary-workspace
 * 职责：字典设计与数据页面的实例生命周期及标准组件上下文。
 * 边界：不持有行副本，不选择保存范围；页面调用不同领域命令。
 * AI用途：复用正式DataSet、PageRuntime和草稿保护，保持两类页面独立。
 */
import {computed, onBeforeUnmount, ref, shallowRef, toValue, watch, type MaybeRefOrGetter} from 'vue'
import {DictionaryWorkspace} from '@spark-appworks/spark-lowcode-api'
import type {DataSet} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {PAGE_RUNTIME, useSparkComponent} from '@spark-appworks/spark-component'
import {useSystemPageDirtySource} from '@spark-appworks/spark-app'
import {LowcodeDictionary} from '@/lowcode/resources/dictionary/lowcode-dictionary'

/** 独立字典页面的实例输入，不包含角色或业务行数据。 */
type DictionaryPageInput = Readonly<{
  /** 正式字典身份；响应式变化时释放原实例再装配。 */
  dictionaryId: MaybeRefOrGetter<string | undefined>
  /** 仅设计页可新建定义；数据页必须消费已保存方案。 */
  create?: boolean
  /** 新建设计的正式应用选项场景；该空间与字典编辑空间由当前PageRuntime分别拥有。 */
  applicationScenarioId?: MaybeRefOrGetter<string | undefined>
  /** 当前页面运行实例的标识。 */
  pageId: string
  /** 宿主关闭保护所需的未提交状态，不提供行副本。 */
  onPending?: (value: boolean) => void
}>

/** 装配与操作结果均隔离到本次字典身份；业务页分别调用saveDesign/saveData，不能合并提交。 */
export function useDictionaryWorkspace(input: DictionaryPageInput) {
  const {sparkProvide, sparkRemove} = useSparkComponent({type: input.pageId})
  const workspace = shallowRef<DictionaryWorkspace>()
  const ready = ref(false), loading = ref(true), busy = ref(false), error = ref(''), revision = ref(0)
  let runtime: PageRuntime | undefined, unsubscribe: (() => void) | undefined, active = true, generation = 0
  const pending = computed(() => {revision.value; return workspace.value?.pending === true})
  const uncertain = computed(() => {revision.value; return workspace.value?.requiresVerification === true})
  useSystemPageDirtySource({get isDirty() {return busy.value || pending.value}})
  function changed(): void {revision.value++; input.onPending?.(busy.value || pending.value)}
  async function run(action: () => Promise<void>): Promise<boolean> {
    if (!active || !ready.value || busy.value) return false
    const own = generation, id = toValue(input.dictionaryId)
    const isCurrent = (): boolean => active && own === generation && id === toValue(input.dictionaryId)
    busy.value = true; error.value = ''; changed()
    try {await action()}
    catch (cause) {if (isCurrent()) error.value = cause instanceof Error ? cause.message : String(cause); return false}
    finally {if (isCurrent()) {busy.value = false; changed()}}
    return isCurrent()
  }
  function discard(): void {
    workspace.value?.definition.discardPendingChanges()
    workspace.value?.entries.discardPendingChanges()
    changed()
  }
  watch([() => toValue(input.dictionaryId), () => input.create ? toValue(input.applicationScenarioId) : undefined], async ([id, applicationScenarioId]) => {
    const own = ++generation
    const isCurrent = (): boolean => active && own === generation
    ready.value = false; loading.value = true; busy.value = false; error.value = ''
    unsubscribe?.(); sparkRemove(PAGE_RUNTIME); runtime?.dispose(); workspace.value = undefined
    changed()
    try {
      if (!id?.trim()) throw new Error('请通过dictionaryId参数指定唯一字典')
      if (input.create && !applicationScenarioId?.trim()) throw new Error('新建设计缺少正式应用选项场景')
      if (input.create && applicationScenarioId === LowcodeDictionary.editorScenarioId) {
        throw new Error('字典编辑与应用选项必须属于不同正式数据空间')
      }
      const opened = await LowcodeDictionary.loadEditor()
      if (!isCurrent()) {opened.dataSet.destroy(); return}
      let optionsDataSet: DataSet | undefined
      try {
        if (input.create && applicationScenarioId) optionsDataSet = await LowcodeDictionary.loadApplicationOptions(applicationScenarioId)
      } catch (cause) {opened.dataSet.destroy(); throw cause}
      if (!isCurrent()) {opened.dataSet.destroy(); optionsDataSet?.destroy(); return}
      const scenarioIds = [LowcodeDictionary.editorScenarioId]
      const dataSets = new Map<string, DataSet>([[LowcodeDictionary.editorScenarioId, opened.dataSet]])
      if (optionsDataSet && applicationScenarioId) {
        scenarioIds.push(applicationScenarioId)
        dataSets.set(applicationScenarioId, optionsDataSet)
      }
      let current: PageRuntime
      try {
        current = new PageRuntime({pageId: input.pageId, scenarioIds,
          loadScenario: scenarioId => {
            const dataSet = dataSets.get(scenarioId)
            if (!dataSet) throw new Error(`字典页面请求了未装配的数据空间 ${scenarioId}`)
            return Promise.resolve(dataSet)
          }})
      } catch (cause) {
        for (const dataSet of dataSets.values()) dataSet.destroy()
        throw cause
      }
      runtime = current; await current.load()
      if (!isCurrent()) {current.dispose(); return}
      const owner = new DictionaryWorkspace({dataSet: opened.dataSet, dictionaryId: id, ...(input.create ? {create: true} : {})})
      workspace.value = owner; await owner.load()
      if (!isCurrent()) return
      sparkProvide(PAGE_RUNTIME, current)
      unsubscribe = opened.dataSet.onAnyViewChange({rowsChanged: changed, currentRowChanged: changed,
        editingChanged: changed, editingFieldChanged: changed, editingDiscarded: changed, requestStateChanged: changed})
      ready.value = true; changed()
    } catch (cause) {
      if (active && own === generation) {
        unsubscribe?.(); unsubscribe = undefined
        sparkRemove(PAGE_RUNTIME); runtime?.dispose(); runtime = undefined; workspace.value = undefined
        error.value = cause instanceof Error ? cause.message : String(cause)
      }
    }
    finally {if (active && own === generation) loading.value = false}
  }, {immediate: true})
  onBeforeUnmount(() => {active = false; generation++; unsubscribe?.(); sparkRemove(PAGE_RUNTIME); runtime?.dispose()})
  return {workspace, ready, loading, busy, error, revision, pending, uncertain, run, discard}
}
