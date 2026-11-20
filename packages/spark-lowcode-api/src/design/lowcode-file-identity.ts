/**
 * @module @spark-appworks/spark-lowcode-api:design/lowcode-file-identity
 * 职责：保留正式文件 basename 和目录身份，拒绝已证实无法精确定位的内容请求。
 * 边界：不改写路径，不补后端 normalizePath 的含点目录缺口。
 * AI用途：读、删及依赖回读的上传在派发前使用同一定位校验。
 */
import { LowcodeApiError } from '../core/lowcode-api-error.js'

/** 原样返回单个 basename；目录列表和内容定位共享，空白是名称的一部分。 */
export function exactFileName(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value === '.' || value === '..' || /[\\/\u0000]/.test(value)) {
    throw new LowcodeApiError(0, 'fileName 不是合法的单文件名称')
  }
  return value
}

/** 正式服务 normalizePath 遇到含点目录会忽略 fileName；派发前拒绝，根目录仍可用。 */
export function exactFileContentPath(value: unknown): string {
  if (typeof value !== 'string' || value.includes('.') || value.includes('\u0000')) {
    throw new LowcodeApiError(0, 'customPath 无法由当前文件服务精确定位')
  }
  return value
}

/** 目录列举保留原路径，包括根和含点目录，但缺失值不能变成根查询。 */
export function exactFileDirectoryPath(value: unknown): string {
  if (typeof value !== 'string' || value.includes('\u0000')) throw new LowcodeApiError(0, 'folderPath 必须是明确目录字符串')
  return value
}

/** 上传与内容端点清洗规则不同；仅接纳服务不会改写的原始定位，不模拟清洗后另存。 */
export function assertExactTextUpload(locator: Readonly<{customPath: string; fileName: string; appType: string}>): void {
  const {customPath, fileName, appType} = locator
  if (fileName.startsWith('.') || fileName.length > 255 || /[\u0000-\u001f\u007f]/.test(fileName) || /^ *$/.test(fileName)
    || (appType === 'jsondatapath' && !fileName.endsWith('.json'))) {
    throw new LowcodeApiError(0, 'fileName 会被当前上传服务改写或拒绝')
  }
  if (customPath.includes('\\') || customPath.split('/').some(segment => segment !== '' && (segment === 'unknown' || /^ *$/.test(segment) || segment.length > 255 || /[\u0000-\u001f\u007f]/.test(segment)))) {
    throw new LowcodeApiError(0, 'customPath 会被当前上传服务改写')
  }
}

/** 核实际ACK的目录分段与basename；服务决定的企业/发布商前缀不由客户端猜造。 */
export function matchesFileUploadPath(actual: unknown, locator: Readonly<{customPath: string; fileName: string; appType: string}>): boolean {
  if (typeof actual !== 'string' || !actual.startsWith('/') || /[\\\u0000-\u001f\u007f]/.test(actual)) return false
  const parts = actual.split('/'), expected = [...locator.customPath.split('/').filter(segment => segment !== ''), locator.fileName]
  if (parts.some(segment => segment === '.' || segment === '..')) return false
  const extra = parts.length - expected.length - 1
  const namespaceValid = locator.appType === 'jsondatapath'
    ? extra === 1 && parts[1] !== ''
    : (extra === 1 && /^DesignFilePaths_.+$/i.test(parts[1] ?? '') && parts[1]?.toLowerCase() !== expected[0]?.toLowerCase())
      || (extra === 0 && /^DesignFilePaths_.+$/i.test(expected[0] ?? ''))
  return namespaceValid && expected.every((segment, index) => parts[parts.length - expected.length + index] === segment)
}
