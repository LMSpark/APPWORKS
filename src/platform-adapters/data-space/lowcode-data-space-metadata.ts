/**
 * @module app:lowcode/data-space/lowcode-data-space-metadata
 * 职责：在元数据DataView接纳查询结果前核对目标归属，按工作区需求完整读取并合并在途请求。
 * 边界：数据、权限及请求状态由原 DataView 持有，不复制数据、不参与保存。
 * AI用途：设计器首屏读取空间和模型目录，其他工作区经设计会话按需读取字段或关系。
 */
import {RequestState, type DataSet, type DataView} from '@spark-appworks/spark-data'
import {isRecord} from '@spark-appworks/spark-utils'

/** 设计器元数据的按需读取；数据、权限及查询状态始终由原 DataView 持有。 */
export class LowcodeDataSpaceMetadata {
  /** 正式定义表；来源候选及模型工作区仍使用各自的命名视图。 */
  static readonly tables = ['Base_DataSet', 'Base_DataModel', 'Base_DataModel_Field', 'Base_DataModel_Relation'] as const
  readonly #pending = new Map<string, Promise<void>>()

  /** 绑定本次元数据实例的默认目录校验；错误目标不能替换原查询守卫，不复制结果或保存状态。 */
  constructor(private readonly dataSet: DataSet, private readonly targetId: string,
    private readonly assertCurrent: () => void) {
    for (const name of LowcodeDataSpaceMetadata.tables) {
      const view = dataSet.getView(name, 'default')
      if (view?.queryContext['dataSpaceId'] === targetId) view.validateQueryResult = result => this.validate(view, result)
    }
  }

  /** 仅查询指定且尚未完整读取的视图；合并本实例同一视图的在途读取，失败可显式重试。 */
  async load(names: ReadonlyArray<(typeof LowcodeDataSpaceMetadata.tables)[number]>): Promise<void> {
    const requested = [...new Set(names)]
    for (const name of requested) this.assertScope(this.dataSet.getView(name, 'default'))
    const results = await Promise.allSettled(requested.map(name => {
      const current = this.#pending.get(name)
      if (current) return current
      const pending = this.read(name).finally(() => this.#pending.delete(name))
      this.#pending.set(name, pending)
      return pending
    }))
    for (const result of results) if (result.status === 'rejected') throw result.reason
  }

  private assertScope(view: DataView | undefined): asserts view is DataView {
    this.assertCurrent()
    if (!view || this.dataSet.destroyed || view.destroyed || view !== this.dataSet.getView(view.tableName, 'default')
      || view.queryContext['dataSpaceId'] !== this.targetId) throw new Error('DATA_SPACE_METADATA_SCOPE: 元数据查询目标已变化')
    const ownerField = view.tableName === 'Base_DataSet' ? 'rowid' : 'dataSetId'
    if (!this.hasTargetFilter(view.filterExpression, ownerField)) {
      throw new Error(`DATA_SPACE_METADATA_FILTER: ${view.tableName} 缺少目标空间输入的必要范围过滤`)
    }
  }

  private hasTargetFilter(node: DataView['filterExpression'], ownerField: string): boolean {
    if (!node) return false
    if ('logic' in node) {
      return node.logic === 'and' ? node.filters.some(child => this.hasTargetFilter(child, ownerField))
        : node.filters.length > 0 && node.filters.every(child => this.hasTargetFilter(child, ownerField))
    }
    return node.field === ownerField && node.operator === 'eq' && isRecord(node.value)
      && node.value['Type'] === 'GetInputParam' && node.value['ParamName'] === 'dataSpaceId'
  }

  private validate(view: DataView, result?: Parameters<NonNullable<DataView['validateQueryResult']>>[0]): void {
    this.assertScope(view)
    const rows = result?.rows ?? view.rows, total = result?.total ?? view.total
    if (!result && (view.requestState !== RequestState.Loaded || rows.length !== total)) {
      throw new Error(`DATA_SPACE_METADATA_QUERY: ${view.tableName} 未完整读取`)
    }
    const ownerField = view.tableName === 'Base_DataSet' ? 'rowid' : 'dataSetId'
    if (view.tableName === 'Base_DataSet' && rows.length !== 1) throw new Error('DATA_SPACE_METADATA_TARGET: 目标空间未唯一返回')
    for (const row of rows) {
      const access = result ? result.fieldAccess(result.rowKey(row), ownerField) : view.fieldAccess(row, ownerField)
      if (access.read !== 'visible' || row[ownerField] !== this.targetId) {
        throw new Error(`DATA_SPACE_METADATA_SCOPE: ${view.tableName} 返回了目标外或不可核验的记录`)
      }
    }
  }

  private async read(name: (typeof LowcodeDataSpaceMetadata.tables)[number]): Promise<void> {
    this.assertCurrent()
    const view = this.dataSet.getView(name, 'default')
    this.assertScope(view)
    if (view.requestState === RequestState.Loaded && view.rows.length === view.total) {this.validate(view); return}
    const context = JSON.stringify(view.queryContext)
    const result = await view.loadFromServer({allPages: true})
    this.assertCurrent()
    if (JSON.stringify(view.queryContext) !== context) throw new Error('DATA_SPACE_METADATA_SCOPE: 元数据查询参数已变化')
    if (!result.success) throw new Error(`DATA_SPACE_METADATA_QUERY: ${name} 未完整读取`)
    this.validate(view)
  }
}
