/**
 * @module app:views/features/application/application-function-management/ui/blueprint-navigation/use-blueprint-navigation
 * 职责：项目蓝图页“导航配置”页签：导航属性字典候选视图的键与读取状态、模块节点判定。
 * 边界：字段直接绑定 owner 的 Base_NavigationInfo DataView，经页面“保存蓝图修改”统一保存；导航地址规范由场景列规则在保存时校验；
 *   跳转方式、显示方式、子项位置与水平对齐读取同一 PageRuntime 的正式字典视图；不自动保存。
 * AI用途：调整导航配置页签时在此维护候选视图，不另建导航草稿、候选常量或直调接口。
 */
import {computed, ref, watch, type Ref} from 'vue'
import {buildDataViewKey} from '@spark-appworks/spark-data'
import {LowcodeDictionary} from '@/lowcode/resources/structured-config/dictionary/resource'
import type {BlueprintTreeContext} from '../use-application-function-page'
import {readBlueprintCurrentText} from '../application-function-page-contract'

/** 页面向导航配置提供的上下文与字典读取能力。 */
export type BlueprintNavigationInput = Readonly<{
  /** 当前有效蓝图树上下文。 */
  context: () => BlueprintTreeContext | undefined
  /** 当前选中节点身份。 */
  selectedNodeId: Readonly<Ref<string>>
  /** 导航配置页签处于激活状态。 */
  active: () => boolean
  /** 外部 DataView 修改计数，用于重新计算当前值派生的状态。 */
  revision: Readonly<Ref<number>>
  /** 读取导航相关的正式字典视图。 */
  loadDictionaries: () => Promise<void>
}>

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

const dictionaryKey = (viewId: string): string => buildDataViewKey('_Base_DictData', viewId, LowcodeDictionary.editorScenarioId)

/** 导航配置页签状态。 */
export function useBlueprintNavigation(input: BlueprintNavigationInput) {
  const dictionaryError = ref('')
  let dictionaryRequest = 0
  const openModeOptionsKey = dictionaryKey('NavigationType')
  const showTypeOptionsKey = dictionaryKey('NavigationShowType_Content')
  const placementOptionsKey = dictionaryKey('NavChildrenLocation')
  const alignmentOptionsKey = dictionaryKey('Navigationposition')

  const isModule = computed(() => {
    void input.revision.value
    const owner = input.context()?.owner
    return !!owner && owner.nodeId === input.selectedNodeId.value && readBlueprintCurrentText(owner, 'conType') === 'Model'
  })

  watch(() => [input.active(), input.context()?.runtime.instanceId], async ([active]) => {
    const request = ++dictionaryRequest
    dictionaryError.value = ''
    if (active !== true || input.context() === undefined) return
    try {
      await input.loadDictionaries()
    } catch (cause) {
      if (request === dictionaryRequest) dictionaryError.value = `导航字典读取失败：${describe(cause)}`
    }
  }, {immediate: true})

  return {
    dictionaryError,
    openModeOptionsKey,
    showTypeOptionsKey,
    placementOptionsKey,
    alignmentOptionsKey,
    isModule,
  }
}
