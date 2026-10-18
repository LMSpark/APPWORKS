/**
 * @module @spark-appworks/spark-project-model:scenario/data-space-reference-layout-resource
 * 职责：把旧SysForm布局文件作为独立只读资源交给原生DataView。
 * 边界：不创建表、不持久化旧图，不把旧图混入原生pagedata布局。
 * AI用途：按正式元空间声明查询参考布局；布局转换及原生保存由对应配置资源承接。
 */
import {DataViewLocalQuery, type DataColumn, type DataView, type QueryParams} from '@spark-appworks/spark-data'

/** 复用原生DataView查询owner协议，不另造结果或查询状态合同。 */
type Executor = Parameters<DataView['bindQueryExecutor']>[0]
/** 已授权的旧文件读取适配；404由原存储owner转为null，其他失败必须抛出。 */
type ReferenceLayoutOptions = Readonly<{
  /** 承载只读资源的元数据空间身份。 */
  metadataScenarioId: string
  /** 每次异步读取前后核对当前应用与会话。 */
  assertCurrent(): void
  /** 只按目标空间ID读取其旧布局原文，不允许调用方传入任意路径。 */
  read(dataSpaceId: string): Promise<string | null>
}>

/** 旧图的独立只读查询owner；无save或来源采用能力。 */
export class DataSpaceReferenceLayoutResource {
  /** 正式元空间中的资源模型名称。 */
  static readonly tableName = 'DataSpaceReferenceLayout'
  /** 旧SysForm文件身份，与pagedata:layout分别查询、分别解释。 */
  static readonly resourceId = 'reference:layout'

  /** 与其他文件资源一样显式提供目标输入，不用消费方场景身份猜测目标。 */
  static queryParameters(): ReadonlyArray<Pick<DataColumn, 'name' | 'type' | 'label' | 'required'>> {
    return [{name: 'dataSpaceId', type: 'string', label: '目标数据空间ID', required: true}]
  }

  /** 绑定实际应用存储及元空间身份；声明本身不执行I/O。 */
  constructor(private readonly options: ReferenceLayoutOptions) {}

  private assertView(view: DataView): void {
    this.options.assertCurrent()
    if (view.destroyed || view.dataSet?.destroyed || view.dataSet?.scenarioId !== this.options.metadataScenarioId
      || view.tableName !== DataSpaceReferenceLayoutResource.tableName || view.dataTable?.modelBinding
      || view.dataTable?.resourceType !== 'file' || view.dataTable.resourceId !== DataSpaceReferenceLayoutResource.resourceId) {
      throw new Error('DATA_SPACE_REFERENCE_IDENTITY: 参考布局视图身份无效')
    }
  }

  /** 读取单个目标原文，缺文件返回content:null；过滤/排序/投影仍由统一本地查询能力执行。 */
  async executeQuery(view: DataView, params: QueryParams): Promise<Awaited<ReturnType<Executor['executeQuery']>>> {
    this.assertView(view)
    const target = params.context?.['dataSpaceId']
    if (typeof target !== 'string' || target.length === 0 || target.trim() !== target || target === '.' || target === '..'
      || /[\\/%\u0000-\u001f\u007f]/.test(target)) throw new Error('DATA_SPACE_REFERENCE_TARGET: 缺少有效目标数据空间ID')
    const content = await this.options.read(target)
    this.assertView(view)
    const selected = DataViewLocalQuery.select({rows: [{dataSetId: target, content}], fields: new Set(['dataSetId', 'content']),
      primaryKeys: ['dataSetId'], params})
    const guard = () => {
      this.assertView(view)
      if (view.queryContext['dataSpaceId'] !== target) throw new Error('DATA_SPACE_REFERENCE_TARGET: 参考布局目标已变化')
    }
    return {
      rows: selected.rows, total: selected.total, rowKey: row => row['dataSetId'], resultPrimaryKey: 'dataSetId',
      assertIdentity: identity => {
        guard()
        if (identity.scenarioId !== this.options.metadataScenarioId || identity.metaName !== DataSpaceReferenceLayoutResource.tableName
          || identity.resource?.resourceType !== 'file' || identity.resource.resourceId !== DataSpaceReferenceLayoutResource.resourceId) {
          throw new Error('DATA_SPACE_REFERENCE_IDENTITY: 参考布局查询身份不匹配')
        }
      },
      fieldAccess: (key, field) => {
        guard()
        const visible = key === target && selected.output.has(field)
        return {read: visible ? 'visible' : 'invisible', write: 'denied', component: visible ? 'readonly' : 'hidden', required: false, writeMode: 'readonly'}
      },
      readFieldAccess: (_row, field) => {guard(); return selected.output.has(field) ? 'visible' : 'invisible'},
      addActionState: () => 'disabled', editActionState: () => 'disabled', deleteActionState: () => 'disabled', createChildActionState: () => 'disabled',
      viewActionState: (key, available) => {guard(); return key === target && available !== false ? 'enabled' : 'disabled'},
    }
  }
}
