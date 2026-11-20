/**
 * @module @spark-appworks/spark-project-model:scenario/scenario-submission-journal
 * 职责：保存文件owner在派发前捕获的原文和写前基线，供重开后只读核验。
 * 边界：本地恢复审计，不是服务器请求回执、权限缓存或业务草稿真源；不重放写入。
 */
import {ScenarioViewConfig} from './scenario-view-config'
import {isRecord} from '@spark-appworks/spark-utils'

/** 由宿主按租户、用户、应用划分的存储，不包含凭据。 */
export type ScenarioSubmissionStorage = Readonly<{length: number; key(index: number): string | null;
  getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void}>
/** 本地attempt身份只关联原捕获，不能当成服务端幂等键。 */
export type ScenarioSubmissionCapture = Readonly<{attemptId: string; scenarioId: string; text: string; baseline: string | null}>
/** 文件存储责任层的恢复记录；完成记录保留审计，未决记录不能被下一提交覆盖。 */
export type ScenarioSubmissionJournal = Readonly<{
  read(scenarioId: string): ScenarioSubmissionCapture | null
  begin(scenarioId: string, text: string, baseline: string | null): ScenarioSubmissionCapture
  settle(capture: ScenarioSubmissionCapture, outcome: 'confirmed' | 'not-applied'): void
}>

/** 宿主提供稳定的资源拥有者分区；不使用登录token或易变会话代次作为持久身份。 */
export function createScenarioSubmissionJournal(storage: ScenarioSubmissionStorage, owner: string): ScenarioSubmissionJournal {
  if (!owner.trim()) throw Error('SCENARIO_SUBMISSION_OWNER: 缺少恢复记录所属身份')
  const prefix = (id: string) => `${JSON.stringify(['spark:scenario-submission:v1', owner, id])}:`
  const auditPrefix = `${JSON.stringify(['spark:scenario-submission-audit:v1', owner])}:`
  const keys = (startsWith: string) => Array.from({length: storage.length}, (_, index) => storage.key(index))
    .filter((name): name is string => name?.startsWith(startsWith) === true)
  const key = (capture: ScenarioSubmissionCapture) => `${prefix(capture.scenarioId)}${capture.attemptId}`
  const load = (scenarioId: string, storageKey: string): ScenarioSubmissionCapture | null => {
    const text = storage.getItem(storageKey)
    if (text === null) return null
    const value: unknown = JSON.parse(text)
    if (!isRecord(value)) throw Error('SCENARIO_SUBMISSION_INVALID: 恢复记录无效')
    const row = value
    if (row['scenarioId'] !== scenarioId || typeof row['attemptId'] !== 'string' || !row['attemptId']
      || typeof row['text'] !== 'string' || row['baseline'] !== null && typeof row['baseline'] !== 'string'
      || row['state'] !== 'unknown'
      || storageKey !== `${prefix(scenarioId)}${row['attemptId']}`) throw Error('SCENARIO_SUBMISSION_INVALID: 恢复记录身份或内容无效')
    new ScenarioViewConfig(scenarioId, row['text'])
    if (typeof row['baseline'] === 'string') new ScenarioViewConfig(scenarioId, row['baseline'])
    return Object.freeze({attemptId: row['attemptId'], scenarioId, text: row['text'], baseline: row['baseline']})
  }
  const pending = (scenarioId: string) => keys(prefix(scenarioId)).map(name => load(scenarioId, name))
    .filter((row): row is ScenarioSubmissionCapture => row !== null)
  const settle = (capture: ScenarioSubmissionCapture, state: 'confirmed' | 'not-applied') => {
    const current = load(capture.scenarioId, key(capture))
    if (current?.attemptId !== capture.attemptId || current.text !== capture.text || current.baseline !== capture.baseline) {
      throw Error('SCENARIO_SUBMISSION_STALE: 不能结算另一笔文件捕获')
    }
    if (state === 'confirmed' && pending(capture.scenarioId).some(row => row.attemptId !== capture.attemptId)) {
      throw Error('SCENARIO_SUBMISSION_MULTIPLE: 另一笔捕获仍未知，不能自动确认当前文件')
    }
    // 仅结算记录可清理；未知原文在不同命名空间，绝不参与有界清理。
    const audits = keys(auditPrefix).sort()
    for (const audit of audits.slice(0, Math.max(0, audits.length - 19))) storage.removeItem(audit)
    storage.setItem(`${auditPrefix}${Date.now()}:${capture.attemptId}`, JSON.stringify({attemptId: capture.attemptId,
      scenarioId: capture.scenarioId, state, textLength: capture.text.length, baselineLength: capture.baseline?.length ?? null}))
    storage.removeItem(key(capture))
  }
  return {
    read: id => {
      const rows = pending(id)
      if (rows.length > 1) throw Error('SCENARIO_SUBMISSION_MULTIPLE: 多笔原捕获仍未知，保留全部记录且禁止自动核验')
      return rows[0] ?? null
    },
    begin: (scenarioId, text, baseline) => {
      if (pending(scenarioId).length) throw Error('SCENARIO_SUBMISSION_PENDING: 原文件提交仍未知，不能覆盖捕获')
      new ScenarioViewConfig(scenarioId, text)
      if (baseline !== null) new ScenarioViewConfig(scenarioId, baseline)
      const capture = Object.freeze({attemptId: crypto.randomUUID(), scenarioId, text, baseline})
      storage.setItem(key(capture), JSON.stringify({...capture, state: 'unknown'}))
      const active = pending(scenarioId)
      if (active.length !== 1 || active[0]?.attemptId !== capture.attemptId) {
        // 当前调用还未交还写入方，故仅本attempt可确认为未派发；其他捕获不得清除。
        settle(capture, 'not-applied')
        throw Error('SCENARIO_SUBMISSION_CONCURRENT: 捕获期间出现另一提交，当前提交未派发')
      }
      return capture
    },
    settle,
  }
}
