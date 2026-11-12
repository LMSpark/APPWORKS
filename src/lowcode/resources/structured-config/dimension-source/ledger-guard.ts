/**
 * @module app:lowcode/resources/structured-config/dimension-source/ledger-guard
 * 职责：判断来源绑定是否已被正式维度结果（台账场景 Bil_Dimension_Set.source_binding_id）引用，供绑定保存前拒绝变更受保护字段。
 * 边界：只消费同一 PageRuntime 中按需装配的台账场景 bySourceBinding 视图；任何读取失败、字段不可读或结果无法完整核验
 *   都抛错（由调用方拒绝保存），不当作“无记录”。不写入台账。
 * AI用途：调整台账引用判定时在此修改；绑定编辑器只消费布尔结果。
 */
import type {DataSet} from '@spark-appworks/spark-data'
import {assertReadable, bit, refreshView, requireView, text} from './view-support'

/** 来源绑定存在未删除的正式维度结果时返回 true；无法完整核验时抛错。 */
export async function hasDimensionLedgerRecords(ledger: DataSet, bindingId: string, assertCurrent: () => void): Promise<boolean> {
  if (!bindingId.trim()) throw new Error('维度台账核验缺少来源绑定 id')
  const view = requireView(ledger, 'Bil_Dimension_Set', 'bySourceBinding')
  view.queryContext = {bindingId}
  await refreshView(view, assertCurrent)
  let active = false
  for (const row of view.rows) {
    assertReadable(view, row, ['source_binding_id', 'lingma_sys_is_delete'])
    if (text(row['source_binding_id']) !== bindingId) throw new Error('维度台账查询返回了其他来源绑定的记录')
    if (bit(row['lingma_sys_is_delete']) !== 1) active = true
  }
  if (!active && view.total > view.rows.length) throw new Error('维度台账记录未能完整核验')
  return active
}
