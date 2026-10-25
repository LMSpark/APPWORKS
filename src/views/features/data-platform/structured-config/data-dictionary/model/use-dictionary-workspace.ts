/**
 * @module app:views/features/data-platform/structured-config/data-dictionary/model/use-dictionary-workspace
 * 职责：管理字典设计/数据工作区的正式DataSet、PageRuntime与安全生命周期。
 * 边界：不保存业务行副本或第二套AI状态；AI轮次由同一运行DataSet中的通用host/session承接。
 * AI用途：为标准AI批量新增组件提供当前正式条目DataView与租户配置Agent的应用能力。
 */
import {computed, onBeforeUnmount, ref, shallowRef, toValue, watch, type MaybeRefOrGetter} from 'vue'
import {AI_DATA_ENTRY_HOST, type AiDataEntryAttachment, type AiDataEntryHostCapability} from '@spark-appworks/spark-component'
import {DictionaryWorkspace} from '@spark-appworks/spark-lowcode-api'
import type {DataSet, DataView} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {PAGE_RUNTIME, useSparkComponent} from '@spark-appworks/spark-component'
import {useSystemPageDirtySource} from '@spark-appworks/spark-app'
import type {AiDataEntryHost} from '@/lowcode/resources/shared/ai-data-entry-host'
import {LowcodeDictionary} from '@/lowcode/resources/dictionary/lowcode-dictionary'

/** 字典工作区实例输入；open=false表示页面仍挂载但工作区已安全关闭。 */
type DictionaryPageInput = Readonly<{
  /** 正式字典身份；响应式变化时只在旧实例可安全释放后重新装配。 */
  dictionaryId: MaybeRefOrGetter<string | undefined>
  /** 数据页目录长期挂载时由此区分关闭状态与缺少目标身份。 */
  open?: MaybeRefOrGetter<boolean>
  /** 仅设计页可新建定义；数据页必须消费已保存方案。 */
  create?: boolean
  /** 新建设计的正式应用选项场景；该空间与字典编辑空间由当前PageRuntime分别拥有。 */
  applicationScenarioId?: MaybeRefOrGetter<string | undefined>
  /** 当前页面运行实例的标识。 */
  pageId: string
  /** 宿主关闭保护所需的未提交状态，不提供行副本。 */
  onPending?: (value: boolean) => void
}>

