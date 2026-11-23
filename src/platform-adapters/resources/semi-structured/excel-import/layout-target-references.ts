/**
 * @module app:lowcode/resources/semi-structured/excel-import/layout-target-references
 * 职责：按正式Sheet布局版本定位目标表、区域字段和关联两端，校验换表影响。
 * 边界：不升级或重写布局，不把标题、定位、codec、lookup字面值当作目标字段。
 * AI用途：Excel目标替换时保持多区域作用域，精确指出尚未完成的布局映射。
 */
import {DataViewFilterCodec, type DataViewFilterTree} from '@spark-appworks/spark-data'
type ObjectValue = Readonly<Record<string, unknown>>
function isObject(value: unknown): value is ObjectValue {return value !== null && typeof value === 'object' && !Array.isArray(value)}
function object(value: unknown, path: string): ObjectValue {if (!isObject(value)) throw new Error(`${path}必须是对象`); return value}
function present(value: unknown): boolean {return value !== undefined && value !== null && value !== ''}
function scopeOf(scopes: ReadonlyMap<unknown, boolean>, id: unknown, path: string): boolean {const scope = scopes.get(id); if (scope === undefined) throw new Error(`${path}作用域无法核定`); return scope}
function array(value: unknown, path: string): readonly unknown[] {if (!Array.isArray(value)) throw new Error(`${path}必须是数组`); return value}
/**
 * @param input 已解析布局、原物理目标、新物理目标、配置身份及新目标字段。
 * @returns 仅对本次受影响的表和区域验证字段；不修改原布局。
 */
