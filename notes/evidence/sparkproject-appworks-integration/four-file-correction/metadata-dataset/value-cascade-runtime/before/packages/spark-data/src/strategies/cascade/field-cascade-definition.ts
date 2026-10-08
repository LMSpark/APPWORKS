import { isRecord } from '@spark-appworks/spark-utils'
import type { DataSet } from '../../dataset'
import type { DataViewFieldCascade } from '../../types'

function object(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`FIELD_CASCADE_CONFIG: ${path} 必须是对象`)
  return value
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], path: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new Error(`FIELD_CASCADE_CONFIG: ${path}.${key} 未知`)
  }
}

function name(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim()) {
    throw new Error(`FIELD_CASCADE_CONFIG: ${path} 必须是非空原始名称`)
  }
  return value
}

function scalar(value: unknown, path: string): string | number | boolean | null {
  if (value === null || typeof value === 'string' || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value))) return value
  throw new Error(`FIELD_CASCADE_CONFIG: ${path} 必须是 JSON 标量`)
}

/** 字段输入级联的唯一形状、引用和依赖图校验。 */
export class DataViewFieldCascadeDefinition {
  static parse(input: unknown): DataViewFieldCascade {
    const value = object(input, 'viewCascades.field')
    exactKeys(value, ['kind', 'cascadeId', 'tableName', 'viewId', 'rowMode', 'targetField',
      'parents', 'optionsView', 'valuePolicy'], 'viewCascades.field')
    if (value['kind'] !== 'field' || value['rowMode'] !== 'editing-row') {
      throw new Error('FIELD_CASCADE_CONFIG: kind/rowMode 无效')
    }
    const cascadeId = name(value['cascadeId'], 'cascadeId')
    const tableName = name(value['tableName'], 'tableName')
    const viewId = name(value['viewId'], 'viewId')
    const targetField = name(value['targetField'], 'targetField')
    if (!Array.isArray(value['parents']) || value['parents'].length === 0) {
      throw new Error('FIELD_CASCADE_CONFIG: parents 必须是非空数组')
    }
    const parents = value['parents'].map((inputParent: unknown) => {
      const parent = object(inputParent, 'parents')
      exactKeys(parent, ['field', 'parameter'], 'parents')
      return { field: name(parent['field'], 'parents.field'),
        parameter: name(parent['parameter'], 'parents.parameter') }
    })
    if (new Set(parents.map(parent => parent.field)).size !== parents.length
      || new Set(parents.map(parent => parent.parameter)).size !== parents.length) {
      throw new Error('FIELD_CASCADE_CONFIG: parents 字段或参数重复')
    }
    const options = object(value['optionsView'], 'optionsView')
    exactKeys(options, ['tableName', 'viewId', 'valueField', 'labelField'], 'optionsView')
    const optionsView = { tableName: name(options['tableName'], 'optionsView.tableName'),
      viewId: name(options['viewId'], 'optionsView.viewId'),
      valueField: name(options['valueField'], 'optionsView.valueField'),
      labelField: name(options['labelField'], 'optionsView.labelField') }
    const policy = object(value['valuePolicy'], 'valuePolicy')
    exactKeys(policy, ['mode', 'clearValue'], 'valuePolicy')
    const mode = policy['mode']
    let valuePolicy: DataViewFieldCascade['valuePolicy']
    if (mode === 'retain') {
      if ('clearValue' in policy) throw new Error('FIELD_CASCADE_CONFIG: retain 不接受 clearValue')
      valuePolicy = { mode }
    } else if (mode === 'clear' || mode === 'retain-valid') {
      if (!Object.hasOwn(policy, 'clearValue')) throw new Error('FIELD_CASCADE_CONFIG: clearValue 必填')
      valuePolicy = { mode, clearValue: scalar(policy['clearValue'], 'clearValue') }
    } else throw new Error('FIELD_CASCADE_CONFIG: valuePolicy.mode 无效')
    for (const field of [targetField, ...parents.map(parent => parent.field), optionsView.valueField, optionsView.labelField]) {
      if (field === '_pk' || field.startsWith('lingma_sys_')) throw new Error(`FIELD_CASCADE_CONFIG: 框架字段 ${field}`)
    }
    return { kind: 'field', cascadeId, tableName, viewId, rowMode: 'editing-row',
      targetField, parents, optionsView, valuePolicy }
  }

