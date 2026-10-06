/**
 * @module app:views/app/dev-system/composables/useNodeKindFlags
 * 职责：从正式五种业务kind计算界面条件。
 * 边界：只读四组草稿kind，不按URL或树层级猜种类。
 * AI用途：按module/page/embedded/service/content选择属性编辑控件。
 */
import { computed } from 'vue'
import type { DevState } from '../useDevState'

export function useNodeKindFlags(state: DevState) {
  const isModule = computed(() => state.blueprintDraft.kind === 'module')
  const isPage = computed(() => state.blueprintDraft.kind === 'page')
  const isEmbedded = computed(() => state.blueprintDraft.kind === 'embedded')
  const isService = computed(() => state.blueprintDraft.kind === 'service')
  const isContent = computed(() => state.blueprintDraft.kind === 'content')
  return { isModule, isPage, isEmbedded, isService, isContent }
}
