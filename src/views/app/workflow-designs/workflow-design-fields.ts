/**
 * @module app:views/app/workflow-designs/workflow-design-fields
 * 职责：WorkflowDesigns 属性面板的元数据行、变量默认值与结构化字段行的纯转换。
 * 边界：无响应式状态与副作用；输入输出均为普通数据。
 * AI用途：排查属性面板字段回显或保存数据形状时，从本模块定位。
 */
import type { WorkflowDesignCapability, WorkflowDesignVariable } from '@/services/workflow-designs'
import type { StructuredCapabilityCard, StructuredFieldRow, StructuredSelectCard, WorkflowMetadataRow, WorkflowVariableEditorRow } from './workflow-design-view-types'
import { readTextField } from './workflow-design-class-model'

export function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function recordOrEmpty(value: unknown): Record<string, unknown> {
  return isJsonRecord(value) ? value : {}
}

export function uniqueTexts(values: readonly unknown[]): string[] {
  const result: string[] = []
  for (const value of values) {
    if (typeof value !== 'string') continue
    const normalized = value.trim()
    if (normalized.length > 0 && !result.includes(normalized)) result.push(normalized)
  }
  return result
}

export function recordKeys(value: unknown): string[] {
  return isJsonRecord(value) ? Object.keys(value).filter(key => key.trim().length > 0) : []
}

export function metadataValueText(value: unknown): string {
  if (value === undefined || value === null) return '-'
  if (typeof value === 'string') return value.length > 0 ? value : '-'
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.length === 0 ? '[]' : value.map(metadataValueText).join(', ')
  if (isJsonRecord(value)) return Object.entries(value).map(([key, child]) => `${key}: ${metadataValueText(child)}`).join('; ')
  return String(value)
}

export function collectWorkflowMetadataRows(value: unknown, path: string, rows: WorkflowMetadataRow[]): void {
  if (isJsonRecord(value)) {
    const entries = Object.entries(value)
    if (entries.length === 0 && path.length > 0) rows.push({ label: path, value: '{}' })
    for (const [key, child] of entries) {
      collectWorkflowMetadataRows(child, path.length === 0 ? key : `${path}.${key}`, rows)
    }
    return
  }
  if (Array.isArray(value)) {
    if (value.length === 0 && path.length > 0) rows.push({ label: path, value: '[]' })
    for (const [index, child] of value.entries()) {
      collectWorkflowMetadataRows(child, `${path}.${index}`, rows)
    }
    return
  }
  if (path.length > 0) rows.push({ label: path, value: metadataValueText(value) })
}

export function workflowVariableRowsToData(rows: readonly WorkflowVariableEditorRow[]): WorkflowDesignVariable[] {
  return rows
    .map((row): WorkflowDesignVariable | null => {
      const name = row.name.trim()
      if (name.length === 0) return null
      const variable: WorkflowDesignVariable = {
        ...row.source,
        name,
        title: row.title.trim(),
        required: row.required,
        schema: {
          ...row.schema,
          type: row.schemaType.trim() || 'string',
        },
      }
      if (row.defaultValueEditable) {
        const defaultText = row.defaultValueText.trim()
        if (defaultText.length > 0) variable.defaultValue = parseWorkflowVariableDefaultValue(defaultText, row.schemaType)
        else delete variable.defaultValue
      } else if (Object.prototype.hasOwnProperty.call(row.source, 'defaultValue')) {
        variable.defaultValue = row.defaultValue
      }
      return variable
    })
    .filter((variable): variable is WorkflowDesignVariable => variable !== null)
}

export function primitiveValueText(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

export function isPrimitiveEditableValue(value: unknown): boolean {
  return value === undefined || value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

export function parseWorkflowVariableDefaultValue(value: string, schemaType: string): unknown {
  if (schemaType === 'boolean') return value === 'true'
  if (schemaType === 'number' || schemaType === 'integer') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return value
}

export function readWorkflowVariableSourceDocText(variable: Record<string, unknown>, schema: Record<string, unknown>): string {
  return firstMeaningfulText([
    readTextField(variable, 'jsdoc'),
    readTextField(variable, 'description'),
    readTextField(variable, 'desc'),
    readTextField(schema, 'jsdoc'),
    readTextField(schema, 'description'),
    readTextField(schema, 'summary'),
  ], [
    readTextField(variable, 'name'),
    readTextField(variable, 'title'),
  ])
}

export function firstMeaningfulText(values: readonly string[], duplicates: readonly string[]): string {
  const duplicateSet = new Set(duplicates.map(normalizeMeaningfulText).filter(value => value.length > 0))
  return values
    .map(value => value.trim())
    .find((value) => {
      if (value.length === 0) return false
      return !duplicateSet.has(normalizeMeaningfulText(value))
    }) ?? ''
}

export function normalizeMeaningfulText(value: string): string {
  return value.trim().replace(/\s+/gu, ' ').toLocaleLowerCase()
}

export function structuredRowsToRecord(rows: readonly StructuredFieldRow[]): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const row of rows) {
    const path = row.path.trim()
    if (path.length === 0) continue
    assignStructuredPath(result, path.split('.'), structuredRowValue(row))
  }
  return result
}

export function structuredRowValue(row: StructuredFieldRow): unknown {
  if (row.valueKind === 'boolean') return row.valueBoolean
  if (row.valueKind === 'number') {
    const value = Number(row.valueText)
    return Number.isFinite(value) ? value : 0
  }
  return row.valueText
}

export function assignStructuredPath(target: Record<string, unknown>, parts: string[], value: unknown): void {
  let cursor = target
  for (const [index, part] of parts.entries()) {
    if (part.length === 0) return
    if (index === parts.length - 1) {
      cursor[part] = value
      return
    }
    const existing = cursor[part]
    if (isJsonRecord(existing)) {
      cursor = existing
    } else {
      const created: Record<string, unknown> = {}
      cursor[part] = created
      cursor = created
    }
  }
}

export function structuredCardsToStrings(cards: readonly StructuredSelectCard[]): string[] {
  return uniqueTexts(cards.map(card => card.value))
}

export function capabilityCardsToData(cards: readonly StructuredCapabilityCard[]): WorkflowDesignCapability[] {
  return cards.map(card => ({
    id: card.id,
    title: card.title,
    scope: card.scope,
    description: card.description,
    inputs: structuredRowsToRecord(card.inputRows),
    outputs: structuredRowsToRecord(card.outputRows),
    constraints: structuredCardsToStrings(card.constraintCards),
  }))
}
