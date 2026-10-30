/**
 * @module app:lowcode/data-space/model-source/model/lowcode-data-space-model-migration
 * 职责：迁移数据库模型Filter中已确认的正式字段引用。
 * 边界：仅按注册Name解析模型；不推断物理表或SQL别名，不迁移后端Join配置。
 * AI用途：生成逐模型预览delta，原元数据DataView负责授权和保存。
 */
import type {LowcodeDataSpaceRelationMigration} from '../migration/lowcode-data-space-relation-migration'
import {LowcodeDataSpaceFilterMigration} from '../migration/lowcode-data-space-filter-migration'

/** 原正式元模型行，不带独立的权限推导或写入能力。 */
type Row = Readonly<Record<string, unknown>>
/** 显式同合同字段映射，与正式关系迁移共用输入。 */
type Mappings = Parameters<typeof LowcodeDataSpaceRelationMigration.prepare>[0]['mappings']

/** 根据原模型身份同时变换引用，不在结果上执行第二次名称替换。 */
export class LowcodeDataSpaceModelMigration {
  /** 返回实际变化的属性；未变化表达式保留原文且不要求写权限。 */
  static prepare(input: Readonly<{modelId: string; models: readonly Row[]; fields: readonly Row[]; mappings: Mappings}>): Array<{id: string; name: string; property: string; before: string; after: string}> {
    const changes: Array<{id: string; name: string; property: string; before: string; after: string}> = []
    const modelIds = new Set<string>()
    const field = (owner: Row, name: string): string => {
      const mappings = input.mappings.filter(item => item.modelId === owner['rowid'])
      if (!mappings.length) return name
      const fields = input.fields.filter(row => row['dataModelId'] === owner['rowid'] && row['type'] === 'dataModel')
      const matches = fields.filter(row => row['Name'] === name)
      const found = matches[0]
      if (matches.length !== 1 || !found) throw new Error(`字段引用未唯一解析：${String(owner['Name'])}.${name}`)
      return mappings.find(item => item.name === name)?.sourceName ?? name
    }
    const named = (qualifier: string): Row => {
      const found = input.models.filter(row => row['Name'] === qualifier)
      if (found.length !== 1 || !found[0]) throw new Error(`模型注册名未唯一解析：${qualifier}；不以来源名或SQL别名推断`)
      return found[0]
    }
    const reference = (value: unknown, owner: Row): string => {
      if (typeof value !== 'string' || !value.trim()) throw new Error('字段引用无效')
      // 正式字段自身含点时仍先按完整Name解析，不把它强制拆成限定名。
      const direct = input.fields.some(row => row['dataModelId'] === owner['rowid'] && row['type'] === 'dataModel' && row['Name'] === value)
      const separator = direct ? -1 : value.lastIndexOf('.')
      if (separator < 0) return field(owner, value)
      const qualifier = value.slice(0, separator), resolved = named(qualifier)
      return `${qualifier}.${field(resolved, value.slice(separator + 1))}`
    }
    for (const model of input.models) {
      const id = model['rowid'], name = model['Name']
      if (typeof id !== 'string' || !id || modelIds.has(id) || typeof name !== 'string' || !name) throw new Error('模型记录身份缺失或不唯一')
      modelIds.add(id)
      const before = model['Filter']
      if (before === undefined || before === null || before === '') continue
      try {
        if (typeof before !== 'string') throw new Error('配置原文不是文本')
        const after = LowcodeDataSpaceFilterMigration.rewrite(before, value => reference(value, model), fn => {
          if (fn['Type'] === 'GetTableField') return {...fn, Field: reference(fn['Field'], model)}
          if (['GetConstValue', 'GetInputParam', 'SystemData'].includes(String(fn['Type']))) return fn
          // 这里只判断自动改名是否安全，不定义前端值函数目录或执行能力。
          throw new Error(`值函数${String(fn['Type'])}尚无此上下文的字段迁移合同，原文保留`)
        })
        if (after !== before) changes.push({id, name, property: 'Filter', before, after})
      } catch (error) {throw new Error(`${id === input.modelId ? '模型' : '跨模型'}${name}.Filter：${error instanceof Error ? error.message : String(error)}`)}
    }
    return changes
  }
}
