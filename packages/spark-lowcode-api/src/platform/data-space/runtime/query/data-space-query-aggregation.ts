/**
 * @module @spark-appworks/spark-lowcode-api:platform/data-space/runtime/query/data-space-query-aggregation
 * 职责：校验既有ValueFun在GetData请求字段中的聚合适用范围。
 * 边界：复用单值函数解析；仅规范安全请求覆盖，不执行值函数、不改模型定义。
 */
import {isRecord} from '@spark-appworks/spark-utils'
import {getDataViewFilterFunctionDefinitions, type DataViewFilterFunctionContext, type DataViewFilterValueFunction} from '@spark-appworks/spark-data'
import type {DataSpaceDesignApi} from '../../design/data-space-design-api'
import {parseDataSpaceValueFunction} from '../protocol/data-space-value-function'

/** 查询聚合所需的正式字段身份及后端字段类型。 */
type DataSpaceAggregateField = Pick<ReturnType<typeof DataSpaceDesignApi.projectModel>['fields'][number], 'canonicalName' | 'name' | 'type'>

const functions = {Sum: 'SUM', Count: 'COUNT', Avg: 'AVERAGE', Min: 'MIN', Max: 'MAX'} as const

/** GetData安全聚合合同；名称与Java FunctionEnum及五种值函数子类一致。 */
export class DataSpaceQueryAggregation {
  /**
   * 请求字段位置的标准值函数编辑目录；仅提供本类可执行合同中的聚合。
   * @returns 覆盖共享目录的可用性，不执行函数、不改变正式模型或授予查询能力。
   */
  static editorContext(): DataViewFilterFunctionContext {
    return {definitions: getDataViewFilterFunctionDefinitions({}).map(definition => ({...definition,
      enabled: () => definition.type === 'GetGroupData' || Object.hasOwn(functions, definition.type)}))}
  }
  /** 校验分组标记；正整数表示参与分组，数值不代表优先级；0不代表清除整个模型的缺省分组。 */
  static group(value: unknown): number {
    if (value === undefined) return 0
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('SPARK_QUERY_GROUP: 分组必须是非负整数')
    return value
  }

  /**
   * 将视图JSON声明或已解析值函数规范为GetData安全聚合；空值表示不覆盖模型。
   * 仅允许当前正式字段自身，不能夹带跨表引用或任意表达式。Field由当前查询字段Name确定。
   * @param value valueFunction字符串或已解析的ValueFun对象。
   * @param field 正式输出字段；核对Name、输出名及后端计算/引用字段类型。
   */
  static normalize(value: unknown, field: DataSpaceAggregateField): DataViewFilterValueFunction | undefined {
    if (value === undefined || value === null || value === '') return undefined
    if (['引用', '计算字段'].includes(field.type)) throw new Error('SPARK_QUERY_AGGREGATE: 后端计算或引用字段尚不支持请求级聚合')
    const input = typeof value === 'string' ? parseDataSpaceValueFunction(value, field.name, field.canonicalName) : value
    if (!isRecord(input)) throw new Error('SPARK_QUERY_AGGREGATE: 聚合必须是值函数对象')
    const Type = input['Type']
    const type = Type === 'GetGroupData' ? input['ValType']
      : Object.entries(functions).find(([name]) => name === Type)?.[1]
    const allowed = Type === 'GetGroupData' ? ['Type', 'ValType', 'Field'] : ['Type', 'Field']
    if (!Object.values(functions).some(candidate => candidate === type)
      || Object.keys(input).some(key => !allowed.includes(key))
      || Object.hasOwn(input, 'Field') && input['Field'] !== field.canonicalName && input['Field'] !== field.name) {
      throw new Error(`SPARK_QUERY_AGGREGATE: ${field.canonicalName}仅支持本字段的Sum、Count、Avg、Min、Max`)
    }
    return {Type: 'GetGroupData', ValType: String(type)}
  }
}