export function validateExcelLayoutTarget(input: Readonly<{layout: unknown; oldTable: string; newTable: string; nodeId: unknown; fields: ReadonlySet<string>}>): void {
  const layout = object(input.layout, 'sheet_layout_json')
  if (layout['enabled'] !== true) return
  const version = layout['version'] ?? 1
  if (typeof version !== 'number' || ![1, 2, 3].includes(version)) throw new Error('sheet_layout_json.version的引用作用域尚不能核定')
  const regions = array(layout['regions'] ?? [], 'sheet_layout_json.regions').map((value, index) => object(value, `regions[${index}]`))
  const physical = (value: unknown, path: string, implicit: boolean): boolean => {
    if (value === undefined || value === null || value === '') return implicit
    if (typeof value !== 'string') throw new Error(`${path}必须是物理表名称`)
    if (value === input.oldTable && input.oldTable !== input.newTable) throw new Error(`${path}仍绑定旧物理表，请先完成布局映射`)
    return value === input.newTable
  }
  const check = (value: unknown, path: string, affected: boolean): void => {
    if (!affected || value === undefined || value === null || value === '') return
    if (typeof value !== 'string' || !input.fields.has(value)) throw new Error(`${path}引用新目标中不存在的字段: ${String(value)}`)
  }
  const affected = new Map<unknown, boolean>(), tableScopes = new Map<unknown, boolean>()
  if (version === 3) array(layout['tables'] ?? [], 'tables').forEach((value, index) => {
    const table = object(value, `tables[${index}]`), id = table['id']
    if (typeof id !== 'string' || !id || tableScopes.has(id)) throw new Error(`tables[${index}].id不唯一`)
    const own = table['configId'] === input.nodeId, scope = physical(table['table'], `tables[${index}].table`, own)
    if (own && !scope) throw new Error(`tables[${index}]的配置与物理目标不一致`)
    tableScopes.set(id, scope)
  })
  regions.forEach((region, index) => {
    const id = region['id'] ?? `#${index}`
    if (affected.has(id)) throw new Error(`regions[${index}].id重复`)
    const target = version === 2 && present(region['target']) ? object(region['target'], `regions[${index}].target`) : undefined
    if (version === 3 && !tableScopes.has(region['tableId'])) throw new Error(`regions[${index}].tableId作用域无法核定`)
    affected.set(id, version === 3 ? scopeOf(tableScopes, region['tableId'], `regions[${index}].tableId`) : physical(version === 2 ? target?.['table'] : region['table'], `regions[${index}].${version === 2 ? 'target.' : ''}table`, version === 1))
  })
  const regionScope = (id: unknown, path: string): boolean => {if (!affected.has(id)) throw new Error(`${path}区域身份无法核定`); return scopeOf(affected, id, path)}
  const regionFields = (region: ObjectValue, index: number, scope: boolean): void => {
    array(region['fields'] ?? [], `regions[${index}].fields`).forEach((value, fieldIndex) => {
      const field = object(value, `regions[${index}].fields[${fieldIndex}]`)
      check(field['name'], `regions[${index}].fields[${fieldIndex}].name`, scope)
      if (scope && present(field['lookup'])) {
        const lookupPath = `regions[${index}].fields[${fieldIndex}].lookup`, lookup = object(field['lookup'], lookupPath)
        if (!present(lookup['filter']) && Array.isArray(lookup['filters']) && lookup['filters'].length) throw new Error(`${lookupPath}.filters须迁移为正式filter合同后再换表`)
        if (present(lookup['filter'])) {
          const visit = (node: DataViewFilterTree, path: string): void => {
            if ('logic' in node) {node.filters.forEach((child, childIndex) => visit(child, `${path}.filters[${childIndex}]`)); return}
            const expression = node.value
            if (expression !== null && typeof expression === 'object' && !Array.isArray(expression) && 'Type' in expression && expression['Type'] === 'GetTableField' && 'Field' in expression) check(expression['Field'], `${path}.ValueFun.Field`, true)
          }
          try {visit(DataViewFilterCodec.decode(lookup['filter']).toJSON(), `${lookupPath}.filter`)}
          catch (cause) {throw new Error(`${lookupPath}.filter: ${cause instanceof Error ? cause.message : String(cause)}`)}
        }
      }
    })
    if (present(region['scan'])) array(object(region['scan'], `regions[${index}].scan`)['fillDown'] ?? [], `regions[${index}].scan.fillDown`).forEach((value, fieldIndex) => check(value, `regions[${index}].scan.fillDown[${fieldIndex}]`, scope))
  }
  regions.forEach((region, index) => {
    const scope = regionScope(region['id'] ?? `#${index}`, `regions[${index}]`), path = `regions[${index}]`
    if (version !== 1 || ['FORM', 'LIST'].includes(String(region['role']))) regionFields(region, index, scope)
    if (version === 1 && present(region['parentRegion'])) {
      check(region['parentField'], `${path}.parentField`, regionScope(region['parentRegion'], `${path}.parentRegion`))
      check(region['foreignKeyField'], `${path}.foreignKeyField`, scope)
    }
    if (version === 2 && present(region['target'])) {
      const target = object(region['target'], `${path}.target`)
      if (present(target['link'])) {
        const link = object(target['link'], `${path}.target.link`), parent = regionScope(link['fromRegion'], `${path}.target.link.fromRegion`)
        check(link['sourceField'], `${path}.target.link.sourceField`, parent); check(link['targetField'], `${path}.target.link.targetField`, scope)
      }
    }
    if (version === 3 && present(region['link'])) {
      const link = object(region['link'], `${path}.link`)
      let parent: boolean
      if (present(link['fromRegionId'])) parent = regionScope(link['fromRegionId'], `${path}.link.fromRegionId`)
      else {if (!tableScopes.has(link['fromTableId'])) throw new Error(`${path}.link.fromTableId作用域无法核定`); parent = scopeOf(tableScopes, link['fromTableId'], `${path}.link.fromTableId`)}
      check(link['parentField'], `${path}.link.parentField`, parent); check(link['foreignKeyField'], `${path}.link.foreignKeyField`, scope)
    }
    if (version === 1 && region['role'] === 'FOOTER') {
      const forms = regions.filter(item => item['role'] === 'FORM'), lists = regions.filter(item => item['role'] === 'LIST')
      const roleScope = (items: readonly ObjectValue[], name: string): boolean => {
        if (items.length !== 1) throw new Error(`${path}的${name}作用域不唯一`)
        const item = items[0]
        if (item === undefined) throw new Error(`${path}的${name}区域缺失`)
        return regionScope(item['id'] ?? `#${regions.indexOf(item)}`, `${path}.${name}`)
      }
      const inspect = (cell: ObjectValue, cellPath: string): void => {
        if (cell['import'] === true) check(cell['name'], `${cellPath}.name`, roleScope(forms, 'FORM'))
        if (!present(cell['source'])) return
        const source = object(cell['source'], `${cellPath}.source`)
        if (source['agg'] === 'COUNT') return
        if (present(source['field'])) {
          check(source['field'], `${cellPath}.source.field`, roleScope(source['agg'] === 'SUM' ? lists : forms, source['agg'] === 'SUM' ? 'LIST' : 'FORM'))
        } else if (present(source['var'])) check(source['var'], `${cellPath}.source.var`, roleScope(forms, 'FORM'))
      }
      array(region['blocks'] ?? [], `${path}.blocks`).forEach((value, blockIndex) => {
        const block = object(value, `${path}.blocks[${blockIndex}]`), blockPath = `${path}.blocks[${blockIndex}]`
        if (block['type'] === 'PARAGRAPH') inspect(block, blockPath)
        if (block['type'] === 'ROW') array(block['cells'] ?? [], `${blockPath}.cells`).forEach((cell, cellIndex) => inspect(object(cell, `${blockPath}.cells[${cellIndex}]`), `${blockPath}.cells[${cellIndex}]`))
      })
    }
  })
  if (version === 2) array(layout['mergePolicies'] ?? [], 'mergePolicies').forEach((value, index) => {
    const policy = object(value, `mergePolicies[${index}]`), scope = physical(policy['table'], `mergePolicies[${index}].table`, false)
    if (scope) array(policy['fromRegions'] ?? [], `mergePolicies[${index}].fromRegions`).forEach(id => {
      const regionIndex = regions.findIndex(region => region['id'] === id)
      if (regionIndex < 0) throw new Error(`mergePolicies[${index}].fromRegions区域缺失`)
      const region = regions[regionIndex]
      if (region === undefined) throw new Error(`mergePolicies[${index}].fromRegions区域缺失`)
      regionFields(region, regionIndex, true)
    })
    array(policy['joinOns'] ?? [], `mergePolicies[${index}].joinOns`).forEach((joinValue, joinIndex) => {
      const join = object(joinValue, `mergePolicies[${index}].joinOns[${joinIndex}]`), path = `mergePolicies[${index}].joinOns[${joinIndex}]`
      check(join['leftField'], `${path}.leftField`, regionScope(join['leftRegion'], `${path}.leftRegion`)); check(join['rightField'], `${path}.rightField`, regionScope(join['rightRegion'], `${path}.rightRegion`))
    })
  })
  if (version === 3) array(layout['mergePolicies'] ?? [], 'mergePolicies').forEach((value, index) => {
    const policy = object(value, `mergePolicies[${index}]`)
    physical(policy['table'], `mergePolicies[${index}].table`, tableScopes.get(policy['tableId']) ?? false)
  })
}
