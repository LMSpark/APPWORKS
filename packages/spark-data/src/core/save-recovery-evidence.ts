import { isRecord } from '@spark-appworks/spark-utils'

export function canonicalSaveRecoveryValue(value: unknown): string {
  if (value === undefined) return 'undefined'
  if (value === null) return 'null'
  if (typeof value === 'string') return `s:${JSON.stringify(value)}`
  if (typeof value === 'number') return `n:${Object.is(value, -0) ? '-0' : String(value)}`
  if (typeof value === 'boolean') return value ? 'b:true' : 'b:false'
  if (Array.isArray(value)) return `[${value.map(canonicalSaveRecoveryValue).join(',')}]`
  if (typeof value === 'object') {
    if (!isRecord(value)) throw new Error('SAVE_RECOVERY_DIGEST_UNSUPPORTED: object')
    return `{${Object.keys(value).sort().map(key =>
      `${JSON.stringify(key)}:${canonicalSaveRecoveryValue(value[key])}`).join(',')}}`
  }
  throw new Error(`SAVE_RECOVERY_DIGEST_UNSUPPORTED: ${typeof value}`)
}

export function saveRecoveryDigest(value: unknown): string {
  const canonical = canonicalSaveRecoveryValue(value)
  let hash = 0xcbf29ce484222325n
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= BigInt(canonical.charCodeAt(index))
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn
  }
  return `${canonical.length.toString(16)}:${hash.toString(16).padStart(16, '0')}`
}
