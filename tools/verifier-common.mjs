import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

export const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.vue'])
export const SCRIPT_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.vue'])

export function toPosixPath(value) {
  return value.replaceAll(path.sep, '/')
}

export function relativePath(root, filePath) {
  return toPosixPath(path.relative(root, filePath))
}

export function createDefaultExcluder(root) {
  return (filePath) => {
    const rel = relativePath(root, filePath)
    return rel.startsWith('dist/')
      || rel.includes('/dist/')
      || rel.includes('/node_modules/')
      || rel.includes('/.git/')
  }
}

export function* walkFiles(dir, options = {}) {
  const extensions = options.extensions ?? SOURCE_EXTENSIONS
  const exclude = options.exclude ?? (() => false)
  if (!fs.existsSync(dir)) return

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (exclude(fullPath)) continue

    if (entry.isDirectory()) {
      yield* walkFiles(fullPath, options)
      continue
    }

    if (extensions.has(path.extname(entry.name))) {
      yield fullPath
    }
  }
}

export function collectSourceFiles(options) {
  const root = options.root
  const includeRoots = options.includeRoots ?? []
  const includeFiles = options.includeFiles ?? []
  const extensions = options.extensions ?? SOURCE_EXTENSIONS
  const exclude = options.exclude ?? createDefaultExcluder(root)
  const files = []
  const seen = new Set()

  for (const includeRoot of includeRoots) {
    const absoluteRoot = path.resolve(root, includeRoot)
    for (const file of walkFiles(absoluteRoot, { extensions, exclude })) {
      const rel = relativePath(root, file)
      if (!seen.has(rel)) {
        seen.add(rel)
        files.push(file)
      }
    }
  }

  for (const includeFile of includeFiles) {
    const fullPath = path.resolve(root, includeFile)
    if (!fs.existsSync(fullPath) || exclude(fullPath)) continue
    if (!extensions.has(path.extname(fullPath))) continue
    const rel = relativePath(root, fullPath)
    if (!seen.has(rel)) {
      seen.add(rel)
      files.push(fullPath)
    }
  }

  return files.sort((left, right) => relativePath(root, left).localeCompare(relativePath(root, right)))
}

export function extractVueScripts(source) {
  const scripts = []
  const scriptPattern = /<script\b[^>]*>([\s\S]*?)<\/script>/giu
  let match

  while ((match = scriptPattern.exec(source)) !== null) {
    const content = match[1] ?? ''
    const start = match.index + match[0].indexOf(content)
    const lineOffset = source.slice(0, start).split(/\r?\n/u).length - 1
    scripts.push({ content, lineOffset })
  }

  return scripts
}

export function scriptKindForFile(filePath) {
  if (filePath.endsWith('.tsx') || filePath.endsWith('.jsx') || filePath.endsWith('.vue')) {
    return ts.ScriptKind.TSX
  }
  if (filePath.endsWith('.js') || filePath.endsWith('.mjs') || filePath.endsWith('.cjs')) {
    return ts.ScriptKind.JS
  }
  return ts.ScriptKind.TS
}

export function parseSourceFile(file, source, scriptKind) {
  return ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind)
}

export function lineFor(sourceFile, node, lineOffset = 0) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1 + lineOffset
}

export function forEachParsedSource(filePath, root, callback) {
  const rel = relativePath(root, filePath)
  const source = fs.readFileSync(filePath, 'utf8')

  if (filePath.endsWith('.vue')) {
    for (const script of extractVueScripts(source)) {
      const sourceFile = parseSourceFile(rel, script.content, ts.ScriptKind.TSX)
      callback({
        file: rel,
        filePath,
        source: script.content,
        sourceFile,
        lineOffset: script.lineOffset,
      })
    }
    return
  }

  const sourceFile = parseSourceFile(rel, source, scriptKindForFile(filePath))
  callback({ file: rel, filePath, source, sourceFile, lineOffset: 0 })
}

export function formatViolation(violation) {
  return `${violation.file}:${violation.line} ${violation.message}`
}

export function printViolations(title, violations, maxItems = 200) {
  if (violations.length === 0) return
  console.error(`${title}: ${violations.length} violation(s).`)
  for (const violation of violations.slice(0, maxItems)) {
    console.error(`  ${formatViolation(violation)}`)
  }
  if (violations.length > maxItems) {
    console.error(`  ... ${violations.length - maxItems} more violation(s)`)
  }
}

export function moduleSpecifierText(node) {
  if (node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
    return node.moduleSpecifier.text
  }
  return null
}

export function collectModuleReferences(sourceFile) {
  const refs = []

  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const specifier = moduleSpecifierText(node)
      if (specifier !== null) {
        refs.push({ specifier, node })
      }
    }

    if (
      ts.isCallExpression(node)
      && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments.length === 1
      && ts.isStringLiteralLike(node.arguments[0])
    ) {
      refs.push({ specifier: node.arguments[0].text, node })
    }

    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteralLike(node.argument.literal)) {
      refs.push({ specifier: node.argument.literal.text, node })
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return refs
}

export function parseCliArgs(argv, defaults = {}) {
  const result = {
    root: defaults.root ?? process.cwd(),
    includeRoots: [],
    includeFiles: [],
  }
  let hasExplicitRoots = false
  let hasExplicitFiles = false

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--root') {
      result.root = path.resolve(requireValue(argv, index, arg))
      index += 1
      continue
    }
    if (arg === '--include-root') {
      result.includeRoots.push(requireValue(argv, index, arg))
      hasExplicitRoots = true
      index += 1
      continue
    }
    if (arg === '--include-file') {
      result.includeFiles.push(requireValue(argv, index, arg))
      hasExplicitFiles = true
      index += 1
      continue
    }
    if (arg === '--help' || arg === '-h') {
      result.help = true
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }

  if (!hasExplicitRoots) result.includeRoots = defaults.includeRoots ?? []
  if (!hasExplicitFiles) result.includeFiles = defaults.includeFiles ?? []
  return result
}

export function isCliEntrypoint(metaUrl) {
  const entry = process.argv[1]
  return entry !== undefined && pathToFileURL(path.resolve(entry)).href === metaUrl
}

export function packageNameFromSpecifier(specifier) {
  if (!specifier.startsWith('@')) {
    return specifier.split('/')[0] ?? specifier
  }
  const parts = specifier.split('/')
  return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : specifier
}

export function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function requireValue(argv, index, arg) {
  const value = argv[index + 1]
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${arg} requires a value`)
  }
  return value
}
