/**
 * @module @spark-appworks/spark-ai:class-model/class-model/schema/model-json-schema-ref
 * 职责：定义 DTS bundle shard 内与跨 shard $defs 声明 schema 的 JSON Pointer $ref 格式。
 * 边界：只做 ref 字符串编解码和相对路径计算，不读写 bundle 文件、不解析 TypeScript 类型。
 * AI用途：排查 schema $ref 如何从声明名定位到同文件或跨文件 $defs 时，用本模块确认寻址规则。
 */

const MODEL_JSON_SCHEMA_MARKER = '#/$defs/'

/** JSON Pointer token 编码（RFC 6901）。 */
export function jsonPointerToken(value: string): string {
  return value.replaceAll('~', '~0').replaceAll('/', '~1')
}

/** JSON Pointer token 解码。 */
export function decodeJsonPointerToken(value: string): string {
  return value.replaceAll('~1', '/').replaceAll('~0', '~')
}

/** 同 shard 内 $defs 声明 schema 指针。 */
export function modelJsonSchemaRefPointer(className: string): string {
  return `${MODEL_JSON_SCHEMA_MARKER}${jsonPointerToken(className)}`
}

/** 跨 shard 或同 shard 的 $defs 声明 schema $ref。 */
export function modelJsonSchemaRefForBundleFile(
  currentBundleFile: string,
  targetBundleFile: string | undefined,
  className: string,
): string {
  const pointer = modelJsonSchemaRefPointer(className)
  if (targetBundleFile === undefined || targetBundleFile === currentBundleFile) return pointer
  const relativePath = relativeBundlePath(dirnameBundlePath(currentBundleFile), targetBundleFile)
  return `${relativePath}${pointer}`
}

/** 从 $ref 解析声明名（支持 #/$defs/X 与相对路径前缀）。 */
export function parseModelJsonSchemaRef(ref: string): string | undefined {
  const markerIndex = ref.indexOf(MODEL_JSON_SCHEMA_MARKER)
  if (markerIndex < 0) return undefined
  const encodedName = ref.slice(markerIndex + MODEL_JSON_SCHEMA_MARKER.length)
  if (encodedName.length === 0) return undefined
  return decodeJsonPointerToken(encodedName)
}

function normalizeBundlePath(path: string): string {
  return path.replaceAll('\\', '/')
}

function dirnameBundlePath(path: string): string {
  const normalized = normalizeBundlePath(path)
  const index = normalized.lastIndexOf('/')
  return index < 0 ? '' : normalized.slice(0, index)
}

function relativeBundlePath(fromDir: string, targetFile: string): string {
  const fromParts = splitBundlePath(fromDir)
  const targetParts = splitBundlePath(targetFile)
  let commonLength = 0
  while (
    commonLength < fromParts.length
    && commonLength < targetParts.length
    && fromParts[commonLength] === targetParts[commonLength]
  ) {
    commonLength += 1
  }
  const parentParts = fromParts.slice(commonLength).map(() => '..')
  const childParts = targetParts.slice(commonLength)
  const relativeParts = [...parentParts, ...childParts]
  return relativeParts.length === 0 ? '.' : relativeParts.join('/')
}

function splitBundlePath(path: string): string[] {
  return normalizeBundlePath(path).split('/').filter(part => part.length > 0)
}
