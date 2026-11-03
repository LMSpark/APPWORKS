/**
 * @module @spark-appworks/spark-lowcode-api:platform/data-space/runtime/query/data-space-query-nested
 * 职责：沿正式模型路径将原层级响应拆成各自只读查询上下文。
 * 边界：不推导关联、不重新查询、不公开原嵌套凭据，不生成可提交实体身份。
 * AI用途：由原查询owner承接Navigation及可唯一判定的HierarchyData子集合。
 */
import {isRecord} from '@spark-appworks/spark-utils'
import type {DataColumn} from '@spark-appworks/spark-data'
import type {DataSpaceDesignApi} from '../../design/data-space-design-api'
import type {DataSpaceQueryIdentity} from '../data-space-runtime-contract'
import type {DataSpaceQueryTable} from '../protocol/data-space-query-table'
import {DataSpaceQueryContext} from './data-space-query-context'

/** 单层正式模型及已捕获输出列，子集合路径来自显式查询计划。 */
export type DataSpaceQueryNestedNode = Readonly<{
  /** 本运行owner已核对的正式模型。 */
  model: Awaited<ReturnType<DataSpaceDesignApi['readModel']>>
  /** 本层独立规范输出列，不与兄弟模型合并。 */
  columns: readonly DataColumn[]
  /** 已声明的直接子模型，叶节点为空。 */
  children: readonly DataSpaceQueryNestedNode[]
}>
/** 原响应及执行域，所有后代共同消费同一范围与有界预算。 */
type NestedInput = Readonly<{
  /** 根模型的正式场景与注册名。 */
  identity: DataSpaceQueryIdentity
  /** 原协议解析后的私有根快照，尚含声明子集合。 */
  snapshot: ReturnType<DataSpaceQueryTable['applyResult']>
  /** 本次正式模型树及逐层输出列。 */
  node: DataSpaceQueryNestedNode
  /** Navigation按注册名分组，Hierarchy按唯一子模型Items分组。 */
  mode: 'navigation' | 'hierarchy'
  /** 捕获的原查询执行域，不生成新授权域。 */
  scope: string
  /** 原owner的当前域及模型图校验，后代沿同一祖先链核对。 */
  readScope: () => string
  /** 根行及所有后代共享的正安全整数行数预算，超限整份拒收。 */
  maxRows: number
}>

function isChildRows(value: unknown): value is Array<Record<string, unknown>> {
  return Array.isArray(value) && value.every(isRecord)
}

/** 私有原结果拆分责任方；按精确公开父行引用索引直接子上下文。 */
export class DataSpaceQueryNested {
  /** 派发前校验正式子集合路径、模型判别和模型树预算；不读取业务行。 */
  static validatePlan(root: DataSpaceQueryNestedNode, mode: NestedInput['mode']): void {
    let nodes = 0
    const validate = (node: DataSpaceQueryNestedNode, ancestors: readonly string[]) => {
      if (++nodes > 10000 || ancestors.length > 64 || ancestors.includes(node.model.metaName)) throw new Error('SPARK_NESTED_BUDGET: 模型路径循环或超限')
      if (mode === 'hierarchy' && node.children.length > 1) throw new Error('SPARK_NESTED_MODEL: Hierarchy混合子模型缺少正式判别合同')
      const names = new Set<string>()
      for (const child of node.children) {
        const path = mode === 'navigation' ? child.model.metaName : 'Items'
        if (path.startsWith('lingma_sys_') || names.has(path) || node.columns.some(column => column.name === path)) throw new Error('SPARK_NESTED_PATH: 子集合路径与输出字段冲突')
        names.add(path); validate(child, [...ancestors, node.model.metaName])
      }
    }
    validate(root, [])
  }

  /** 完整核对模型树与后代预算后发布；子层不伪造后端Count。 */
  static read(input: NestedInput): DataSpaceQueryContext {
    if (!Number.isSafeInteger(input.maxRows) || input.maxRows <= 0) throw new Error('SPARK_NESTED_BUDGET: maxRows无效')
    this.validatePlan(input.node, input.mode)
    let rows = 0, contexts = 0
    const build = (node: DataSpaceQueryNestedNode, snapshot: NestedInput['snapshot'], readScope: () => string): DataSpaceQueryContext => {
      if (++contexts > 50000) throw new Error('SPARK_NESTED_BUDGET: 子结果节点超过50000')
      rows += snapshot.rows.length
      if (rows > input.maxRows) throw new Error('SPARK_NESTED_BUDGET: 后代行集合超过maxRows')
      const captured = snapshot.rows.map(row => {
        const paths = new Set<string>(), children = new Map<string, ReadonlyArray<Record<string, unknown>>>()
        for (const child of node.children) {
          const path = input.mode === 'navigation' ? child.model.metaName : 'Items', value = row[path]
          if (value !== undefined && !isChildRows(value)) {
            throw new Error('SPARK_NESTED_SHAPE: 声明子集合必须为对象数组')
          }
          children.set(child.model.metaName, value ?? [])
          paths.add(path)
        }
        return {own: Object.fromEntries(Object.entries(row).filter(([key]) => !paths.has(key))), children}
      })
      const childResults = new WeakMap<Readonly<Record<string, unknown>>, Map<string, DataSpaceQueryContext>>()
      const empty = new Map<string, DataSpaceQueryContext>()
      const context = new DataSpaceQueryContext({identity: {scenarioId: input.identity.scenarioId, metaName: node.model.metaName},
        snapshot: Object.freeze({...snapshot, rows: Object.freeze(captured.map(item => Object.freeze(item.own)))}),
        scope: input.scope, readScope, resultKind: input.mode, columns: node.columns,
        readChild: (parent, name) => {
          const child = node.children.find(item => item.model.metaName === name)
          if (!child) throw new Error('SPARK_NESTED_MODEL: 未声明的直接子模型')
          if (parent !== null) {
            const result = childResults.get(parent)?.get(name)
            if (!result) throw new Error('SPARK_NESTED_PARENT: 父行结果已失效')
            return result
          }
          let result = empty.get(name)
          if (!result) {result = buildChild(child, []); empty.set(name, result)}
          return result
        }})
      context.bindFormalModel(node.model)
      const buildChild = (child: DataSpaceQueryNestedNode, values: ReadonlyArray<Record<string, unknown>>) => build(child,
        Object.freeze({rows: values, total: values.length, countReported: false, primaryKey: '', allowAdd: false, systemKey: ''}),
        () => {context.assertIdentity({scenarioId: input.identity.scenarioId, metaName: node.model.metaName}); return input.scope})
      context.rows.forEach((row, index) => {
        const results = new Map<string, DataSpaceQueryContext>()
        for (const child of node.children) results.set(child.model.metaName, buildChild(child, captured[index]?.children.get(child.model.metaName) ?? []))
        childResults.set(row, results)
      })
      return context
    }
    if (input.node.model.metaName !== input.identity.metaName) throw new Error('SPARK_NESTED_MODEL: 根模型身份不一致')
    return build(input.node, input.snapshot, input.readScope)
  }
}
