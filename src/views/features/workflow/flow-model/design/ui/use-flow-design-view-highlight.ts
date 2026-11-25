/**
 * @module app:views/features/workflow/flow-model/design/ui/use-flow-design-view-highlight
 * 职责：将图选中 id 同步到已绑定 DataView 的当前行（表格高亮）。
 */
import {watch, toRaw, toValue, type MaybeRefOrGetter} from 'vue'
import type {DataRow} from '@spark-appworks/spark-data'
import {PAGE_RUNTIME, useSparkComponent} from '@spark-appworks/spark-component'

export function useFlowDesignViewHighlight(
  viewKey: MaybeRefOrGetter<string | undefined>,
  highlightId: MaybeRefOrGetter<string | number | null | undefined>,
): (row: DataRow | null | undefined) => string | number | undefined {
  const {sparkConsume} = useSparkComponent({type: 'flow-design-view-highlight'})
  const resolveView = () => {
    const key = toValue(viewKey)?.trim()
    const view = key ? sparkConsume(PAGE_RUNTIME)?.resolveView(key) : undefined
    return view?.destroyed ? undefined : view
  }
  watch(() => [toValue(viewKey), toValue(highlightId)] as const, () => {
    const view = resolveView()
    if (!view) return
    const id = toValue(highlightId)
    if (id === null || id === undefined || id === '') {
      view.selection.setCurrentRow(null)
      return
    }
    view.selection.setCurrentRowById(id)
  }, {immediate: true})

  // Vue can proxy table rows. Resolve the original object before checking the active query result.
  return row => {
    if (!row) return undefined
    const view = resolveView()
    const formal = toRaw(row)
    if (!view || !view.rows.includes(formal) || view.fieldAccess(formal, view.primaryKey).read !== 'visible') return undefined
    return view.getPkKey(formal)
  }
}
