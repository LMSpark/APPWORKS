/**
 * @module @spark-appworks/spark-lowcode-api:platform/resources/dictionary/dictionary-schema
 * 职责：字典定义与条目字段的领域合同；不缩减为选项的值/文本二元组。
 * 边界：不持有业务行、不执行请求、不授予权限。字段名称来自现有字典存储合同。
 * AI用途：生成字典设置、条目编辑与来源字段说明时复用完整字段映射。
 */
type DictionaryField = Readonly<{
  /** 条目模型中的正式字段名。 */
  name: string
  /** 字典定义中保存该字段标题的字段名。 */
  titleField: string
  /** 标题尚未设置时的说明，不表示删除该字段。 */
  defaultLabel: string
}>

/** 字典业务字段合同；rowid/typeid/ordIdx分别承担身份、归属、顺序，不是选项值。 */
export class DictionarySchema {
  /** 两个基础输出和四个扩展输出；未设置标题仍保留扩展字段及其数据。 */
  static readonly fields: readonly DictionaryField[] = Object.freeze([
    {name: 'val', titleField: 'val', defaultLabel: '编码'},
    {name: 'txt', titleField: 'txt', defaultLabel: '显示文本'},
    {name: 'exVal_1', titleField: 'secondValue', defaultLabel: '第二文本'},
    {name: 'exVal_2', titleField: 'thirdValue', defaultLabel: '第三文本'},
    {name: 'exVal_3', titleField: 'fourthvalue', defaultLabel: '第四文本'},
    {name: 'exVal_4', titleField: 'fiveValue', defaultLabel: '第五文本'},
  ].map(field => Object.freeze(field)))

  /** 校验名称、字段标题、功能描述及编码类型；changedFields省略时校验新记录，指定时只校验变更，保留未修改的历史空值。 */
  static validateDefinition(row: Readonly<Record<string, unknown>>, changedFields?: readonly string[]): void {
    for (const field of ['TypeName', 'val', 'txt']) {
      if (changedFields && !changedFields.includes(field)) continue
      if (typeof row[field] !== 'string' || !row[field].trim()) throw new Error(`字典 ${field} 不能为空`)
    }
    if ((!changedFields || changedFields.includes('functiondesc'))
      && (typeof row['functiondesc'] !== 'string' || !row['functiondesc'].trim())) {
      throw new Error('字典功能描述不能为空')
    }
    if ((!changedFields || changedFields.includes('dictionaryType')) && row['dictionaryType'] !== '0' && row['dictionaryType'] !== '1') {
      throw new Error('字典编码类型必须是字符型或数值型')
    }
  }

  /** 校验拟提交字段；省略changedFields校验完整新条目，编码类型变更须将val加入所有存量条目的校验。 */
  static validateEntry(row: Readonly<Record<string, unknown>>, definition: Readonly<Record<string, unknown>>,
    changedFields?: readonly string[]): void {
    const value = row['val']
    if (!changedFields || changedFields.includes('val')) {
      if (typeof value !== 'string' && typeof value !== 'number') throw new Error('字典条目编码必须是文本或数值')
      if (typeof value === 'string' && !value.trim()) throw new Error('字典条目编码不能为空')
      if (definition['dictionaryType'] === '1' && (!Number.isFinite(Number(value))
        || typeof value === 'string' && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim()))) {
        throw new Error('数值型字典条目需要有效的十进制编码')
      }
    }
    if ((!changedFields || changedFields.includes('txt')) && (typeof row['txt'] !== 'string' || !row['txt'].trim())) {
      throw new Error('字典条目显示文本不能为空')
    }
    for (const {name} of this.fields.slice(2)) {
      if (changedFields && !changedFields.includes(name)) continue
      if (row[name] !== undefined && row[name] !== null && typeof row[name] !== 'string') throw new Error(`字典扩展字段 ${name} 必须是文本`)
    }
  }
}
