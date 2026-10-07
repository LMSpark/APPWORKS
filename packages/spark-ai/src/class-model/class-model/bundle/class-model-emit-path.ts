/**
 * @module @spark-appworks/spark-ai:class-model/class-model/bundle/class-model-emit-path
 * 职责：DtsTypeDeclarationModel 编译期内存 emit 的虚拟路径约定（非磁盘目录）。
 * 边界：只维护路径字符串规则；不访问文件系统，不创建 TypeScript Program。
 * AI用途：判断 bundle 键是否为 class-model-emit 虚拟源或映射 repo 路径时，用本模块统一约定。
 */
export const CLASS_MODEL_EMIT_PREFIX = 'class-model-emit/' as const

export const CLASS_MODEL_EMIT_SOURCE = 'class-model-emit' as const

/** DtsTypeDeclarationModel 内存 emit 来源标识（对应 tsconfig.class-model-emit.json）。 */
export type ClassModelEmitSource = typeof CLASS_MODEL_EMIT_SOURCE

export const CLASS_MODEL_EMIT_TSCONFIG = 'tsconfig.class-model-emit.json' as const

/** 判断 repo 相对路径是否为 DtsTypeDeclarationModel 内存 emit 虚拟键。 */
export function isClassModelEmitPath(path: string | undefined): path is string {
  if (typeof path !== 'string') return false
  return normalizeRepoRelativePath(path).startsWith(CLASS_MODEL_EMIT_PREFIX)
}

function hasPathSuffix(path: string, suffix: string): boolean {
  return path.endsWith(suffix)
}

function normalizeRepoRelativePath(path: string): string {
  return path.split('\\').join('/')
}

function replaceSourceExtension(path: string, sourceExt: string): string {
  return `${path.slice(0, -sourceExt.length)}.d.ts`
}

/** 将 repo 相对源码路径映射为内存 emit 虚拟 .d.ts 键。 */
export function toClassModelEmitPath(repoRelativePath: string): string {
  const normalized = normalizeRepoRelativePath(repoRelativePath)
  if (isClassModelEmitPath(normalized)) return normalized
  if (hasPathSuffix(normalized, '.vue')) {
    return `${CLASS_MODEL_EMIT_PREFIX}${normalized}.d.ts`
  }
  const tsExtensions = ['.tsx', '.ts', '.mts', '.cts'] as const
  for (const ext of tsExtensions) {
    if (hasPathSuffix(normalized, ext)) {
      return `${CLASS_MODEL_EMIT_PREFIX}${replaceSourceExtension(normalized, ext)}`
    }
  }
  const jsExtensions = ['.jsx', '.js', '.mjs', '.cjs'] as const
  for (const ext of jsExtensions) {
    if (hasPathSuffix(normalized, ext)) {
      return `${CLASS_MODEL_EMIT_PREFIX}${replaceSourceExtension(normalized, ext)}`
    }
  }
  throw new Error(`Cannot map source to DtsTypeDeclarationModel emit path: ${repoRelativePath}`)
}

/** 将内存 emit 虚拟 .d.ts 键还原为对应源文件 repo 相对路径。 */
export function sourceFileFromEmitPath(emitPath: string): string {
  const normalized = normalizeRepoRelativePath(emitPath)
  const sourcePath = isClassModelEmitPath(normalized)
    ? normalized.slice(CLASS_MODEL_EMIT_PREFIX.length)
    : normalized
  if (hasPathSuffix(sourcePath, '.vue.d.ts')) return sourcePath.slice(0, -'.d.ts'.length)
  const typedDtsSuffixes = ['.tsx', '.ts', '.mts', '.cts', '.jsx', '.js', '.mjs', '.cjs'] as const
  for (const ext of typedDtsSuffixes) {
    if (hasPathSuffix(sourcePath, `${ext}.d.ts`)) {
      return sourcePath.slice(0, -'.d.ts'.length)
    }
  }
  if (hasPathSuffix(sourcePath, '.d.ts')) return `${sourcePath.slice(0, -'.d.ts'.length)}.ts`
  return sourcePath
}

/**
 * manifest / snapshot 路径 → 内存 emit 虚拟键。
 * 已是 emit 键则原样返回；源码 repo 相对键则映射为 emit。
 */
export function resolveClassModelEmitPath(path: string): string {
  const normalized = normalizeRepoRelativePath(path)
  if (isClassModelEmitPath(normalized)) return normalized
  return toClassModelEmitPath(normalized)
}

function readBundlePathRecordEntry(table: Readonly<Record<string, unknown>>, path: string): unknown {
  const normalized = normalizeRepoRelativePath(path)
  if (Object.hasOwn(table, normalized)) return table[normalized]
  const sourceKey = sourceFileFromEmitPath(normalized)
  if (sourceKey !== normalized && Object.hasOwn(table, sourceKey)) return table[sourceKey]
  if (!isClassModelEmitPath(normalized)) {
    const emitKey = toClassModelEmitPath(normalized)
    if (Object.hasOwn(table, emitKey)) return table[emitKey]
  }
  return undefined
}

/** 读取 manifest.files 条目；兼容 emit 键与源码 repo 相对键。 */
export function readManifestFileEntry(
  manifest: { files?: Readonly<Record<string, unknown>> } | undefined,
  path: string,
): unknown {
  return readBundlePathRecordEntry(manifest?.files ?? {}, path)
}

/** 读取 .dts-manifest.json entries；键查找规则与 manifest.files 一致。 */
export function readDtsManifestSnapshotEntry(
  snapshot: { entries?: Readonly<Record<string, unknown>> } | undefined,
  path: string,
): unknown {
  return readBundlePathRecordEntry(snapshot?.entries ?? {}, path)
}

/** 增量 merge 时统一 changed/target 路径为 manifest 源码 repo 相对键集合。 */
export function normalizeBundleManifestSourcePathSet(paths: Iterable<string>): Set<string> {
  return new Set([...paths].map(path => sourceFileFromEmitPath(normalizeRepoRelativePath(path))))
}
