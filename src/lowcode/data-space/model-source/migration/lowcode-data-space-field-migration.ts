/**
 * @module app:lowcode/data-space/model-source/migration/lowcode-data-space-field-migration
 * 职责：按原正式字段身份迁移字段ValueFun中的本模型来源引用。
 * 边界：不解释SQL限定名、输出别名或不透明表达式，不执行值函数。
 * AI用途：来源替换预览与保存共用的字段定义变换；写入仍归元数据DataView。
 */
import {DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'

/** 当次元数据查询的可读模型或字段定义，不携带写入能力。 */
type MetadataRow = Readonly<Record<string, unknown>>
/** 来源替换已确认的同合同字段映射。 */
type FieldMapping = Readonly<{
  /** 原来源字段名称。 */
  name: string
  /** 新来源字段名称。 */
  sourceName: string
}>
/** 保持正式字段ID和输出合同的迁移输入。 */
type FieldMigrationInput = Readonly<{
  /** 本次替换来源的模型ID。 */
  modelId: string
  /** 本模型的完整所属字段；其他模型字段不参与本地来源引用迁移。 */
  fields: readonly MetadataRow[]
  /** 通过正式模型ID核对字段执行所属的来源类型。 */
  models: readonly MetadataRow[]
  /** 只应用于modelId的原字段名称映射。 */
  mappings: readonly FieldMapping[]
}>
/** 供预览、原字段提交及精确回读使用的ValueFun变更。 */
type FieldValueChange = Readonly<{
  /** 正式字段记录ID。 */
  id: string
  /** 持有取值定义的原字段名称。 */
  name: string
  /** 原数据库文本；不变化时不产生变更。 */
  before: string
  /** 只替换明确Field属性的拟保存文本。 */
  after: string
}>

/** 区分来源字段引用、独立取值和尚无迁移合同的定义。 */
export class LowcodeDataSpaceFieldMigration {
  /** 从原字段集合同时生成变更；常量内部及参数名称不参与字段替换。 */
  static prepare(input: FieldMigrationInput): FieldValueChange[] {
    const changes: FieldValueChange[] = []
    for (const row of input.fields) {
      if (row['type'] !== 'dataModel' || row['dataModelId'] !== input.modelId) continue
      const configured = (value: unknown) => value !== undefined && value !== null && value !== ''
      const fail: (detail: string) => never = detail => {throw new Error(`字段${String(row['Name'])}（${String(row['rowid'])}）：${detail}，原定义保留`)}
      // 来源字段映射不改变 Expression 中的脱敏规则 ID。
      const before = row['ValueFun']
      if (!configured(before)) continue
      if (typeof before !== 'string') fail('ValueFun不是文本')
      const value = DataSpaceDesignApi.parseValueFunction(before)
      if (!value) fail('ValueFun无效')
      if (value.Type === 'GetConstValue' && Object.hasOwn(value, 'Value')) continue
      if ((value.Type === 'GetInputParam' || value.Type === 'SystemData')
        && typeof value['ParamName'] === 'string' && value['ParamName'].trim()) continue
      if (value.Type !== 'GetTableField') fail(`值函数${value.Type}尚无有效的来源引用迁移合同`)
      const models = input.models.filter(model => model['rowid'] === row['dataModelId'])
      if (typeof row['dataModelId'] !== 'string' || !row['dataModelId'] || models.length !== 1
        || !['数据库表', '数据库视图'].includes(String(models[0]?.['Type']))) fail('来源未唯一匹配数据库字段执行合同')
      const reference = value['Field']
      if (typeof reference !== 'string' || !reference || reference.includes('.')) fail('Field须明确引用本模型的来源字段，不推断限定名')
      const fields = input.fields.filter(field => field['dataModelId'] === row['dataModelId']
        && field['type'] === 'dataModel' && field['Name'] === reference)
      if (fields.length !== 1) fail(`来源字段引用未唯一解析：${reference}`)
      const afterName = row['dataModelId'] === input.modelId
        ? input.mappings.find(mapping => mapping.name === reference)?.sourceName ?? reference : reference
      if (afterName === reference) continue
      const id = row['rowid'], name = row['Name']
      if (typeof id !== 'string' || !id || typeof name !== 'string' || !name) fail('字段身份无效')
      const after = JSON.stringify({...value, Field: afterName})
      DataSpaceDesignApi.parseValueFunction(after)
      changes.push({id, name, before, after})
    }
    return changes
  }
}
