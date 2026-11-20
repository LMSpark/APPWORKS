/**
 * @module app:views/features/application/application-function-management/ui/use-application-function-data-space
 * 职责：项目蓝图页“数据空间”页签：主数据空间绑定/改绑的单独保存与回读核验、数据空间影响范围查询、内容设计入口门禁。
 * 边界：绑定只写 owner 的 Base_NavigationInfo.conid 编辑覆盖并沿原 DataView 保存；影响范围经同 DataSet 的 static-data
 *   结果 DataView 查询，由 owner DataView 增量读取绑定节点与完整父链；切换节点、上下文或绑定后旧查询结果丢弃。
 * AI用途：修改数据空间页签行为时在此保持“暂存→单独保存→回读核验”与代次校验，不另建蓝图 DataView、不直调接口。
 */
import {computed, ref, watch, type Ref} from 'vue'
import {buildDataViewKey, dataSetCommandQueryResultFromLocalRows, ensureDataSetStaticInputTable, type DataSet, type DataView, type SparkNode} from '@spark-appworks/spark-data'
import type {BlueprintTreeContext} from './use-application-function-page'
import {blueprintEditingFields} from './application-function-page-contract'

/** 影响范围结果表的展示列（标准 RendererTable children 描述）。 */
const impactColumn = (field: string, label: string, minWidth: number): SparkNode =>
  ({type: 'r-text', props: {field, label, readonly: true, minWidth, sortable: false, showOverflowTooltip: true}})
export const BLUEPRINT_IMPACT_COLUMNS: readonly SparkNode[] = Object.freeze([
  impactColumn('path', '功能路径', 260),
  impactColumn('nodeId', '节点稳定 ID', 280),
  impactColumn('navigationTarget', '导航地址', 260),
])

type ImpactTarget = Readonly<{contextKey: string; nodeId: string; dataSpaceId: string; request: number}>
type ImpactResource = Readonly<{dataSet: DataSet; tableName: string; view: DataView; viewKey: string}>

/** 页面向数据空间流程提供的上下文、正式绑定状态与保存入口。 */
export type ApplicationFunctionDataSpaceInput = Readonly<{
  /** 当前有效蓝图树上下文；无上下文时返回 undefined。 */
  context: () => BlueprintTreeContext | undefined
  /** 上下文仍是当前树且选中节点仍为 nodeId。 */
  isLive: (context: BlueprintTreeContext, nodeId: string) => boolean
  /** 当前选中的蓝图节点身份。 */
  selectedNodeId: Readonly<Ref<string>>
  /** 当前节点正式回读的 conid（DataView 原始值）；未绑定或不可读为空串。 */
  persistedDataSpaceId: Readonly<Ref<string>>
  /** conid 编辑覆盖尚未保存回读。 */
  bindingPending: Readonly<Ref<boolean>>
  /** 沿 owner 保存全部编辑覆盖；成功返回 true，失败已写入 error。 */
  saveOwner: () => Promise<boolean>
  /** 外部 DataView 覆盖变化后通知页面重新计算编辑状态。 */
  notifyChanged: () => void
  /** 页面错误提示。 */
  error: Ref<string>
  /** 页面成功提示。 */
  notice: Ref<string>
}>

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

