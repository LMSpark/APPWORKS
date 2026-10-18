import {dirname, relative, resolve} from 'node:path'
import ts from 'typescript'

type DeclarationHostOptions = {
  files: ReadonlyMap<string, string>
  sourceOptions: ts.CompilerOptions
}

/** ClassModel 构建使用本轮内存声明；不依赖包的历史构建产物。 */
export function createInMemoryDeclarationCompilerHost(options: DeclarationHostOptions): ts.CompilerHost {
  const compilerOptions: ts.CompilerOptions = {
    allowJs: false, declaration: true, emitDeclarationOnly: true, skipLibCheck: true,
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
  }
  const {rootDir, outDir, baseUrl, paths} = options.sourceOptions
  if (rootDir === undefined || outDir === undefined || baseUrl === undefined) {
    throw new Error('ClassModel declaration host requires source rootDir, outDir and baseUrl')
  }
  // 与 emit 使用同一份路径映射，只把源码根换成本轮虚拟声明根。
  // 保留 TS 的精确/通配符/扩展名解析，不维护另一份包别名表。
  compilerOptions.baseUrl = outDir
  compilerOptions.paths = Object.fromEntries(Object.entries(paths ?? {}).map(([name, targets]) => [
    name, targets.map(target => resolve(outDir, relative(rootDir, resolve(baseUrl, target)))),
  ]))
  const host = ts.createCompilerHost(compilerOptions, true)
  const normalize = (path: string): string => host.getCanonicalFileName(resolve(path))
  const originalFileExists = host.fileExists.bind(host)
  const originalReadFile = host.readFile.bind(host)
  const originalGetSourceFile = host.getSourceFile.bind(host)
  const originalDirectoryExists = host.directoryExists?.bind(host) ?? ts.sys.directoryExists
  const fileByKey = new Map([...options.files].map(([fileName, text]) => [
    normalize(fileName), {fileName: resolve(fileName), text},
  ]))
  const directories = new Set<string>()
  for (const fileName of options.files.keys()) {
    let directory = dirname(resolve(fileName))
    while (!directories.has(normalize(directory))) {
      directories.add(normalize(directory))
      directory = dirname(directory)
    }
  }
  host.directoryExists = path => directories.has(normalize(path)) || originalDirectoryExists(path)
  host.fileExists = fileName => fileByKey.has(normalize(fileName)) || originalFileExists(fileName)
  host.readFile = fileName => fileByKey.get(normalize(fileName))?.text ?? originalReadFile(fileName)
  host.getSourceFile = (fileName, languageVersionOrOptions, onError, shouldCreateNewSourceFile) => {
    const file = fileByKey.get(normalize(fileName))
    return file === undefined
      ? originalGetSourceFile(fileName, languageVersionOrOptions, onError, shouldCreateNewSourceFile)
      : ts.createSourceFile(file.fileName, file.text, languageVersionOrOptions, true, ts.ScriptKind.TS)
  }
  const cache = ts.createModuleResolutionCache(rootDir, normalize, compilerOptions)
  host.resolveModuleNameLiterals = (literals, containingFile) => literals.map(literal => {
    const result = ts.resolveModuleName(literal.text, containingFile, compilerOptions, host, cache)
    const isSourceAlias = Object.keys(paths ?? {}).some(pattern => {
      const wildcard = pattern.indexOf('*')
      return wildcard < 0 ? literal.text === pattern : literal.text.startsWith(pattern.slice(0, wildcard))
        && literal.text.endsWith(pattern.slice(wildcard + 1)) && literal.text.length >= pattern.length - 1
    })
    if (isSourceAlias && (result.resolvedModule === undefined
      || !fileByKey.has(normalize(result.resolvedModule.resolvedFileName)))) {
      throw new Error(`ClassModel alias ${literal.text} has no current emitted declaration (from ${containingFile})`)
    }
    return result
  })
  return host
}
