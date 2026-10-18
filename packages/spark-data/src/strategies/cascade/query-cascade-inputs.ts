/**
 * @module @spark-appworks/spark-data:strategies/cascade/query-cascade-inputs
 * 职责：查询级联输入的形状校验、原生值解析和原子配置应用。
 * 边界：复用值绑定及DataViewQuery，不发送请求，不持有权限或页面草稿。
 * AI用途：通过viewCascades.inputBindings配置多父值查询，不在业务页拼查询参数。
 */
import {isRecord} from '@spark-appworks/spark-utils'
import type {DataSet} from '../../dataset'
import type {DataView} from '../../data-view'
import type {DataViewCascadeInputBinding, DataViewQueryCascade, DataViewQueryContext} from '../../types'
import {DataViewQuery} from '../../query/data-view-query'
import {DataViewCascadeValueBinding} from './cascade-value-binding'

/** 一次解析后的查询输入快照；只在级联执行期间使用，不写入pagedata。 */
type InputValue = Readonly<{
  /** 受输入绑定合同约束的目标属性。 */
  target: DataViewCascadeInputBinding['target']
  /** 经值权限与显式解码后的原生值；undefined表示撤销该属性。 */
  value: unknown
}>
/** 配置文件、DataSet及请求执行共用的查询输入合同。 */
export class DataViewQueryCascadeInputs {
  /** 查询参数绑定的完整目标目录；配置编辑器与解析器共用，不接受权限或任意对象路径。 */
  static readonly targets: ReadonlyArray<DataViewCascadeInputBinding['target']> = Object.freeze([
    'queryContext', 'pageSize', 'queryConfig.outputType', 'queryConfig.allPages', 'queryConfig.maxRows',
    'queryConfig.tree.keyField', 'queryConfig.tree.parentField', 'queryConfig.tree.nodeId',
    'queryConfig.tree.hasChildrenField', 'queryConfig.tree.mode',
  ])
  /** 校验可选启用条件；条件读取仍经过统一值与数据权限边界。 */
  static parseWhen(input: unknown): NonNullable<DataViewQueryCascade['when']> {
    if (input === undefined) return []
    if (!Array.isArray(input) || !input.length || input.some(item => !isRecord(item)
      || Object.keys(item).some(key => !['field', 'equals'].includes(key))
      || typeof item['field'] !== 'string' || !item['field'].trim()
      || !(item['equals'] === null || typeof item['equals'] === 'string' || typeof item['equals'] === 'boolean'
        || typeof item['equals'] === 'number' && Number.isFinite(item['equals'])))) {
      throw new Error('QUERY_CASCADE_INPUT: when必须是非空字段条件数组')
    }
    return input as NonNullable<DataViewQueryCascade['when']>
  }

  /** 判断父值条件；不满足或尚未就绪时不查询子视图。 */
  static enabled(dataSet: DataSet, cascade: DataViewQueryCascade): boolean {
    return this.parseWhen(cascade.when).every(condition => {
      const values = DataViewCascadeValueBinding.inputs(dataSet, [{tableName: cascade.parentTable,
        viewId: cascade.parentViewId, field: condition.field}])
      return values !== undefined && Object.is(values[0], condition.equals)
    })
  }

  /** 查询过滤绑定由文件解析与运行装配共用，不接受未实现的操作符。 */
  static parseFilters(input: unknown): DataViewQueryCascade['filterBindings'] {
    if (!Array.isArray(input) || input.some(item => !isRecord(item)
      || Object.keys(item).some(key => !['sourceField', 'targetField', 'operator', 'omitEmpty'].includes(key))
      || typeof item['targetField'] !== 'string' || !item['targetField'].trim()
      || item['sourceField'] !== undefined && (typeof item['sourceField'] !== 'string' || !item['sourceField'].trim())
      || item['operator'] !== undefined && (typeof item['operator'] !== 'string' || !['eq', 'in', 'contains'].includes(item['operator']))
      || item['omitEmpty'] !== undefined && typeof item['omitEmpty'] !== 'boolean')) {
      throw new Error('QUERY_CASCADE_INPUT: filterBindings格式无效')
    }
    return input as DataViewQueryCascade['filterBindings']
  }
  /** 校验形状、唯一目标和条件；无输入绑定时返回空集合。 */
  static parse(input: unknown): readonly DataViewCascadeInputBinding[] {
    if (input === undefined) return []
    if (!Array.isArray(input) || input.length === 0) throw new Error('QUERY_CASCADE_INPUT: inputBindings必须是非空数组')
    const seen = new Set<string>()
    for (const binding of input) {
      if (!isRecord(binding) || Object.keys(binding).some(key => !['sourceField', 'target', 'format', 'omitEmpty', 'when'].includes(key))
        || typeof binding['target'] !== 'string' || !this.targets.some(target => target === binding['target'])
        || (binding['sourceField'] !== undefined && (typeof binding['sourceField'] !== 'string' || !binding['sourceField'].trim()))
        || (binding['format'] !== undefined && (binding['format'] !== 'json' || binding['target'] !== 'queryContext'))
        || (binding['omitEmpty'] !== undefined && typeof binding['omitEmpty'] !== 'boolean')) {
        throw new Error('QUERY_CASCADE_INPUT: 输入绑定格式无效')
      }
      if (seen.has(binding['target'])) throw new Error(`QUERY_CASCADE_INPUT: 重复目标 ${binding['target']}`)
      seen.add(binding['target'])
      const when = binding['when']
      if (when !== undefined && (!isRecord(when) || Object.keys(when).some(key => !['field', 'equals'].includes(key))
        || typeof when['field'] !== 'string' || !when['field'].trim()
        || !(when['equals'] === null || typeof when['equals'] === 'string' || typeof when['equals'] === 'boolean'
          || (typeof when['equals'] === 'number' && Number.isFinite(when['equals']))))) {
        throw new Error('QUERY_CASCADE_INPUT: when必须声明字段和值')
      }
    }
    return input as readonly DataViewCascadeInputBinding[]
  }

