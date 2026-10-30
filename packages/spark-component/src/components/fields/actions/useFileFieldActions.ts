/**
 * @module @spark-appworks/spark-component:components/fields/actions/useFileFieldActions
 * 职责：维护 @spark-appworks/spark-component 中 components/fields/actions/useFileFieldActions 的模块能力，围绕 UseFileFieldActionsOptions 提供稳定的公开契约。
 * 边界：只覆盖当前模块职责，不把相邻包、运行时副作用或业务配置混入同一语义入口。
 * AI用途：需要定位 components/fields/actions/useFileFieldActions 的声明、导出和使用边界时，从本模块开始。
 */
import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import type {
  PageBrowseFilesOptions,
  PageSelectedFile,
  PageServiceCapability,
  PageUploadFilesOptions,
  PageUploadedFile,
} from '../../internal'
import { PageUploadError } from '../../../runtime/app-services'
import { useFieldActionMode } from './useFieldActionMode'

/** Use File Field Actions Options 的调用配置。 */
type UseFileFieldActionsOptions = {
    /** page Service 字段。 */
pageService: PageServiceCapability | null
    /** 是否 is Editable。 */
isEditable: ComputedRef<boolean>}

export function useFileFieldActions(options: UseFileFieldActionsOptions) {
  const { pageService, isEditable } = options
  const { chooseByMode } = useFieldActionMode({ isEditable })

  const hasBrowseCapability = computed(() => typeof pageService?.browseFiles === 'function')
  const hasUploadCapability = computed(() => typeof pageService?.uploadFiles === 'function')
  const primaryAction = chooseByMode<'upload' | 'browse'>('upload', 'browse')

  async function browseFiles(browseOptions?: PageBrowseFilesOptions): Promise<PageSelectedFile[]> {
    if (typeof pageService?.browseFiles !== 'function') return []
    return await pageService.browseFiles(browseOptions)
  }

  async function uploadFiles(uploadOptions: PageUploadFilesOptions): Promise<PageUploadedFile[]> {
    if (typeof pageService?.uploadFiles !== 'function') return []
    return await pageService.uploadFiles(uploadOptions)
  }

  function showError(error: unknown): void {
    if (error instanceof PageUploadError) {
      const confirmedNames = error.confirmedFiles.map(file => file.name).join('、')
      const confirmed = confirmedNames.length > 0 ? `已确认：${confirmedNames}；` : ''
      pageService?.showMessage(`${error.message}；${confirmed}未确认：${error.unconfirmedFile.name}`, 'error')
      return
    }
    const message = error instanceof Error ? error.message : String(error)
    pageService?.showMessage(message, 'error')
  }

  return {
    hasBrowseCapability,
    hasUploadCapability,
    primaryAction,
    browseFiles,
    uploadFiles,
    showError,
  }
}
