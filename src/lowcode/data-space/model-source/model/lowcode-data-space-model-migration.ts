/**
 * @module app:lowcode/data-space/model-source/model/lowcode-data-space-model-migration
 * 职责：迁移模型Filter及明确父子Join配置中的正式字段引用。
 * 边界：Filter按注册Name；Join按原端点SQL限定名，不推断未知表达式。
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
  static prepare(input: Readonly<{modelId: string; models: readonly Row[]; fields: readonly Row[]; mappings: Mappings; nextModel?: Row}>): Array<{id: string; name: string; property: string; before: string; after: string}> {
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
    return [...changes, ...this.joinChanges(input)]
  }

  /** Join左值属于子模型，父引用由PId注册名确定；来源改变仅影响实际SQL限定名。 */
  private static joinChanges(input: Readonly<{modelId: string; models: readonly Row[]; fields: readonly Row[]; mappings: Mappings; nextModel?: Row}>) {
    const changes: Array<{id: string; name: string; property: string; before: string; after: string}> = []
    const configured = (value: unknown) => value !== undefined && value !== null && value !== ''
    const qualifier = (model: Row): string => {
      const value = configured(model['ShortName']) ? model['ShortName'] : configured(model['MetaName']) ? model['MetaName'] : model['Name']
      if (typeof value !== 'string' || !value.trim()) throw new Error('Join SQL限定名无效')
      return value
    }
    const mappedField = (model: Row, name: string): string => {
      const fields = input.fields.filter(row => row['type'] === 'dataModel' && row['dataModelId'] === model['rowid'] && row['Name'] === name)
      if (fields.length !== 1) throw new Error(`Join字段引用未唯一解析：${String(model['Name'])}.${name}`)
      return input.mappings.find(item => item.modelId === model['rowid'] && item.name === name)?.sourceName ?? name
    }
    for (const child of input.models) {
      const id = String(child['rowid']), name = String(child['Name'])
      try {
        const parents = configured(child['PId']) ? input.models.filter(row => row['Name'] === child['PId']) : []
        if (configured(child['PId']) && (typeof child['PId'] !== 'string' || parents.length !== 1)) throw new Error('PId父模型注册名未唯一解析')
        const parent = parents[0]
        const foreign = child['ForeignKeyFields']
        if (configured(foreign)) {
          if (typeof foreign !== 'string') throw new Error('ForeignKeyFields不是单字段文本')
          const after = mappedField(child, foreign)
          if (after !== foreign) changes.push({id, name, property: 'ForeignKeyFields', before: foreign, after})
        }
        const before = child['JoinFilter']
        if (!configured(before)) continue
        if (typeof before !== 'string') throw new Error('JoinFilter原文不是文本')
        if (parent && input.nextModel && [child['rowid'], parent['rowid']].includes(input.modelId)) {
          const endpoints = [parent, child]
          const projected = endpoints.map(model => model['rowid'] === input.modelId ? {...model, ...input.nextModel} : model)
          for (const pair of [endpoints, projected]) {
            if (pair.some(model => !['数据库表', '数据库视图'].includes(String(model['Type'])))) throw new Error('Join仅支持已确认的数据库表或数据库视图来源')
            const first = pair[0], second = pair[1]
            if (!first || !second || typeof first['DbId'] !== 'string' || !first['DbId']
              || first['DbId'] !== second['DbId']) throw new Error('Join数据库范围不一致或未确认')
            if (qualifier(first) === qualifier(second)) throw new Error('Join SQL限定名冲突，须明确独立别名')
          }
        }
        const reference = (value: unknown, fallback: Row | undefined, left: boolean): string => {
          if (typeof value !== 'string' || !value.trim()) throw new Error('Join字段引用无效')
          if (!fallback) throw new Error('JoinFilter父模型PId缺失')
          // 字段本身含点时，先使用完整物理Name，避免猜拆字段。
          if (input.fields.some(row => row['type'] === 'dataModel' && row['dataModelId'] === fallback['rowid'] && row['Name'] === value)) return mappedField(fallback, value)
          const separator = value.lastIndexOf('.')
          if (separator < 0) return mappedField(fallback, value)
          const prefix = value.slice(0, separator)
          const endpoints = left ? [child] : [child, ...parent ? [parent] : []]
          const matches = endpoints.filter(model => qualifier(model) === prefix)
          const owner = matches[0]
          if (matches.length !== 1 || !owner) throw new Error(`Join SQL限定名未唯一匹配端点：${prefix}`)
          const next = owner['rowid'] === input.modelId && input.nextModel ? {...owner, ...input.nextModel} : owner
          return `${qualifier(next)}.${mappedField(owner, value.slice(separator + 1))}`
        }
        const after = LowcodeDataSpaceFilterMigration.rewrite(before, value => reference(value, child, true), fn => {
          if (fn['Type'] === 'GetTableField') return {...fn, Field: reference(fn['Field'], parent, false)}
          if (['GetConstValue', 'GetInputParam', 'SystemData'].includes(String(fn['Type']))) return fn
          throw new Error(`JoinFilter值函数${String(fn['Type'])}尚无字段迁移合同`)
        })
        if (after !== before) changes.push({id, name, property: 'JoinFilter', before, after})
      } catch (error) {throw new Error(`模型${name}.JoinFilter/ForeignKeyFields：${error instanceof Error ? error.message : String(error)}`)}
    }
    return changes
  }
}