  static validateAll(cascades: readonly unknown[]): DataViewFieldCascade[] {
    const fields: DataViewFieldCascade[] = []
    const ids = new Set<string>()
    const targets = new Set<string>()
    for (const input of cascades) {
      const cascade = object(input, 'viewCascades')
      if (cascade['cascadeId'] !== undefined) {
        const id = name(cascade['cascadeId'], 'cascadeId')
        if (ids.has(id)) throw new Error(`FIELD_CASCADE_DUPLICATE: cascadeId ${id}`)
        ids.add(id)
      }
      if (cascade['kind'] !== 'field') continue
      const field = this.parse(cascade)
      const target = JSON.stringify([field.tableName, field.viewId, field.targetField])
      if (targets.has(target)) throw new Error(`FIELD_CASCADE_DUPLICATE: target ${target}`)
      targets.add(target)
      fields.push(field)
    }
    const byTarget = new Map(fields.map(field => [JSON.stringify([field.tableName, field.viewId, field.targetField]), field]))
    const visiting = new Set<string>()
    const visited = new Set<string>()
    const visit = (key: string): void => {
      if (visiting.has(key)) throw new Error('FIELD_CASCADE_CYCLE: 字段输入依赖成环')
      if (visited.has(key)) return
      visiting.add(key)
      const definition = byTarget.get(key)
      if (definition) {
        for (const parent of definition.parents) {
          visit(JSON.stringify([definition.tableName, definition.viewId, parent.field]))
        }
      }
      visiting.delete(key)
      visited.add(key)
    }
    for (const key of byTarget.keys()) visit(key)
    return fields
  }

  static validateViews(definitions: readonly DataViewFieldCascade[], hasView: (tableName: string, viewId: string) => boolean): void {
    for (const definition of definitions) {
      if (!hasView(definition.tableName, definition.viewId)
        || !hasView(definition.optionsView.tableName, definition.optionsView.viewId)) {
        throw new Error(`FIELD_CASCADE_VIEW: 视图不存在 ${definition.cascadeId}`)
      }
    }
  }

  static validateRuntime(definitions: readonly DataViewFieldCascade[], dataSet: DataSet): void {
    this.validateViews(definitions, (tableName, viewId) => dataSet.getView(tableName, viewId) !== undefined)
    for (const definition of definitions) {
      const target = dataSet.getView(definition.tableName, definition.viewId)
      const options = dataSet.getView(definition.optionsView.tableName, definition.optionsView.viewId)
      if (!target || !options) throw new Error(`FIELD_CASCADE_VIEW: 视图不存在 ${definition.cascadeId}`)
      const output = new Set(target.columns.map(column => column.name))
      const optionOutput = new Set(options.columns.map(column => column.name))
      if (!output.has(definition.targetField) || definition.parents.some(parent => !output.has(parent.field))
        || !optionOutput.has(definition.optionsView.valueField) || !optionOutput.has(definition.optionsView.labelField)) {
        throw new Error(`FIELD_CASCADE_FIELD: 输出字段不存在 ${definition.cascadeId}`)
      }
      const targetColumn = target.columns.find(column => column.name === definition.targetField)
      if (targetColumn?.computeExpression !== undefined || target.effectivePkFields.includes(definition.targetField)) {
        throw new Error(`FIELD_CASCADE_TARGET: 计算列或主键不可写 ${definition.cascadeId}`)
      }
    }
  }
}
