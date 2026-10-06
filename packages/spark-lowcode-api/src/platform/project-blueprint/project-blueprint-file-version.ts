/**
 * @module @spark-appworks/spark-lowcode-api:platform/project-blueprint/project-blueprint-file-version
 * 职责：解析与编码工具三文件的正式发布引用。
 * 边界：文件名快照独立存在，裸文件是工作内容；场景文件没有三文件发布指针。
 * AI用途：按明确 rule/script/style 引用定位文件，禁止以最大编号推断发布版本。
 */
import { LowcodeApiError } from '../../core/lowcode-api-error.js'

export const LOWCODE_BLUEPRINT_FILE_NAMES = ['rule.json', 'script.js', 'style.css'] as const

/** 工具定义的三个文件名；场景共享 pagedata.json 不属于此集合。 */
export type LowcodeBlueprintFileName = typeof LOWCODE_BLUEPRINT_FILE_NAMES[number]
/** VersionId 的三个具名发布引用分段。 */
export type LowcodeBlueprintFileVersionKey = 'rule' | 'script' | 'style'
/** 各工具文件的非负快照编号或缺失引用；不是实际历史列表。 */
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

/** 解析导航 versionId；空值产生缺失引用，历史单值对三个文件共用。 */
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
