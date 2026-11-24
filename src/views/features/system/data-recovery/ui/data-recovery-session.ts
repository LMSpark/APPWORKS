import {ref, shallowRef} from 'vue'
import type {DataRow, DataView} from '@spark-appworks/spark-data'

const RECOVERY_TABLE = 'Base_TableData_Recovery'
const RESTORE_FIELDS = ['data_id', 'table_id', 'db_id', 'sys_id'] as const

type DataRecoveryOwners = Readonly<{table: DataView; database: DataView; application: DataView}>
type RecoveryCommit = Readonly<{
  id: string | number
  tableId: string
  discard: () => void
  done: string
}>
export type DataRecoverySessionInput = Readonly<{
  target: DataView
  source: DataView
  owners: DataRecoveryOwners
  confirm: (message: string) => Promise<boolean>
  assertCurrent: () => void
  assertOperationCurrent: () => void
  isCurrentTable: (tableId: string) => boolean
}>

function text(row: DataRow | null | undefined, field: string): string {
  const raw = row?.[field]
  return typeof raw === 'string' || typeof raw === 'number' ? String(raw).trim() : ''
}

function failure(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

/** 数据恢复提交会话：记录变更仍只由绑定的恢复记录DataView暂存、提交和核验。 */
export class DataRecoverySession {
  private readonly busyState = ref(false)
  private readonly pendingState = shallowRef<RecoveryCommit>()
  private readonly messageState = ref('')
  private readonly noticeState = ref('')

  public constructor(private readonly input: DataRecoverySessionInput) {
    if (input.target.tableName !== RECOVERY_TABLE) throw new Error(`DATA_RECOVERY_VIEW: 恢复会话必须绑定 ${RECOVERY_TABLE}`)
  }

  public get busy(): boolean { return this.busyState.value }
  public get message(): string { return this.messageState.value }
  public get notice(): string { return this.noticeState.value }
  public get pendingVerification(): boolean { return this.pendingState.value !== undefined }
  public get locked(): boolean {
    return this.busy || this.pendingVerification || this.input.target.hasUnconfirmedSave
  }

  public clearMessage(): void {
    this.messageState.value = ''
    this.noticeState.value = ''
  }

  public restoreBlocker(row: DataRow | null | undefined): string {
    if (!row || this.dataIdentity(row) === undefined) return '正式查询未返回可读取的唯一来源主键'
    const {target} = this.input
    const pending = this.pendingTargetBlocker()
    if (pending) return pending
    if (target.addActionState() !== 'enabled') return '当前无恢复记录新增权限'
    const denied = RESTORE_FIELDS.find(field => target.newRowFieldAccess(field).write !== 'allowed')
    return denied ? `恢复记录字段不可新增：${denied}` : ''
  }

  public undoBlocker(row: DataRow | null | undefined): string {
    const {target} = this.input
    if (!row || !target.rows.includes(row) || target.getPkKey(row) === undefined) return '恢复记录身份已失效'
    const pending = this.pendingTargetBlocker()
    if (pending) return pending
    return target.editActionState(row) === 'enabled' && target.fieldAccess(row, 'status').write === 'allowed'
      ? ''
      : '当前无撤销该恢复记录的权限'
  }

  public canRestore(row: DataRow | null | undefined): boolean {
    return !this.locked && this.restoreBlocker(row) === ''
  }

  public canUndo(row: DataRow | null | undefined): boolean {
    return !this.locked && this.undoBlocker(row) === ''
  }

  public verification(): Readonly<{visible: boolean; disabled: boolean}> {
    return {visible: this.pendingVerification, disabled: this.busy}
  }

  public async restore(row: DataRow): Promise<void> {
    if (this.locked) return
    this.busyState.value = true
    this.clearMessage()
    try {
      this.input.assertOperationCurrent()
      const blocker = this.restoreBlocker(row)
      if (blocker) throw new Error(`无法恢复：${blocker}`)
      const sourceIdentity = this.dataIdentity(row)
      const selectedTable = this.input.owners.table.currentRow
      const selectedDatabase = this.input.owners.database.currentRow
      const selectedApplication = this.input.owners.application.currentRow
      const tableId = text(selectedTable, 'rowid')
      const dbId = text(selectedDatabase, 'conid')
      const appId = text(selectedApplication, 'rowid')
      if (!sourceIdentity || !selectedTable || !selectedDatabase || !selectedApplication || !tableId || !dbId || !appId) {
        throw new Error('恢复缺少当前来源身份')
      }
      const checks = [
        this.input.source.captureReadRow(row, [sourceIdentity.field]),
        this.input.owners.table.captureReadRow(selectedTable, ['rowid']),
        this.input.owners.database.captureReadRow(selectedDatabase, ['conid']),
        this.input.owners.application.captureReadRow(selectedApplication, ['rowid']),
      ]
      if (!await this.input.confirm('确认恢复该条数据吗？')) return
      this.input.assertOperationCurrent()
      for (const check of checks) check()
      if (this.input.owners.table.currentRow !== selectedTable
        || this.input.owners.database.currentRow !== selectedDatabase
        || this.input.owners.application.currentRow !== selectedApplication) {
        throw new Error('恢复对象已变化，请重新选择')
      }
      const currentBlocker = this.restoreBlocker(row)
      if (currentBlocker) throw new Error(currentBlocker)
      const created = await this.input.target.addRow({
        data_id: String(sourceIdentity.id), table_id: tableId, db_id: dbId, sys_id: appId,
      })
      const id = this.input.target.getPkKey(created)
      if (id === undefined) throw new Error('恢复记录新增缺少正式行身份')
      await this.commit({
        id, tableId, discard: () => this.input.target.discardPendingChanges([id]), done: '恢复登记已确认',
      })
    } catch (cause) {
      this.messageState.value = `恢复失败：${failure(cause)}`
    } finally {
      this.busyState.value = false
    }
  }

  public async undo(row: DataRow): Promise<void> {
    const tableId = text(this.input.owners.table.currentRow, 'rowid')
    if (this.locked || !tableId) return
    this.busyState.value = true
    this.clearMessage()
    try {
      this.input.assertOperationCurrent()
      const id = this.input.target.rows.includes(row) ? this.input.target.getPkKey(row) : undefined
      const blocker = this.undoBlocker(row)
      if (id === undefined || blocker) throw new Error(`无法撤销恢复：${blocker || '恢复记录身份已失效'}`)
      const original = this.input.target.captureReadRow(row, ['status'])
      if (!await this.input.confirm('撤销恢复后，原数据将重新进入回收站。确认继续吗？')) return
      this.input.assertOperationCurrent()
      original()
      if (text(this.input.owners.table.currentRow, 'rowid') !== tableId) throw new Error('恢复记录视图已变化，请重新选择')
      const currentBlocker = this.undoBlocker(row)
      if (currentBlocker) throw new Error(currentBlocker)
      this.input.target.updateEditingValue(id, 'status', 1)
      await this.commit({
        id, tableId, discard: () => this.input.target.discardPendingChanges([id]), done: '撤销恢复登记已确认',
      })
    } catch (cause) {
      this.messageState.value = `撤销恢复失败：${failure(cause)}`
    } finally {
      this.busyState.value = false
    }
  }

  public async verify(): Promise<void> {
    const operation = this.pendingState.value
    if (!operation || this.busy) return
    this.busyState.value = true
    this.messageState.value = ''
    try {
      this.input.assertCurrent()
      if (this.input.target.destroyed || !this.input.target.hasUnconfirmedSaveFor([operation.id])) {
        throw new Error('原保存查询已失效，不能重新派发恢复操作')
      }
      const result = await this.input.target.saveChanges([operation.id])
      if (!result.success) {
        this.settleFailure(operation)
        throw new Error(result.message ?? '原保存结果尚未核定')
      }
      this.pendingState.value = undefined
      await this.refreshAfterCommit(operation)
    } catch (cause) {
      this.settleFailure(operation)
      this.messageState.value = failure(cause)
    } finally {
      this.busyState.value = false
    }
  }

  private dataIdentity(row: DataRow): Readonly<{field: string; id: string | number}> | undefined {
    const {source} = this.input
    const [field] = source.effectivePkFields
    if (!source.requiresExplicitIdentitySubmission || source.effectivePkFields.length !== 1 || !field
      || !source.rows.includes(row) || source.fieldAccess(row, field).read !== 'visible') return undefined
    const id = source.getPkKey(row)
    if (id === undefined || id === '') return undefined
    return {field, id}
  }

  private pendingTargetBlocker(): string {
    const {target} = this.input
    if (target.hasUnconfirmedSave || target.mutating || target.hasPendingSavedRowPermissions
      || target.hasEditingChanges() || target.dirtyTracking.hasPendingChanges()) {
      return '原恢复记录提交仍待处理'
    }
    return ''
  }

  private async commit(operation: RecoveryCommit): Promise<void> {
    this.input.assertCurrent()
    const dataSet = this.input.target.dataSet
    if (!dataSet) {
      this.settleFailure(operation)
      throw new Error('恢复记录视图缺少DataSet')
    }
    try {
      const result = await dataSet.saveChanges({views: [{
        tableName: this.input.target.tableName, viewId: this.input.target.viewId, ids: [operation.id],
      }]})
      if (!result.success) throw new Error(result.error?.message ?? '保存未确认，请刷新核验')
    } catch (cause) {
      this.settleFailure(operation)
      throw cause
    }
    this.pendingState.value = undefined
    await this.refreshAfterCommit(operation)
  }

  private settleFailure(operation: RecoveryCommit): void {
    if (this.input.target.hasUnconfirmedSaveFor([operation.id])) {
      this.pendingState.value = operation
      return
    }
    if (this.pendingState.value === operation) this.pendingState.value = undefined
    if (!this.input.target.destroyed) operation.discard()
  }

  private async refreshAfterCommit(operation: RecoveryCommit): Promise<void> {
    if (!this.input.isCurrentTable(operation.tableId)) return
    this.noticeState.value = operation.done
    const views = [this.input.source, this.input.target]
    let readError:unknown
    try{await Promise.all(views.map(view=>view.refresh()))}
    catch(cause){readError=cause}
    if (!this.input.isCurrentTable(operation.tableId)) return
    readError??=views.find(view=>view.loadingError)?.loadingError
    if(readError!==undefined&&readError!==null)this.messageState.value=`恢复记录已确认，列表回读失败：${failure(readError)}`
  }
}