/** 数据空间页签状态及动作。 */
export function useApplicationFunctionDataSpace(input: ApplicationFunctionDataSpaceInput) {
  const bindingSaving = ref(false)
  const impactOpen = ref(false)
  const impactLoading = ref(false)
  const impactError = ref('')
  const impactTitle = ref('')
  const impactViewKey = ref('')
  const designOpen = ref(false)
  let impactRequest = 0
  let impactTarget: ImpactTarget | undefined
  let impact: ImpactResource | undefined

  const canQueryImpact = computed(() => input.persistedDataSpaceId.value !== '' && !input.bindingPending.value && !impactLoading.value)
  const canOpenDesign = computed(() => input.persistedDataSpaceId.value !== '' && !input.bindingPending.value)

  function isTargetCurrent(target: ImpactTarget): boolean {
    const context = input.context()
    return !!context && impactTarget === target && impactRequest === target.request && context.key === target.contextKey
      && input.isLive(context, target.nodeId) && input.persistedDataSpaceId.value === target.dataSpaceId
  }

  function releaseImpact(): void {
    const current = impact
    impact = undefined
    impactViewKey.value = ''
    if (current && !current.dataSet.destroyed && current.dataSet.getView(current.tableName, 'default') === current.view) {
      current.dataSet.removeTable(current.tableName)
    }
  }

  /** 在 owner DataSet 上挂载影响范围结果 DataView；查询只在显式刷新时经 owner DataView 执行。 */
  function mountImpact(context: BlueprintTreeContext): ImpactResource {
    const dataSet = context.owner.dataSet
    const tableName = `BlueprintDataSpaceImpact${crypto.randomUUID().replaceAll('-', '')}`
    if (dataSet.getTable(tableName)) throw new Error('数据空间影响范围临时表名称冲突')
    ensureDataSetStaticInputTable(dataSet, tableName, [{name: 'nodeId', primary: true}, {name: 'path'}, {name: 'navigationTarget'}])
    const table = dataSet.getTable(tableName)
    const view = dataSet.getView(tableName, 'default')
    if (!table || !view) throw new Error('数据空间影响范围 DataView 未装配')
    const resourceId = `blueprint-data-space-impact:${context.projectId}:${crypto.randomUUID()}`
    table.resourceId = resourceId
    view.bindQueryExecutor({
      localAggregates: false,
      executeQuery: async target => {
        const query = impactTarget
        if (!query || !isTargetCurrent(query)) throw new Error('数据空间影响范围查询目标已失效')
        const guard = (): void => { if (!isTargetCurrent(query)) throw new Error('数据空间影响范围查询目标已失效') }
        const bindings = await context.owner.readDataSpaceImpact(query.dataSpaceId)
        guard()
        return dataSetCommandQueryResultFromLocalRows(target, bindings.map(item => ({...item})), guard)
      },
    }, {resource: {resourceType: 'static-data', resourceId}})
    const viewKey = buildDataViewKey(tableName, 'default', dataSet.scenarioId)
    if (context.runtime.resolveView(viewKey) !== view) throw new Error('数据空间影响范围 DataView 不属于当前运行时')
    return {dataSet, tableName, view, viewKey}
  }

  function invalidateImpact(): void {
    impactRequest++
    impactTarget = undefined
    impactOpen.value = false
    impactLoading.value = false
    impactError.value = ''
  }

  watch(() => [input.context()?.key, input.selectedNodeId.value, input.persistedDataSpaceId.value], () => {
    if (impactOpen.value) invalidateImpact()
    designOpen.value = false
  })
  watch(() => input.context()?.owner.dataSet, () => {
    invalidateImpact()
    releaseImpact()
  }, {flush: 'sync'})

  /** 数据空间选择器已暂存 conid：当前行只有该字段修改时立即单独保存并核验正式回读，否则保留为待保存修改。 */
  async function bindDataSpace(scenarioId: string): Promise<void> {
    input.notifyChanged()
    const context = input.context()
    const nodeId = input.selectedNodeId.value
    if (!context || !nodeId || bindingSaving.value) return
    const fields = blueprintEditingFields(context.owner)
    if (fields?.length !== 1 || fields[0] !== 'conid') {
      input.notice.value = '数据空间绑定已暂存；当前节点还有其他未保存修改或待核验命令，请通过“保存”一并提交'
      return
    }
    bindingSaving.value = true
    try {
      if (!await input.saveOwner()) return
      if (!input.isLive(context, nodeId)) return
      if (input.persistedDataSpaceId.value !== scenarioId) throw new Error('蓝图节点数据空间保存回读不一致')
      input.notice.value = '数据空间绑定已保存'
    } catch (cause) {
      input.error.value = describe(cause)
    } finally {
      bindingSaving.value = false
    }
  }

  /** 查询当前已保存主数据空间在本应用蓝图中的全部绑定节点及其功能路径。 */
  async function openImpact(): Promise<void> {
    const context = input.context()
    const nodeId = input.selectedNodeId.value
    const dataSpaceId = input.persistedDataSpaceId.value
    if (!context || !nodeId || !canQueryImpact.value) {
      if (input.bindingPending.value) input.error.value = '数据空间绑定尚未保存回读，不能查询影响范围'
      return
    }
    try {
      if (impact?.dataSet !== context.owner.dataSet || impact.dataSet.destroyed) {
        releaseImpact()
        impact = mountImpact(context)
      }
    } catch (cause) {
      releaseImpact()
      input.error.value = describe(cause)
      return
    }
    const target: ImpactTarget = {contextKey: context.key, nodeId, dataSpaceId, request: ++impactRequest}
    impactTarget = target
    impactTitle.value = `应用 ${context.projectId} · 数据空间 ${dataSpaceId}`
    impactViewKey.value = impact.viewKey
    impactError.value = ''
    impactOpen.value = true
    impactLoading.value = true
    try {
      await impact.view.refresh()
      if (!isTargetCurrent(target)) return
      if (impact.view.loadingError) throw impact.view.loadingError
    } catch (cause) {
      if (isTargetCurrent(target)) impactError.value = describe(cause)
    } finally {
      if (impactTarget === target && impactRequest === target.request) impactLoading.value = false
      input.notifyChanged()
    }
  }

  function closeImpact(value = false): void {
    if (value) return
    invalidateImpact()
  }

  function openDesign(): void {
    if (!canOpenDesign.value) {
      input.error.value = input.bindingPending.value ? '数据空间绑定尚未保存回读，不能进入内容设计' : '当前节点未绑定主数据空间'
      return
    }
    designOpen.value = true
  }

  function closeDesign(value = false): void {
    if (!value) designOpen.value = false
  }

  function dispose(): void {
    invalidateImpact()
    releaseImpact()
  }

  return {
    bindingSaving,
    canQueryImpact,
    canOpenDesign,
    impactOpen,
    impactLoading,
    impactError,
    impactTitle,
    impactViewKey,
    impactColumns: BLUEPRINT_IMPACT_COLUMNS,
    designOpen,
    bindDataSpace,
    openImpact,
    closeImpact,
    openDesign,
    closeDesign,
    dispose,
  }
}
