/**
 * @module app:views/features/shared/table/feature-table-actions
 * 职责：行内编辑表格的“新增/删除/保存/取消”标准工具栏及其DataView动作。
 * 边界：只调用原DataView及所属DataSet的新增、删除、提交与放弃能力；权限、规则和回执核验仍由SPARK data承接。
 */
import type {DataView, SparkNode} from '@spark-appworks/spark-data'
import type {PageServiceCapability, RToolbarProps} from '@spark-appworks/spark-component'

/** 共享表格动作的结果呈现及原保存确认后的关联读取。 */
type FeatureTableActionOptions = Readonly<{
  /** 在当前工具栏呈现公共保存状态或关联读取结果。 */
  ui: Pick<PageServiceCapability, 'showMessage'>
  /** 确认写入后解析本次操作仍有效的关联视图。视图失效时返回 undefined。 */
  readback?: () => DataView | undefined
}>

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

/** 保存只提交本视图的变更，收到确认回执后才读取调用方声明的关联视图。 */
export async function runFeatureTableAction(view: DataView, action: FeatureTableAction, options: FeatureTableActionOptions): Promise<void> {
  const {ui, readback} = options
  if (action === 'add') {view.setCurrentRow(await view.addRow({})); return}
  if (action === 'cancel') {if (!view.hasUnconfirmedSave) view.discardPendingChanges(); return}
  if (action === 'remove') {
    const row = view.currentRow, id = row ? view.getPkKey(row) : undefined
    if (!row || id === undefined) {ui.showMessage('请先选择一条记录', 'warning'); return}
    await view.removeRow(id)
    return
  }
  const dataSet = view.dataSet
  if (!dataSet) throw Error('表格缺少所属数据空间')
  const outcome = await dataSet.saveView(view)
  if (outcome.state === 'not-submitted') {
    ui.showMessage('本次未提交变更', 'info')
    return
  }
  if (outcome.state === 'unknown') throw Error('保存结果未知，请核验原提交', {cause: outcome.error})
  if (outcome.state === 'partial') throw Error(`部分变更已保存：${outcome.error.message}`, {cause: outcome.error})
  if (outcome.state === 'failed') throw outcome.error
  if (outcome.state === 'follow-up-failed') {
    ui.showMessage(`保存已确认，后续操作失败：${outcome.error.message}`, 'warning')
    return
  }
  try {
    const nextView = readback?.()
    if (nextView && (await nextView.requestRefresh({defer: false})).refreshStatus !== 'read') {
      ui.showMessage('保存已确认，关联数据回读失败', 'warning')
      return
    }
  } catch {
    ui.showMessage('保存已确认，关联数据回读失败', 'warning')
    return
  }
  ui.showMessage('保存成功', 'success')
}
