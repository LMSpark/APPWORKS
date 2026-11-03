/**
 * @module @spark-appworks/spark-data:query/data-view-parent-result
 * 职责：定位显式父结果依赖并等待原父查询，验证同实例模型与依赖无环。
 * 边界：不读取存储、不复制业务行或授权、不发第二套请求。
 * AI用途：具名子视图沿原查询owner消费父行的正式子集合。
 */
import type {DataView} from '../data-view'
import {DataViewCascadeValueBinding} from '../strategies/cascade/cascade-value-binding'
import type {DataViewFieldProjection, QueryParams, ViewMetadata} from '../types'
import {RequestState} from '../types'
import {parseDataViewKey, resolveDataViewKey} from '../core/data-view-key'

/** 父结果来源的公共定位与等待合同，订阅仍归CascadeDelegate生命周期。 */
export class DataViewParentResult {
  /** 解析同DataSet完整父键，并同时检查现有查询级联形成的依赖环。 */
  static resolve(view: DataView, config: NonNullable<ViewMetadata['queryConfig']> = view.queryConfig): DataView | undefined {
    const binding = config.parentResult, dataSet = view.dataSet
    if (!binding) return undefined
    if (!dataSet) throw new Error('DATA_VIEW_PARENT_SCOPE: 父视图缺少DataSet')
    if (dataSet.tables[view.tableName] !== view.dataTable || view.dataTable.getView(view.viewId) !== view
      || parseDataViewKey(binding.dataViewKey)?.scope !== dataSet.scenarioId) throw new Error('DATA_VIEW_PARENT_SCOPE: 父视图必须属于同一DataSet')
    const parent = resolveDataViewKey(binding.dataViewKey, dataSet)
    if (!parent || parent.destroyed || parent.dataSet !== dataSet) throw new Error('DATA_VIEW_PARENT_SOURCE: 正式父视图不存在或已释放')
    if ((view.dataTable.modelBinding?.modelName ?? view.tableName) !== binding.childModelName) throw new Error('DATA_VIEW_PARENT_MODEL: 子模型身份不一致')
    const visiting = new Set<DataView>(), complete = new Set<DataView>()
    const visit = (current: DataView): void => {
      if (visiting.has(current)) throw new Error('DATA_VIEW_PARENT_CYCLE: 查询依赖循环')
      if (complete.has(current)) return
      visiting.add(current)
      const source = (current === view ? config : current.queryConfig).parentResult
      if (source) {
        if (parseDataViewKey(source.dataViewKey)?.scope !== dataSet.scenarioId) throw new Error('DATA_VIEW_PARENT_SCOPE: 父视图必须属于同一DataSet')
        const upstream = resolveDataViewKey(source.dataViewKey, dataSet)
        if (!upstream) throw new Error('DATA_VIEW_PARENT_SOURCE: 父视图不存在')
        visit(upstream)
      }
      for (const cascade of dataSet.getParentCascades(current.tableName, current.viewId)) {
        const upstream = dataSet.getView(cascade.parentTable, cascade.parentViewId)
        if (upstream) visit(upstream)
      }
      visiting.delete(current); complete.add(current)
    }
    visit(view)
    return parent
  }

  /** 子来源不能夹带未执行的独立远程过滤、排序、树或聚合。 */
  static validateRequest(view: DataView, params: QueryParams): void {
    for (const key of ['filter', 'sort', 'fields', 'tree', 'children', 'allPages', 'outputType', 'maxRows', 'distinct', 'sourceInputMode']) {
      if (params[key] !== undefined) throw new Error(`DATA_VIEW_PARENT_QUERY: parentResult 与 ${key} 冲突`)
    }
    if (Object.keys(view.queryContext).length > 0 || params.context !== undefined && Object.keys(params.context).length > 0) throw new Error('DATA_VIEW_PARENT_QUERY: 子结果不接受独立查询输入')
    if (params.projection !== undefined && !DataViewCascadeValueBinding.equal(params.projection, view.fieldProjection)) throw new Error('DATA_VIEW_PARENT_QUERY: 子结果投影由父计划声明')
    if (view.dataSet?.getParentCascades(view.tableName, view.viewId).length) throw new Error('DATA_VIEW_PARENT_QUERY: 子结果不叠加独立查询级联')
    if (view.filterExpression !== undefined || view.sortExpression !== undefined || view.treeConfig !== undefined
      || Object.keys(view.aggregates).length > 0) throw new Error('DATA_VIEW_PARENT_QUERY: 子结果不能另设远程查询')
  }

  /** 只允许正式模型默认绑定投影；结果列与子过滤由父计划确定，比较配置不依赖对象属性顺序。 */
  static validateProjection(view: DataView, expected: readonly DataViewFieldProjection[]): void {
    if (!DataViewCascadeValueBinding.equal(view.fieldProjection, expected)) throw new Error('DATA_VIEW_PARENT_QUERY: 子结果投影须在父计划声明')
  }

  /** 等待已存在的父查询；Idle按原依赖请求一次，Failed不自动重试。 */
  static async request(view: DataView): Promise<void> {
    const parent = this.resolve(view)
    if (!parent) return
    if (parent.requestState === RequestState.Idle) await parent.requestData()
    if (parent.requestState === RequestState.Preparing || parent.requestState === RequestState.Loading) {
      await new Promise<void>((resolve, reject) => {
        const finish = () => {
          if (!parent.destroyed && (parent.requestState === RequestState.Preparing || parent.requestState === RequestState.Loading)) return
          parent.events.off('requestStateChanged', finish); parent.events.off('disposing', finish)
          if (parent.destroyed || parent.requestState !== RequestState.Loaded) reject(new Error('DATA_VIEW_PARENT_SOURCE: 父查询失败或已释放'))
          else resolve()
        }
        parent.events.on('requestStateChanged', finish); parent.events.on('disposing', finish); finish()
      })
    }
    if (parent.destroyed || parent.requestState !== RequestState.Loaded) throw new Error('DATA_VIEW_PARENT_SOURCE: 父查询未成功，不能读取旧子结果')
  }
}