  /** 同一子视图的同一输入只能有一个定义来源，禁止顺序覆盖。 */
  static validateAll(cascades: readonly unknown[]): void {
    const seen = new Set<string>()
    for (const cascade of cascades) {
      if (!isRecord(cascade)) throw new Error('QUERY_CASCADE_INPUT: 级联必须是对象')
      if (cascade['kind'] === 'field') continue
      for (const binding of this.parse(cascade['inputBindings'])) {
        const key = JSON.stringify([cascade['childTable'], cascade['childViewId'], binding.target])
        if (seen.has(key)) throw new Error(`QUERY_CASCADE_INPUT: 重复目标 ${key}`)
        seen.add(key)
      }
    }
  }

  /** 只读取统一值边界；条件关闭时不读取已失效的选项值。null表示父输入尚未就绪。 */
  static read(dataSet: DataSet, cascade: DataViewQueryCascade): readonly InputValue[] | null {
    if (!this.enabled(dataSet, cascade)) return null
    const result: InputValue[] = []
    const read = (field?: string) => DataViewCascadeValueBinding.inputs(dataSet, [{
      tableName: cascade.parentTable, viewId: cascade.parentViewId, ...(field === undefined ? {} : {field}),
    }])
    for (const binding of this.parse(cascade.inputBindings)) {
      if (binding.when) {
        const condition = read(binding.when.field)
        if (!condition) return null
        if (!Object.is(condition[0], binding.when.equals)) {result.push({target: binding.target, value: undefined}); continue}
      }
      const input = read(binding.sourceField)
      if (!input) return null
      let value = input[0]
      if (binding.omitEmpty && (value === '' || value === null)) value = undefined
      if (binding.format === 'json' && value !== undefined) {
        if (typeof value !== 'string') throw new Error('QUERY_CASCADE_INPUT: JSON输入必须是文本')
        try {value = JSON.parse(value)} catch {throw new Error('QUERY_CASCADE_INPUT: 调用参数必须是合法JSON对象')}
      }
      result.push({target: binding.target, value: structuredClone(value)})
    }
    return result
  }

  /** 全部输入校验通过后才修改活动配置；未绑定配置保留，禁用属性删除。 */
  static apply(view: DataView, inputs: readonly InputValue[], contextDefaults: DataViewQueryContext): void {
    const config: Record<string, unknown> = {...view.queryConfig}
    const tree: Record<string, unknown> = {...view.queryConfig.tree}
    let hasTreeBinding = false, context = view.queryContext, pageSize = view.pageSize
    for (const input of inputs) {
      if (input.target === 'queryContext') {
        if (input.value !== undefined && !isRecord(input.value)) throw new Error('QUERY_CASCADE_INPUT: queryContext必须是JSON对象')
        context = structuredClone({...contextDefaults, ...input.value})
      } else if (input.target === 'pageSize') {
        if (typeof input.value !== 'number' || !Number.isSafeInteger(input.value) || input.value < 1 || input.value > 1000) {
          throw new Error('QUERY_CASCADE_INPUT: pageSize必须为1至1000的整数')
        }
        pageSize = input.value
      } else {
        const path = input.target.split('.')
        const object = path[1] === 'tree' ? tree : config
        const key = path.at(-1)
        if (!key) throw new Error('QUERY_CASCADE_INPUT: 目标路径无效')
        if (path[1] === 'tree') hasTreeBinding = true
        if (input.value === undefined) Reflect.deleteProperty(object, key)
        else object[key] = input.value
      }
    }
    if (hasTreeBinding) {
      if (Object.keys(tree).length) config['tree'] = tree
      else delete config['tree']
    }
    const parsed = DataViewQuery.parse(config)
    DataViewQuery.validateFields(parsed, new Set(view.dataTable?.columns.filter(column => !column.isComputed
      && !column.computeExpression && column.name !== '_pk').map(column => column.name)))
    view.queryConfig = parsed
    view.queryContext = context
    view.pageSize = pageSize
    view.page = 1
  }
}
