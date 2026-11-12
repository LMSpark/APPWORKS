/**
 * @module app:lowcode/resources/structured-config/dimension-source/ledger-guard
 * 职责：判断来源绑定是否已被正式维度结果（07D2 场景 Bil_Dimension_Set.source_binding_id）引用，供绑定保存前拒绝变更受保护字段。
 * 边界：运行时经数据空间设计 API 解析 07D2 正式模型，按 ledger-views.json 装配独立 DataSet 查询后销毁；任何读取失败、
 *   字段不可读或结果无法完整核验都抛错（由调用方拒绝保存），不当作“无记录”。不写入台账。
 * AI用途：调整台账引用判定时在此修改；绑定编辑器只消费 hasRecords 的布尔结果。
 */
import type {DataSet} from '@spark-appworks/spark-data'
import {DATA_SPACE_DESIGN_FORM_KEY, type DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import type {LowcodeDataSpaceAssembler} from '../../../data-space/lowcode-data-space-assembler'
import ledgerViewsSource from '../../../../../config/pages/structured-config/dimension-design/ledger-views.json?raw'
import {assertReadable, bit, refreshView, requireView, text} from './view-support'

const LEDGER_TABLE = 'Bil_Dimension_Set'
const LEDGER_VIEW = 'bySourceBinding'

function ledgerDocument(source: string): Record<string, unknown> & {scenarioId: string; tables: Record<string, Record<string, unknown>>} {
  const parsed: unknown = JSON.parse(source)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('维度台账视图配置不是对象')
  const scenarioId: unknown = Reflect.get(parsed, 'scenarioId')
  const tables: unknown = Reflect.get(parsed, 'tables')
  const table: unknown = typeof tables === 'object' && tables !== null ? Reflect.get(tables, LEDGER_TABLE) : undefined
  if (typeof scenarioId !== 'string' || !scenarioId || typeof table !== 'object' || table === null) throw new Error('维度台账视图配置缺少场景或台账表')
  return {...parsed, scenarioId, tables: {[LEDGER_TABLE]: {...table}}}
}

/** 维度台账引用守卫：一次查询装配一个独立 DataSet，结束即销毁。 */
export class DimensionSourceLedgerGuard {
  readonly #design: Pick<DataSpaceDesignApi, 'readModel' | 'readSpaceDefinition'>
  readonly #assembler: LowcodeDataSpaceAssembler
  readonly #source: string

  constructor(design: Pick<DataSpaceDesignApi, 'readModel' | 'readSpaceDefinition'>, assembler: LowcodeDataSpaceAssembler, source = ledgerViewsSource) {
    this.#design = design
    this.#assembler = assembler
    this.#source = source
  }

  /** 来源绑定存在未删除的正式维度结果时返回 true；无法完整核验时抛错。 */
  async hasRecords(bindingId: string, assertCurrent: () => void): Promise<boolean> {
    if (!bindingId.trim()) throw new Error('维度台账核验缺少来源绑定 id')
    const document = ledgerDocument(this.#source)
    const {scenarioId} = document
    const input = {designScenarioId: DATA_SPACE_DESIGN_FORM_KEY, dataSpaceId: scenarioId, assertCurrent}
    const [space, model] = await Promise.all([this.#design.readSpaceDefinition(input), this.#design.readModel({...input, metaName: LEDGER_TABLE})])
    assertCurrent()
    const table = {...document.tables[LEDGER_TABLE], modelBinding: {modelId: model.id, modelName: LEDGER_TABLE}}
    const config = new ScenarioViewConfig(scenarioId, JSON.stringify({...document, tables: {[LEDGER_TABLE]: table}}))
    let dataSet: DataSet | undefined
    try {
      dataSet = this.#assembler.assemble({config, space, models: [model], relations: []}).dataSet
      const view = requireView(dataSet, LEDGER_TABLE, LEDGER_VIEW)
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
    } finally {
      dataSet?.destroy()
    }
  }
}
