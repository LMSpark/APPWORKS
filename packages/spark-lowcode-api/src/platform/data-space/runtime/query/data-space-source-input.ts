/**
 * @module @spark-appworks/spark-lowcode-api:platform/data-space/runtime/query/data-space-source-input
 * 职责：将正式来源入参映射应用到一次已捕获的业务输入。
 * 边界：只执行明确的输入引用和JSON常量，不模拟服务端系统值或身份。
 * AI用途：保留输入类型、映射优先级和同次取值快照，拒绝无执行合同的函数。
 */
import {DataViewFilter, type DataViewFilterValueFunction} from '@spark-appworks/spark-data'
import type {DataSpaceQueryInput} from '../data-space-runtime-contract.js'

/** 数据库输入字段记录的消费定义；缺少valueFunction表示尚未完成配置，不等同同名透传。 */
export type DataSpaceSourceInputBinding = Readonly<{
  /** Base_DataModel_Field 正式记录身份，用于诊断和精确回读。 */
  id: string
  /** 来源接收的参数名称，不是空间调用参数名称。 */
  name: string
  /** 原记录取值函数；未配置与不支持的函数均不隐式透传。 */
  valueFunction?: DataViewFilterValueFunction
}>

/** 正式来源参数求值；保留其他业务输入供后端模型过滤消费，不修改原定义或视图。 */
export class DataSpaceSourceInput {
  /** mapped从原输入快照求值并覆盖同名出站参数；direct须按正式来源名完整提供值，不执行保存的取值函数。返回独立JSON值。 */
  public static resolve(bindings: readonly DataSpaceSourceInputBinding[],
    inputs: readonly DataSpaceQueryInput[] | undefined, mode: 'mapped' | 'direct' = 'mapped'): readonly DataSpaceQueryInput[] {
    if (!['mapped', 'direct'].includes(mode)) throw new Error('SPARK_SOURCE_INPUT: 未支持的来源入参模式')
    const original = new Map((inputs ?? []).map(input => [input.name, input.value]))
    const result = new Map(original)
    const names = new Set<string>()
    for (const binding of bindings) {
      const fail: (detail: string) => never = detail => {throw new Error(`SPARK_SOURCE_INPUT: ${binding.name} (${binding.id}) ${detail}`)}
      if (!binding.name.trim() || names.has(binding.name)) fail('来源参数名为空或重复')
      names.add(binding.name)
      const expression = binding.valueFunction
      let value: unknown
      if (mode === 'direct') {
        if (!original.has(binding.name)) fail('来源测试值缺失')
        value = original.get(binding.name)
      } else if (expression === undefined) {
        fail('缺少取值配置')
      } else if (expression.Type === 'GetInputParam') {
        const name = expression['ParamName']
        if (typeof name !== 'string' || !name.trim() || !original.has(name)) fail('所需调用输入缺失')
        value = original.get(name)
      } else if (expression.Type === 'GetConstValue') {
        value = expression['Value']
      } else {
        fail(`没有已确认的来源入参执行合同: ${expression.Type}`)
      }
      const parsed = DataViewFilter.parse({field: binding.name, operator: 'eq', value: {Type: 'GetConstValue', Value: value}})
      if (value === undefined || !parsed.ok) fail('取值不是有效JSON')
      result.set(binding.name, structuredClone(value))
    }
    return [...result].map(([name, value]) => ({name, value: structuredClone(value)}))
  }
}
