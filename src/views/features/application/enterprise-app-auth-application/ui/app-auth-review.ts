/**
 * @module app:views/features/application/enterprise-app-auth-application/ui/app-auth-review
 * 职责：承接单次 C06D 审核工具的原记录选择、按键读回、审核决定和撤销未提交意见。
 * 边界：列表只提供展示和原行读取证明，查询审核详情、编辑和提交全部沿独立审核 DataView。
 * AI用途：接入审核规则回调时复用这一能力，保持原记录、会话与操作结果的归属。
 */
import {ref, shallowRef, toRaw} from 'vue'
import {isDataRow, type DataRow, type DataView} from '@spark-appworks/spark-data'
import {commitAppAuthRecord, formatRequestedAt, readAppAuthSession} from '../model/enterprise-app-auth-application-model'

/** Single-call bindings supplied by the native review entry after it resolves both formal views. */
type ReviewOptions = {
  /** Original list view for finding the selected request and retaining its read proof. */
  list: DataView
  /** Record-scoped view for reading the formal request and saving authorized decision fields. */
  audit: DataView
  /** Confirm that this review tool still belongs to the authorized page invocation. */
  isCurrent: () => boolean
  /** Present the business message after the original save receipt confirms the decision. */
  showSuccess: (message: string) => void
}
type ReviewRecord = {
  id: string | number
  publisher: string
  listRow: DataRow
  assertList: () => void
  read?: {row: DataRow; assertCurrent: () => void; editComment: boolean; originalComment: unknown}
}

const pendingScopeFields = ['auth_status', 'source_ent', 'request_type'] as const

function isPendingRequest(view: DataView, row: DataRow, publisher: unknown): publisher is string {
  return typeof publisher === 'string' && publisher !== ''
    && pendingScopeFields.every(field => view.fieldAccess(row, field).read === 'visible')
    && row['auth_status'] === 'PENDING' && row['source_ent'] === publisher && row['request_type'] === 'REQUEST'
}

/** Preserve the original list and audit query proofs through the user's review decision. */
export function createAppAuthReview({list, audit, isCurrent, showSuccess}: ReviewOptions) {
  const active = shallowRef<ReviewRecord>()
  const loading = ref(false), ready = ref(false), busy = ref(false), error = ref('')

  const canAudit = (row: unknown) => isDataRow(row) && listAccess(toRaw(row))
  const listAccess = (row: DataRow) => list.fieldAccess(row, 'auth_status').write === 'allowed'
    && isPendingRequest(list, row, list.queryContext['entShortName'])
  const canWriteDecision = (row: DataRow) => audit.fieldAccess(row, 'auth_status').write === 'allowed'
    && audit.fieldAccess(row, 'operator').write === 'allowed'
  const owns = (record: ReviewRecord) => isCurrent() && active.value === record

  async function open(row: unknown): Promise<void> {
    if (active.value || !isCurrent() || !isDataRow(row)) return
    error.value = ''
    const original = toRaw(row)
    const id = list.getPkKey(original)
    let record: ReviewRecord | undefined
    try {
      if (id === undefined || id === '') throw new Error('缺少申请记录')
      const publisher = list.queryContext['entShortName']
      if (!isPendingRequest(list, original, publisher) || list.fieldAccess(original, 'auth_status').write !== 'allowed') {
        throw new Error('无权审核该申请')
      }
      record = {id, publisher, listRow: original, assertList: list.captureReadRow(original, [list.primaryKey, ...pendingScopeFields])}
      active.value = record
      loading.value = true
      if (audit.hasEditingChanges() || audit.dirtyTracking.hasPendingChanges() || audit.hasUnconfirmedSave) {
        throw new Error('上一次审核尚未提交或取消')
      }
      audit.queryContext = {...audit.queryContext, recordId: String(id), entShortName: publisher}
      const result = await audit.requestRefresh({defer: false})
      if (!owns(record)) return
      record.assertList()
      if (audit.loadingError) throw audit.loadingError
      const auditRow = audit.rows.length === 1 ? audit.rows[0] : undefined
      if (result.refreshStatus !== 'read' || !auditRow || audit.getPkKey(auditRow) !== id || !isPendingRequest(audit, auditRow, publisher)) {
        throw new Error('未读取到当前待审范围内唯一可读的原申请记录')
      }
      if (!canWriteDecision(auditRow)) throw new Error('无权审核该申请')
      const editComment = audit.fieldAccess(auditRow, 'review_comment').write === 'allowed'
        && audit.fieldAccess(auditRow, 'review_comment').read === 'visible'
      const assertCurrent = audit.captureReadRow(auditRow, [audit.primaryKey, ...pendingScopeFields])
      record.read = {row: auditRow, assertCurrent, editComment, originalComment: editComment ? auditRow['review_comment'] : undefined}
      if (editComment) audit.updateEditingValue(id, 'review_comment', '')
      ready.value = true
    } catch (cause) {
      if (isCurrent() && (!record || owns(record))) error.value = `申请读取失败：${cause instanceof Error ? cause.message : String(cause)}`
    } finally {
      if (record && owns(record)) loading.value = false
    }
  }

  async function decide(status: unknown): Promise<void> {
    const record = active.value, read = record?.read
    if (!record || !read || !owns(record) || !ready.value || busy.value || audit.hasUnconfirmedSave) return
    if (status !== 'INITIALIZING' && status !== 'REJECTED') return
    busy.value = true
    error.value = ''
    try {
      record.assertList()
      read.assertCurrent()
      if (!listAccess(record.listRow) || !isPendingRequest(audit, read.row, record.publisher) || !canWriteDecision(read.row)) {
        throw new Error('无权审核该申请')
      }
      const {userId} = readAppAuthSession()
      if (read.editComment) {
        if (audit.fieldAccess(read.row, 'review_comment').write !== 'allowed') throw new Error('无权修改审核意见')
        const input = audit.getEditingRow(record.id)?.['review_comment']
        const comment = status === 'REJECTED' && typeof input === 'string' ? input.trim() : ''
        audit.updateEditingValue(record.id, 'review_comment', comment || read.originalComment)
      }
      audit.updateEditingValue(record.id, 'auth_status', status)
      audit.updateEditingValue(record.id, 'operator', userId)
      await commitAppAuthRecord(audit, record.id)
      if (!owns(record)) return
      showSuccess(status === 'INITIALIZING' ? '已批准，正在初始化…' : '已拒绝申请')
      reset()
      await list.refresh()
    } catch (cause) {
      if (owns(record)) error.value = cause instanceof Error ? cause.message : String(cause)
    } finally {
      busy.value = false
    }
  }

  function reset(): void {
    active.value = undefined
    ready.value = false
    loading.value = false
    error.value = ''
  }

  function close(): void {
    const record = active.value
    if (!record || !owns(record) || busy.value) return
    if (record.read && !audit.hasUnconfirmedSaveFor([record.id])) audit.discardPendingChanges([record.id])
    reset()
    void list.refresh()
  }

  return {formatRequestedAt, canAudit, open, close, decide, state: () => ({
    recordId: active.value?.id, ready: ready.value, loading: loading.value, busy: busy.value,
    error: error.value, unconfirmed: audit.hasUnconfirmedSave,
  })}
}
