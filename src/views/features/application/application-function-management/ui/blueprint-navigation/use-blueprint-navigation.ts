/**
 * @module app:views/features/application/application-function-management/ui/blueprint-navigation/use-blueprint-navigation
 * 职责：项目蓝图页“导航配置”页签：导航属性标准字段的候选、字典视图就绪、保存前导航地址规范校验。
 * 边界：字段直接绑定 owner 的 Base_NavigationInfo DataView 编辑覆盖，经页面“保存蓝图修改”统一保存（owner 保存前核对导航基线）；
 *   显示方式与水平对齐读取同一 PageRuntime 的正式字典视图，打开方式与子项位置沿仓内正式编码；不自动保存。
 * AI用途：调整导航配置页签时在此维护候选与校验，不另建导航草稿或直调接口。
 */
import {computed, ref, watch, type Ref} from 'vue'
import {buildDataViewKey} from '@spark-appworks/spark-data'
import {LowcodeDictionary} from '@/lowcode/resources/structured-config/dictionary/resource'
import {blueprintChildPlacementOptions, blueprintNavigationTargetError, blueprintOpenModeOptions} from '@/services/project/blueprint-navigation/blueprint-navigation-rules'
import type {BlueprintWorkspaceDataView} from '@/services/project/blueprint-workspace-dataview'
import type {BlueprintTreeContext} from '../use-application-function-page'
import {readBlueprintCurrentText} from '../application-function-page-contract'

const NUMERIC_TYPES: ReadonlySet<string> = new Set(['number', 'int', 'integer', 'decimal', 'float', 'double'])
/** 页面向导航配置提供的上下文与 owner 宿主能力。 */
export type BlueprintNavigationInput = Readonly<{
  /** 当前有效蓝图树上下文。 */
  context: () => BlueprintTreeContext | undefined
  /** 当前选中节点身份。 */
  selectedNodeId: Readonly<Ref<string>>
  /** 导航配置页签处于激活状态。 */
  active: () => boolean
  /** 外部 DataView 修改计数，用于重新计算当前值派生的候选。 */
  revision: Readonly<Ref<number>>
  /** 读取并校验正式导航字典视图（显示方式、水平对齐）。 */
  loadDictionaries: () => Promise<void>
}>

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

/** 布尔类导航开关按正式列类型取勾选/未勾选的 wire 值。 */
export type BlueprintFlagValues = Readonly<{trueValue: boolean | string | number; falseValue: boolean | string | number}>

/** 编辑覆盖中被修改的导航地址未通过规范时返回原因；未修改导航地址的节点不校验历史值。 */
export function blueprintPendingNavigationError(owner: BlueprintWorkspaceDataView): string {
  for (const row of owner.view.rows) {
    const id = owner.view.getPkKey(row)
    const patch = id === undefined ? undefined : owner.view.getEditingPatch(id)
    if (!patch || !Object.hasOwn(patch, 'NavigationUrl')) continue
    const reason = blueprintNavigationTargetError(patch['NavigationUrl'])
    if (reason) return `${reason}（节点 ${String(id)}）`
  }
  return ''
}

/** 导航配置页签状态。 */
export function useBlueprintNavigation(input: BlueprintNavigationInput) {
  const dictionaryReady = ref(false)
  const dictionaryError = ref('')
  let dictionaryRequest = 0
  const showTypeOptionsKey = buildDataViewKey('_Base_DictData', 'NavigationShowType_Content', LowcodeDictionary.editorScenarioId)
  const alignmentOptionsKey = buildDataViewKey('_Base_DictData', 'Navigationposition', LowcodeDictionary.editorScenarioId)

  function columnType(field: string): string {
    return input.context()?.owner.view.columns.find(column => column.name === field)?.type ?? ''
  }
  function current(field: string): unknown {
    void input.revision.value
    const owner = input.context()?.owner
    if (owner?.nodeId !== input.selectedNodeId.value) return undefined
    return owner.view.getEditingRow(owner.nodeId)?.[field]
  }
  const isModule = computed(() => {
    void input.revision.value
    const owner = input.context()?.owner
    return !!owner && owner.nodeId === input.selectedNodeId.value && readBlueprintCurrentText(owner, 'conType') === 'Model'
  })
  const openModeOptions = computed(() => blueprintOpenModeOptions(NUMERIC_TYPES.has(columnType('NavigationType')), current('NavigationType')))
  const placementOptions = computed(() => blueprintChildPlacementOptions(current('ChildItemLocation')))
  function flagValues(field: string): BlueprintFlagValues {
    const type = columnType(field)
    if (type === 'boolean' || type === 'bool') return {trueValue: true, falseValue: false}
    return NUMERIC_TYPES.has(type) ? {trueValue: 1, falseValue: 0} : {trueValue: '1', falseValue: '0'}
  }

  watch(() => [input.active(), input.context()?.runtime.instanceId], async ([active]) => {
    const request = ++dictionaryRequest
    dictionaryReady.value = false
    dictionaryError.value = ''
    if (active !== true || input.context() === undefined) return
    try {
      await input.loadDictionaries()
      if (request === dictionaryRequest) dictionaryReady.value = true
    } catch (cause) {
      if (request === dictionaryRequest) dictionaryError.value = `导航字典读取失败：${describe(cause)}`
    }
  }, {immediate: true})

  return {
    dictionaryReady,
    dictionaryError,
    showTypeOptionsKey,
    alignmentOptionsKey,
    isModule,
    openModeOptions,
    placementOptions,
    flagValues,
  }
}
