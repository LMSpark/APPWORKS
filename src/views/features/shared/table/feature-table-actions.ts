/**
 * @module app:views/features/shared/table/feature-table-actions
 * 职责：行内编辑表格的“新增/删除/保存/取消”标准工具栏及其DataView动作。
 * 边界：只调用原DataView及所属DataSet的新增、删除、提交与放弃能力；权限、规则和回执核验仍由SPARK data承接。
 */
import type {DataView, SparkNode} from '@spark-appworks/spark-data'
import type {PageServiceCapability, RToolbarProps} from '@spark-appworks/spark-component'

type FeatureTableUi = Pick<PageServiceCapability, 'showMessage'>

export type FeatureTableAction = 'add' | 'remove' | 'save' | 'cancel'
/** locked为页面忙碌等外部锁；addBlocked只进一步限制新增，例如所属父记录尚未保存。 */
export type FeatureTableToolbarInput = Readonly<{
  view: DataView
  order: readonly FeatureTableAction[]
  locked: boolean
  run: (action: FeatureTableAction) => unknown
  addBlocked?: boolean
}>

export function featureTableToolbar(input: FeatureTableToolbarInput): RToolbarProps {
  const {view, run} = input, row = view.currentRow, id = row ? view.getPkKey(row) : undefined
  const locked = input.locked || view.hasUnconfirmedSave
  const pending = view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges()
  const removable = !!row && id !== undefined && (view.dirtyTracking.isPendingCreate(id) || view.deleteActionState(row) === 'enabled')
  const buttons: Readonly<Record<FeatureTableAction, SparkNode>> = {
    add: {type: 'r-button', props: {label: '新增', buttonType: 'primary', permAction: 'create', disabled: locked || input.addBlocked === true, onClick: () => run('add')}},
    remove: {type: 'r-button', props: {label: '删除', disabled: locked || !removable, onClick: () => run('remove')}},
    save: {type: 'r-button', props: {label: '保存', buttonType: 'primary', disabled: locked || !pending, onClick: () => run('save')}},
    cancel: {type: 'r-button', props: {label: '取消', disabled: locked || !pending, onClick: () => run('cancel')}},
  }
  return {gap: 10, children: input.order.map(action => buttons[action])}
}

/** 保存只提交本视图的变更；未确认回执抛错交由页面重读核验，不自动重放。 */
export async function runFeatureTableAction(view: DataView, action: FeatureTableAction, ui: FeatureTableUi): Promise<void> {
  if (action === 'add') {view.setCurrentRow(await view.addRow({})); return}
  if (action === 'cancel') {if (!view.hasUnconfirmedSave) view.discardPendingChanges(); return}
  if (action === 'remove') {
    const row = view.currentRow, id = row ? view.getPkKey(row) : undefined
    if (!row || id === undefined) {ui.showMessage('请先选择一条记录', 'warning'); return}
    await view.removeRow(id)
    return
  }
  if (!view.hasEditingChanges() && !view.dirtyTracking.hasPendingChanges()) {ui.showMessage('当前没有可保存的变更', 'info'); return}
  const result = await view.dataSet?.saveChanges({views: [{tableName: view.tableName, viewId: view.viewId}]})
  if (!result) throw new Error('表格缺少所属数据空间')
  if (!result.success) throw new Error(result.error?.message ?? result.message ?? '保存结果未确认，请重读核验')
  ui.showMessage('保存成功', 'success')
}
