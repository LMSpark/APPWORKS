import { copyOwnEnumerableProperties, isStringArray } from '@spark-appworks/spark-utils/internal'

export function requireRecord(value: unknown, context: string): Record<string, unknown> {
  const record = copyOwnEnumerableProperties(value)
  if (record !== null) return record
  throw new TypeError(`${context} must be a record`)
}

export function optionalRecord(value: unknown, context: string): Record<string, unknown> | undefined {
  if (value === undefined || value === null) return undefined
  return requireRecord(value, context)
}

export function requireUnknownArray(value: unknown, context: string): unknown[] {
  if (Array.isArray(value)) return value
  throw new TypeError(`${context} must be an array`)
}

export function optionalUnknownArray(value: unknown, context: string): unknown[] | undefined {
  if (value === undefined || value === null) return undefined
  return requireUnknownArray(value, context)
}

export function requireRecordArray(value: unknown, context: string): Record<string, unknown>[] {
  return requireUnknownArray(value, context).map((item, index) => requireRecord(item, `${context}[${index}]`))
}

export function optionalRecordArray(value: unknown, context: string): Record<string, unknown>[] | undefined {
  if (value === undefined || value === null) return undefined
  return requireRecordArray(value, context)
}

export function requireString(value: unknown, context: string): string {
  if (typeof value === 'string') return value
  throw new TypeError(`${context} must be a string`)
}

export function requireStringArray(value: unknown, context: string): string[] {
  if (isStringArray(value)) return value
  throw new TypeError(`${context} must be a string array`)
}

export function requireNumber(value: unknown, context: string): number {
  if (typeof value === 'number') return value
  throw new TypeError(`${context} must be a number`)
}

export function optionalNumber(value: unknown, context: string): number | undefined {
  if (value === undefined || value === null) return undefined
  return requireNumber(value, context)
}

export function optionalString(value: unknown, context: string): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'string') return value
  throw new TypeError(`${context} must be a string`)
}

export function requireFunction(value: unknown, context: string): (...args: unknown[]) => unknown {
  if (typeof value === 'function') {
    return (...args: unknown[]) => Reflect.apply(value, undefined, args)
  }
  throw new TypeError(`${context} must be a function`)
}

export function requireElement<T extends Element>(
  value: unknown,
  ctor: { new (...args: never[]): T },
  context: string,
): T {
  if (value instanceof ctor) return value
  throw new TypeError(`${context} must be ${ctor.name}`)
}

export function requireHtmlInput(value: unknown, context: string): HTMLInputElement {
  return requireElement(value, HTMLInputElement, context)
}

export function requireHtmlTextArea(value: unknown, context: string): HTMLTextAreaElement {
  return requireElement(value, HTMLTextAreaElement, context)
}

export function requireTextControl(value: unknown, context: string): HTMLInputElement | HTMLTextAreaElement {
  if (value instanceof HTMLInputElement || value instanceof HTMLTextAreaElement) return value
  throw new TypeError(`${context} must be an input or textarea`)
}

export function requireHtmlButton(value: unknown, context: string): HTMLButtonElement {
  return requireElement(value, HTMLButtonElement, context)
}

export function requireHtmlElement(value: unknown, context: string): HTMLElement {
  return requireElement(value, HTMLElement, context)
}
