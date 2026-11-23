/**
 * @module app:lowcode/resources/semi-structured/pdf-inspect/execution-rule
 * 职责：从本次 DataSet 读取唯一启用的正式核验规则。
 * 边界：只验证正式字段与读取证明，规则执行由原任务服务完成。
 * AI用途：在选取 PDF 文件和派发任务前捕获同一规则的可读证据。
 */
import type {DataSet} from '@spark-appworks/spark-data'
import {PDF_INSPECTION_SCENARIO_ID} from './runtime-bindings'
import {validatePdfRuleConfig} from './rule-config'

/** 返回在上传和任务提交前可重复调用的原读取守卫。 */
export async function readPdfExecutionRule(dataSet: DataSet, ruleId: string, assertCurrent: () => void): Promise<() => void> {
  assertCurrent()
  const view = dataSet.getView('Base_FileInspectConfig', 'executionRule')
  if (dataSet.scenarioId !== PDF_INSPECTION_SCENARIO_ID || !/^[-A-Za-z0-9_]{1,128}$/u.test(ruleId) ||
    view?.dataTable?.modelBinding?.modelName !== 'Base_FileInspectConfig' || view.hasEditingChanges()) {
    throw Error('PDF_EXECUTION_RULE: 当前实例缺少正式执行规则视图')
  }
  const assertScope = () => {
    assertCurrent()
    if (dataSet.destroyed || view.destroyed || dataSet.getView('Base_FileInspectConfig', 'executionRule') !== view ||
      view.queryContext['ruleId'] !== ruleId || view.hasEditingChanges() || view.loadingError) {
      throw Error('PDF_EXECUTION_RULE_STALE: 原规则查询已失效')
    }
  }
  view.queryContext = {ruleId}
  await view.refresh()
  assertScope()
  const row = view.rows[0]
  if (!row || view.countReported !== true || view.total !== 1 || view.rows.length !== 1 || view.nextPageAvailable === true ||
    view.getPkKey(row) !== ruleId || row['id'] !== ruleId) {
    throw Error('PDF_EXECUTION_RULE: 未读取到唯一正式规则')
  }
  const assertRead = view.captureReadResult()
  const assertRow = view.captureReadRow(row, ['id', 'enabled', 'rule_config'])
  if (row['enabled'] !== 1) throw Error('PDF_EXECUTION_RULE: 规则未启用')
  validatePdfRuleConfig(row['rule_config'])
  return () => {assertScope(); assertRead(); assertRow()}
}