/** 装配与操作结果均隔离到本次字典身份；设计与业务数据分别保存。 */
export function useDictionaryWorkspace(input: DictionaryPageInput) {
  const {sparkProvide, sparkRemove} = useSparkComponent({type: input.pageId})
  const workspace = shallowRef<DictionaryWorkspace>()
  const aiHost = shallowRef<AiDataEntryHost>()
  const aiVisible = ref(false)
  const ready = ref(false), loading = ref(true), busy = ref(false), error = ref(''), aiError = ref(''), revision = ref(0)
  let runtime: PageRuntime | undefined, dataSet: DataSet | undefined, unsubscribe: (() => void) | undefined
  let hostUnsubscribe: (() => void) | undefined, active = true, generation = 0
  const pending = computed(() => {revision.value; return workspace.value?.pending === true || aiHost.value?.isDirty === true})
  const uncertain = computed(() => {revision.value; return workspace.value?.requiresVerification === true})
  const aiLocked = computed(() => {revision.value; return aiHost.value?.blocksWorkspace === true})
  function hasPendingWork(): boolean {return workspace.value?.pending === true || aiHost.value?.isDirty === true}
  useSystemPageDirtySource({get isDirty() {return busy.value || hasPendingWork()}})

  function changed(): void {
    revision.value++
    input.onPending?.(busy.value || hasPendingWork())
  }

  function ensureAiHost(): AiDataEntryHost {
    if (aiHost.value !== undefined) return aiHost.value
    const currentDataSet = dataSet, currentWorkspace = workspace.value
    if (!currentDataSet || !currentWorkspace || currentDataSet.destroyed) throw new Error('字典AI录入host尚未就绪')
    const created = LowcodeDictionary.createAiDataEntryHost(currentDataSet, currentWorkspace)
    aiHost.value = created
    hostUnsubscribe = created.subscribe(changed)
    aiError.value = ''
    changed()
    return created
  }

  const hostCapability: AiDataEntryHostCapability = {
    openSession(targetView: DataView): AiDataEntryAttachment {
      const owner = ensureAiHost()
      const attachment = owner.openSession(targetView)
      changed()
      return attachment
    },
  }
  sparkProvide(AI_DATA_ENTRY_HOST, hostCapability)

  function disposeRuntime(): void {
    unsubscribe?.(); unsubscribe = undefined
    hostUnsubscribe?.(); hostUnsubscribe = undefined
    sparkRemove(PAGE_RUNTIME)
    runtime?.dispose(); runtime = undefined; dataSet = undefined
    workspace.value = undefined; aiHost.value = undefined
    ready.value = false
    aiVisible.value = false
    changed()
  }

  /** 关闭或切换前的同步保护；失败时旧owner及其capture均保持存活。 */
  function releaseClean(): void {
    if (busy.value || workspace.value?.pending === true || aiHost.value?.isDirty === true || aiHost.value?.blocksWorkspace === true) {
      throw new Error('字典工作区仍有草稿、AI输入、候选、活动轮次或待核验命令，不能关闭')
    }
    aiHost.value?.releaseClean()
    generation++
    disposeRuntime()
  }

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

  watch([() => toValue(input.dictionaryId), () => input.create ? toValue(input.applicationScenarioId) : undefined,
    () => input.open === undefined || toValue(input.open)], async ([id, applicationScenarioId, openedState]) => {
    if (input.open !== undefined && !openedState) {
      try {releaseClean(); error.value = ''; aiError.value = ''}
      catch (cause) {error.value = cause instanceof Error ? cause.message : String(cause)}
      loading.value = false
      changed()
      return
    }
    if (!id?.trim()) {
      error.value = '请通过dictionaryId参数指定唯一字典'
      ready.value = false; loading.value = false; changed()
      return
    }
    if (runtime !== undefined) {
      if (input.open === undefined) disposeRuntime()
      else {
        try {releaseClean()}
        catch (cause) {error.value = cause instanceof Error ? cause.message : String(cause); loading.value = false; changed(); return}
      }
    }
    const own = ++generation
    const isCurrent = (): boolean => active && own === generation
    ready.value = false; loading.value = true; busy.value = false; error.value = ''; aiError.value = ''
    changed()
    try {
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
      if (optionsDataSet && applicationScenarioId) {scenarioIds.push(applicationScenarioId); dataSets.set(applicationScenarioId, optionsDataSet)}
      let current: PageRuntime
      try {
        current = new PageRuntime({pageId: input.pageId, scenarioIds,
          loadScenario: scenarioId => {
            const scenarioDataSet = dataSets.get(scenarioId)
            if (!scenarioDataSet) throw new Error(`字典页面请求了未装配的数据空间 ${scenarioId}`)
            return Promise.resolve(scenarioDataSet)
          }})
      } catch (cause) {for (const scenarioDataSet of dataSets.values()) scenarioDataSet.destroy(); throw cause}
      runtime = current; dataSet = opened.dataSet; await current.load()
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
        unsubscribe?.(); unsubscribe = undefined; hostUnsubscribe?.(); hostUnsubscribe = undefined
        sparkRemove(PAGE_RUNTIME); runtime?.dispose(); runtime = undefined; dataSet = undefined; workspace.value = undefined; aiHost.value = undefined
        error.value = cause instanceof Error ? cause.message : String(cause)
      }
    }
    finally {if (isCurrent()) loading.value = false}
  }, {immediate: true})

  onBeforeUnmount(() => {
    active = false; generation++
    if (input.open === undefined) {disposeRuntime(); return}
    try {releaseClean()}
    catch {
      // A route guard normally prevents this. Forced auth/process teardown is the documented nonrecoverable boundary.
      disposeRuntime()
    }
  })
  return {workspace, aiHost, aiVisible, ready, loading, busy, error, aiError, revision, pending, uncertain, aiLocked,
    run, discard, openAi: () => {aiVisible.value = true}, closeAi: () => {aiVisible.value = false}, releaseClean,
    get isDirty() {return busy.value || hasPendingWork()}}
}
