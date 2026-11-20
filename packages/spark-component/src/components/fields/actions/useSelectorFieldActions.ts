/**
 * @module @spark-appworks/spark-component:components/fields/actions/useSelectorFieldActions
 * 职责：维护 @spark-appworks/spark-component 中 components/fields/actions/useSelectorFieldActions 的模块能力，围绕 UseSelectorFieldActionsOptions 提供稳定的公开契约。
 * 边界：只覆盖当前模块职责，不把相邻包、运行时副作用或业务配置混入同一语义入口。
 * AI用途：需要定位 components/fields/actions/useSelectorFieldActions 的声明、导出和使用边界时，从本模块开始。
 */
import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import type {
  PageSelectorOption,
  PageSelectEntitiesOptions,
  PageServiceCapability,
} from '../../internal'
import { useFieldActionMode } from './useFieldActionMode'

/** Use Selector Field Actions Options 的调用配置。 */
type UseSelectorFieldActionsOptions = {
    /** page Service 字段。 */
pageService: PageServiceCapability | null
    /** 是否 is Editable。 */
isEditable: ComputedRef<boolean>}

export function useSelectorFieldActions(options: UseSelectorFieldActionsOptions) {
  const { pageService, isEditable } = options
  const { actionMode, chooseByMode } = useFieldActionMode({ isEditable })

  const hasSelectorCapability = computed(() => typeof pageService?.selectEntities === 'function')
  const primaryAction = chooseByMode<'select' | 'view'>('select', 'view')

  async function selectEntities(selectorOptions: PageSelectEntitiesOptions): Promise<PageSelectorOption[]> {
    if (typeof pageService?.selectEntities !== 'function') return []
    return await pageService.selectEntities(selectorOptions)
  }

  return {
    actionMode,
    hasSelectorCapability,
    primaryAction,
    selectEntities,
  }
}