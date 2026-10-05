import { LowcodeApiError } from '../../core/lowcode-api-error.js'

export const LOWCODE_BLUEPRINT_FILE_NAMES = ['rule.json', 'script.js', 'style.css'] as const

export type LowcodeBlueprintFileName = typeof LOWCODE_BLUEPRINT_FILE_NAMES[number]
export type LowcodeBlueprintFileVersionKey = 'rule' | 'script' | 'style'
export type LowcodeBlueprintFileVersions = Readonly<Record<LowcodeBlueprintFileVersionKey, number | null>>

const FILE_VERSION_KEYS: readonly LowcodeBlueprintFileVersionKey[] = ['rule', 'script', 'style']

function isFileVersionKey(value: string): value is LowcodeBlueprintFileVersionKey {
  return FILE_VERSION_KEYS.some(candidate => candidate === value)
}

function emptyVersions(): Record<LowcodeBlueprintFileVersionKey, number | null> {
  return { rule: null, script: null, style: null }
}

function version(value: string, source: string): number {
  if (!/^\d+$/.test(value)) throw new LowcodeApiError(0, `导航文件版本格式无效：${source}`)
  const normalized = Number(value)
  if (!Number.isSafeInteger(normalized)) throw new LowcodeApiError(0, `导航文件版本超出安全范围：${source}`)
  return normalized
}

export function lowcodeBlueprintFileVersionKey(
  fileName: LowcodeBlueprintFileName,
): LowcodeBlueprintFileVersionKey {
  if (fileName === 'rule.json') return 'rule'
  if (fileName === 'script.js') return 'script'
  return 'style'
}

/** 解析导航 versionId；空值读裸文件，历史单值对三个文件共用。 */
export function parseLowcodeBlueprintFileVersions(value: string): LowcodeBlueprintFileVersions {
  const source = value.trim()
  const result = emptyVersions()
  if (!source) return Object.freeze(result)
  if (/^\d+$/.test(source)) {
    const shared = version(source, source)
    return Object.freeze({ rule: shared, script: shared, style: shared })
  }
  const seen = new Set<LowcodeBlueprintFileVersionKey>()
  for (const segment of source.split(';')) {
    const separator = segment.indexOf('=')
    if (separator <= 0 || separator === segment.length - 1) {
      throw new LowcodeApiError(0, `导航文件版本分段无效：${segment}`)
    }
    const key = segment.slice(0, separator).trim()
    const rawVersion = segment.slice(separator + 1).trim()
    if (!isFileVersionKey(key)) {
      throw new LowcodeApiError(0, `未知导航文件版本分段：${key}`)
    }
    if (seen.has(key)) throw new LowcodeApiError(0, `导航文件版本分段重复：${key}`)
    seen.add(key)
    result[key] = version(rawVersion, segment)
  }
  return Object.freeze(result)
}

/** 以固定具名顺序编码三文件版本；缺失分段不写入。 */
export function encodeLowcodeBlueprintFileVersions(versions: LowcodeBlueprintFileVersions): string {
  return FILE_VERSION_KEYS
    .filter(key => versions[key] !== null)
    .map(key => `${key}=${versions[key]}`)
    .join(';')
}

/** 根据导航版本指针生成 Git 历史兼容的 `{version}__{filename}`。 */
export function lowcodeBlueprintVersionedFileName(
  fileName: LowcodeBlueprintFileName,
  versions: LowcodeBlueprintFileVersions,
): string {
  const current = versions[lowcodeBlueprintFileVersionKey(fileName)]
  return current === null ? fileName : `${current}__${fileName}`
}

/** 只推进指定文件版本，其他文件指针保持不变。 */
export function nextLowcodeBlueprintFileVersions(
  versions: LowcodeBlueprintFileVersions,
  fileName: LowcodeBlueprintFileName,
): LowcodeBlueprintFileVersions {
  const key = lowcodeBlueprintFileVersionKey(fileName)
  return Object.freeze({ ...versions, [key]: (versions[key] ?? 0) + 1 })
}
