import type { DataRow } from '../types'

export function row(value: DataRow): DataRow {
  return value
}

export function rows(value: DataRow[]): DataRow[] {
  return value
}

import { isRecord } from '@spark-appworks/spark-utils'
export { isRecord }

export function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (isRecord(value)) return value
  throw new Error(message)
}

export function requireArray(value: unknown, message: string): unknown[] {
  if (Array.isArray(value)) return value
  throw new Error(message)
}

export function requireNumber(value: unknown, message: string): number {
  if (typeof value === 'number') return value
  throw new Error(message)
}

export function requireError(value: unknown): Error {
  if (value instanceof Error) return value
  throw new Error('Expected Error instance')
}

export function getMember(target: object, key: string): unknown {
  return Reflect.get(target, key)
}

export function setMember(target: object, key: string, value: unknown): void {
  if (!Reflect.set(target, key, value)) {
    throw new Error(`Failed to set member "${key}"`)
  }
}
