/**
 * @module app:lowcode/data-space/model-source/lowcode-data-space-relation-migration
 * 职责：按正式模型身份迁移数据库关系中的来源字段引用。
 * 边界：保留wire原文中的非引用值；不改关系端点，不将原生关系反向写库。
 * AI用途：来源替换预览和提交共用同一结构化迁移，不对表达式做字符串替换。
 */
import {LowcodeDataSpaceFilterMigration} from './lowcode-data-space-filter-migration'

/** 原元数据查询的可读记录；不携带独立权限或保存责任。 */
type Row = Readonly<Record<string, unknown>>
/** 使用者确认的同合同字段映射；输出别名保持。 */
type Migration = Readonly<{
  /** 字段所属正式模型ID。 */
  modelId: string
  /** 原始来源字段Name。 */
  name: string
  /** 映射后的来源字段Name。 */
  sourceName: string
}>

/** 纯定义变换；权限、草稿、写入和回读仍由元数据DataView负责。 */
export class LowcodeDataSpaceRelationMigration {
  /** 同时应用全部映射；没有引用变化时保留原文本，包括空白。 */
  static prepare(input: Readonly<{relations: readonly Row[]; models: readonly Row[]; fields: readonly Row[]; mappings: readonly Migration[]}>): Array<{id: string; before: string; after: string}> {
    const changes: Array<{id: string; before: string; after: string}> = []
    const ids = new Set<string>()
    for (const relation of input.relations) {
      const id = relation['rowid']
      if (typeof id !== 'string' || !id || ids.has(id)) throw new Error('关系记录身份缺失或不唯一')
      ids.add(id)
      const fail = (message: string): never => {throw new Error(`关系${id}：${message}`)}
      const model = (modelId: unknown) => {
        const matches = input.models.filter(row => row['rowid'] === modelId)
        if (matches.length !== 1 || !matches[0]) return fail('端点模型身份不唯一')
        return matches[0]
      }
      const parent = model(relation['parentModId']), child = model(relation['childModId'])
      const parentName = relation['parentTable'], childName = relation['childTable']
      if (typeof parentName !== 'string' || !parentName.trim() || typeof childName !== 'string' || !childName.trim()) fail('端点名称缺失')
      const named = (name: unknown): Row => {
        if (typeof name !== 'string' || !name) return fail('模型引用未明确')
        const candidates = [
          ...(name === parentName ? [parent] : []), ...(name === childName ? [child] : []),
        ]
        if (!candidates.length) candidates.push(...input.models.filter(row => row['Name'] === name))
        const unique = new Map(candidates.map(row => [row['rowid'], row]))
        if (unique.size !== 1) return fail(`模型引用未唯一解析：${name}`)
        return [...unique.values()][0] ?? fail('模型引用未解析')
      }
      const field = (owner: Row, name: string, allowOutput: boolean): string => {
        const mappings = input.mappings.filter(item => item.modelId === owner['rowid'])
        if (!mappings.length) return name
        const matches = input.fields.filter(row => row['dataModelId'] === owner['rowid'] && row['type'] === 'dataModel'
          && (row['Name'] === name || allowOutput && typeof row['AsName'] === 'string' && row['AsName'].trim() === name))
        if (matches.length !== 1 || !matches[0]) return fail(`字段引用未唯一解析：${String(owner['Name'])}.${name}`)
        // 输出别名保持不变；只有引用原Name时才需要迁移。
        const renamed = matches[0]['Name'] === name ? mappings.find(item => item.name === name)?.sourceName ?? name : name
        if (allowOutput) {
          const resolved = input.fields.filter(row => row['dataModelId'] === owner['rowid'] && row['type'] === 'dataModel' && (
            (mappings.find(item => item.name === row['Name'])?.sourceName ?? row['Name']) === renamed
            || (typeof row['AsName'] === 'string' && row['AsName'].trim() ? row['AsName'].trim() : row['Name']) === renamed))
          if (resolved.length !== 1 || resolved[0]?.['rowid'] !== matches[0]['rowid']) return fail(`迁移后字段引用不唯一：${String(owner['Name'])}.${renamed}`)
        }
        return renamed
      }
      const reference = (value: unknown, owner: Row, condition: boolean): string => {
        if (typeof value !== 'string' || !value.trim()) return fail('字段引用无效')
        const separator = value.lastIndexOf('.')
        if (separator < 0) return field(owner, value, false)
        const qualifier = value.slice(0, separator), name = value.slice(separator + 1)
        if (condition && qualifier !== childName) return fail(`子字段限定名失配：${value}`)
        const resolved = condition ? child : named(qualifier)
        return `${qualifier}.${field(resolved, name, !condition && qualifier !== parentName)}`
      }
      const before = relation['filter']
      if (typeof before !== 'string') throw new Error(`关系${id}：过滤原文不是文本`)
      const after = LowcodeDataSpaceFilterMigration.rewrite(before, value => reference(value, child, true), fn => {
        let next = fn
        if (input.mappings.length) {
          if (fn['Type'] === 'GetTableField') next = {...fn, Field: reference(fn['Field'], parent, false)}
          else if (fn['Type'] === 'GetRefData' || fn['Type'] === 'GetGroupData') {
            const group = fn['Type'] === 'GetGroupData', owner = named(fn[group ? 'GroupTableName' : 'RefTableName'])
            next = {...fn}
            for (const key of group ? ['GroupField', 'Field'] : ['RefFieldName', 'FkFieldName']) {
              if (typeof fn[key] === 'string') next[key] = field(owner, fn[key], true)
            }
          } else if (!['GetConstValue', 'GetInputParam', 'SystemData'].includes(String(fn['Type']))) {
            return fail(`值函数${String(fn['Type'])}尚无结构化字段迁移合同，原文保留`)
          }
        }
        return next
      })
      if (after === before) continue
      changes.push({id, before, after})
    }
    return changes
  }
}
