import type { DataRow } from '../../types'

/** DataView.value 与值绑定共用的既有字符串格式；不推断普通字段是否为多选。 */
export class DataViewSelectionValue {
  static split(value: string | null | undefined, delimiter: string): string[] {
    if (!value) return []
    return (delimiter ? value.split(delimiter) : [value]).map(token => token.trim()).filter(token => token !== '')
  }

  static join(values: readonly string[], delimiter: string): string {
    return delimiter ? values.join(delimiter) : (values[0] ?? '')
  }

  static token(row: DataRow, fields: string | readonly string[]): string | undefined {
    if (typeof fields === 'string') {
      const value = row[fields]
      return value === undefined || value === null ? undefined : String(value)
    }
    const parts = fields.map(field => {
      const value = row[field]
      return value === undefined || value === null ? '' : String(value)
    })
    return parts.some(part => part !== '') ? parts.join(':') : undefined
  }
}
