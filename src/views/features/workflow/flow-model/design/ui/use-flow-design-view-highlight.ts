/**
 * @module app:views/features/workflow/flow-model/design/ui/use-flow-design-view-highlight
 * 职责：将图选中 id 同步到已绑定 DataView 的当前行（表格高亮）。
 */
import {watch, toValue, type MaybeRefOrGetter} from 'vue'
import {PAGE_RUNTIME, useSparkComponent} from '@spark-appworks/spark-component'

export function useFlowDesignViewHighlight(
  viewKey: MaybeRefOrGetter<string | undefined>,
  highlightId: MaybeRefOrGetter<string | number | null | undefined>,
): void {
  const {sparkConsume} = useSparkComponent({type: 'flow-design-view-highlight'})
  watch(() => [toValue(viewKey), toValue(highlightId)] as const, () => {
    const key = normalizeText(toValue(viewKey))
    if (!key) return
    const runtime = sparkConsume(PAGE_RUNTIME)
    const view = runtime?.resolveView(key)
    if (!view || view.destroyed) return
    const id = toValue(highlightId)
    if (id === null || id === undefined || id === '') {
      view.selection.setCurrentRow(null)
      return
    }
    view.selection.setCurrentRowById(id)
  }, {immediate: true})
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim()
}