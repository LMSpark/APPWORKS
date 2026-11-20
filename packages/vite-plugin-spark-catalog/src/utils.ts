/**
 * SPARK 组件系统共享工具函数
 *
 */

import { basename } from 'node:path'

/* --------------------------------------------------------------------------
 * 命名转换
 * ----------------------------------------------------------------------- */

export function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase()
}

export function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/')
}

/* --------------------------------------------------------------------------
 * Skill 类型推断
 * ----------------------------------------------------------------------- */

/**
 * 根据文件路径推断组件的 skill type（r-xxx 格式）。
 * 返回 null 表示该组件应被跳过（如 Scope 内部组件）。
 */
export function inferSkillType(absolutePath: string, fallbackType: string): string | null {
  const normalizedPath = normalizePath(absolutePath)
  const fileName = basename(absolutePath, '.vue')

  if (normalizedPath.includes('/components/fields/') && fileName.startsWith('Field')) {
    return `r-${toKebabCase(fileName.replace(/^Field/, ''))}`
  }

  if (normalizedPath.includes('/components/containers/') && fileName.startsWith('Renderer')) {
    if (fileName.endsWith('Scope')) return null
    return `r-${toKebabCase(fileName.replace(/^Renderer/, ''))}`
  }

  return fallbackType
}

/**
 * 根据文件路径生成默认 skill 描述文本。
 */
export function buildImplicitSkillDescription(absolutePath: string, skillType: string): string {
  const normalizedPath = normalizePath(absolutePath)
  const fileName = basename(absolutePath, '.vue')

  if (normalizedPath.includes('/components/fields/') && fileName.startsWith('Field')) {
    return `SPARK 字段组件，可在 rule.json 中通过 type="${skillType}" 使用。`
  }

  if (normalizedPath.includes('/components/containers/') && fileName.startsWith('Renderer')) {
    return `SPARK 容器组件，可在 rule.json 中通过 type="${skillType}" 组织子组件。`
  }

  if (normalizedPath.includes('/features/')) {
    return `SPARK 业务组件，可在 rule.json 中通过 type="${skillType}" 使用。`
  }

  if (normalizedPath.includes('/packages/') && normalizedPath.includes('/src/components/')) {
    return `SPARK 包组件，可在 rule.json 中通过 type="${skillType}" 使用。`
  }

  if (normalizedPath.includes('/src/views/')) {
    return `SPARK 视图组件，可在注册表中通过 type="${skillType}" 引用。`
  }

  return `SPARK 组件，可在注册表中通过 type="${skillType}" 使用。`
}

/* --------------------------------------------------------------------------
 * 组件描述
 * ----------------------------------------------------------------------- */

export type SkillMeta = {
  type: string
  description: string
}

/**
 * 基于路径生成组件注册描述；不读取或解析约定标签。
 */
export function parseSkillMeta(absolutePath: string, fallbackType: string): SkillMeta | null {
  const skillType = inferSkillType(absolutePath, fallbackType)
  if (skillType === null) return null

  return {
    type: skillType,
    description: buildImplicitSkillDescription(absolutePath, skillType),
  }
}

/* --------------------------------------------------------------------------
 * 日志
 * ----------------------------------------------------------------------- */

export function createLogger(namespace: string) {
  const prefix = `[${namespace}]`
  return {
    info: (...args: unknown[]) => { console.info(prefix, ...args) },
    warn: (...args: unknown[]) => { console.warn(prefix, ...args) },
    error: (...args: unknown[]) => { console.error(prefix, ...args) },
    debug: (...args: unknown[]) => {
      if (process.env['DEBUG'] !== undefined) console.info(prefix, '(debug)', ...args)
    },
  }
}
