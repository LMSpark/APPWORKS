/**
 * @module @spark-appworks/spark-lowcode-api:platform/project-blueprint/project-blueprint-file-version
 * 职责：解析与编码工具发布文件的正式发布引用。
 * 边界：文件名快照独立存在，裸文件是工作内容；场景文件通过 manifest 引用各自快照。
 * AI用途：按明确 rule/script/style 引用定位文件，禁止以最大编号推断发布版本。
 */
import { LowcodeApiError } from '../../core/lowcode-api-error.js'

export const LOWCODE_BLUEPRINT_FILE_NAMES = ['rule.json', 'script.js', 'style.css', 'publication-manifest.json'] as const

/** 三份工具文件及一次发布说明；场景共享 pagedata.json 由说明文件引用。 */
export type LowcodeBlueprintFileName = typeof LOWCODE_BLUEPRINT_FILE_NAMES[number]
/** VersionId 的具名发布引用分段。 */
export type LowcodeBlueprintFileVersionKey = 'rule' | 'script' | 'style' | 'manifest'
/** 各工具文件的非负快照编号或缺失引用；不是实际历史列表。 */
export type LowcodeBlueprintFileVersions = Readonly<Record<LowcodeBlueprintFileVersionKey, number | null>>

const FILE_VERSION_KEYS: readonly LowcodeBlueprintFileVersionKey[] = ['rule', 'script', 'style', 'manifest']
const SHORT_FILE_VERSION_KEYS = {r:'rule',s:'script',t:'style',m:'manifest'} as const

function normalizeFileVersionKey(value: string): LowcodeBlueprintFileVersionKey | undefined {
  const legacy = FILE_VERSION_KEYS.find(candidate => candidate === value)
  if (legacy) return legacy
  if (value === 'r') return SHORT_FILE_VERSION_KEYS.r
  if (value === 's') return SHORT_FILE_VERSION_KEYS.s
  if (value === 't') return SHORT_FILE_VERSION_KEYS.t
  if (value === 'm') return SHORT_FILE_VERSION_KEYS.m
  return undefined
}

function emptyVersions(): Record<LowcodeBlueprintFileVersionKey, number | null> {
  return { rule: null, script: null, style: null, manifest: null }
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
  if (fileName === 'style.css') return 'style'
  return 'manifest'
}

/** 解析导航 versionId；空值产生缺失引用，历史单值只兼容旧三文件。 */
export function parseLowcodeBlueprintFileVersions(value: string): LowcodeBlueprintFileVersions {
  const source = value.trim()
  const result = emptyVersions()
  if (!source) return Object.freeze(result)
  if (/^\d+$/.test(source)) {
    const shared = version(source, source)
    return Object.freeze({ rule: shared, script: shared, style: shared, manifest: null })
  }
  const seen = new Set<LowcodeBlueprintFileVersionKey>()
  for (const segment of source.split(';')) {
    const separator = segment.indexOf('=')
    if (separator <= 0 || separator === segment.length - 1) {
      throw new LowcodeApiError(0, `导航文件版本分段无效：${segment}`)
    }
    const key = normalizeFileVersionKey(segment.slice(0, separator).trim())
    const rawVersion = segment.slice(separator + 1).trim()
    if (key === undefined) {
      throw new LowcodeApiError(0, `未知导航文件版本分段：${segment.slice(0, separator).trim()}`)
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
    .map(key => {
      const shortKey = Object.entries(SHORT_FILE_VERSION_KEYS).find(([, value]) => value === key)?.[0]
      if (!shortKey) throw new LowcodeApiError(0, `导航文件版本缺少短键：${key}`)
      return `${shortKey}=${versions[key]}`
    })
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
