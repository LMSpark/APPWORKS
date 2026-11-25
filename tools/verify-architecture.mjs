#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import {
  SCRIPT_EXTENSIONS,
  collectModuleReferences,
  collectSourceFiles,
  createDefaultExcluder,
  forEachParsedSource,
  isCliEntrypoint,
  lineFor,
  packageNameFromSpecifier,
  parseCliArgs,
  printViolations,
  readJsonFile,
  relativePath,
} from './verifier-common.mjs'

const frameworkFreePackages = new Set([
  '@spark-appworks/spark-utils',
  '@spark-appworks/spark-data',
  '@spark-appworks/spark-project-model',
])

const forbiddenFrameworkImports = [
  'vue',
  'vue-router',
  'element-plus',
  '@element-plus/',
  '@vueuse/',
  'pinia',
]

const allowedSparkAiSpecifiers = new Set([
  '@spark-appworks/spark-ai',
  '@spark-appworks/spark-ai/agent',
  '@spark-appworks/spark-ai/class-model',
])

const allowedSparkAiExportKeys = new Set(['.', './agent', './class-model'])

export function scanArchitectureRules(options = {}) {
  const root = options.root ?? process.cwd()
  const exclude = createDefaultExcluder(root)
  const violations = []

  const packages = collectWorkspacePackages(root)
  checkSrcImplementationRules(root, exclude, {violations, packages})
  checkWorkspacePackageImports(root, exclude, {violations, packages})
  checkWorkspaceDependencyGraph(packages, violations)
  checkSparkAiPublicSurface(root, violations)
  checkSparkAiBusinessMaterial(root, exclude, violations)

  return { violations }
}

function checkSparkAiBusinessMaterial(root, exclude, violations) {
  const files = collectSourceFiles({
    root,
    includeRoots: ['packages/spark-ai/src'],
    extensions: SCRIPT_EXTENSIONS,
    exclude,
  })

  const forbidden = [
    { pattern: /\bpageDesign\b/u, label: 'pageDesign' },
    { pattern: /\bPAGE_DESIGN_[A-Z0-9_]*\b/u, label: 'PAGE_DESIGN_*' },
    { pattern: /\bpage-design\b/u, label: 'page-design' },
    { pattern: /\bopenPageDesign\b/u, label: 'openPageDesign' },
    { pattern: /\beditDataSet\b/u, label: 'editDataSet' },
    { pattern: /\beditNodeTree\b/u, label: 'editNodeTree' },
  ]

  for (const filePath of files) {
    const rel = relativePath(root, filePath)
    if (isTestSourcePath(rel)) continue
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/u)
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]
      const match = forbidden.find((item) => item.pattern.test(line))
      if (match === undefined) continue
      violations.push({
        file: rel,
        line: index + 1,
        message: `spark-ai kernel must not contain business material: ${match.label}`,
      })
    }
  }
}

function isTestSourcePath(rel) {
  return rel.includes('/tests/')
    || rel.includes('/__tests__/')
    || /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(rel)
}

export function runArchitectureCli(argv = process.argv.slice(2)) {
  const args = parseCliArgs(argv, { root: process.cwd() })
  if (args.help) {
    console.info('Usage: node tools/verify-architecture.mjs [--root DIR]')
    return 0
  }

  console.log('Verifying architecture rules...\n')
  const { violations } = scanArchitectureRules({ root: args.root })
  if (violations.length > 0) {
    printViolations('Architecture verification failed', violations)
    return 1
  }

  console.log('Architecture verification passed.')
  return 0
}

function checkSrcImplementationRules(root, exclude, {violations, packages}) {
  const legacyFeaturesRoot = path.resolve(root, 'src/features')
  const files = collectSourceFiles({
    root,
    includeRoots: ['src'],
    extensions: SCRIPT_EXTENSIONS,
    exclude,
  })

  for (const filePath of files) {
    const rel = relativePath(root, filePath)
    const content = fs.readFileSync(filePath, 'utf8')
    checkPattern(content, rel, /class\s+\w*Renderer/u, 'src/ must not implement Renderer classes', violations)
    checkPattern(content, rel, /function\s+render[A-Z]\w*/u, 'src/ must not implement render* functions', violations)
    checkPattern(content, rel, /function\s+compileTemplate/u, 'src/ must not implement template compilation', violations)
    checkPattern(content, rel, /function\s+createSandbox/u, 'src/ must not implement sandbox creation', violations)

    if (isPathWithin(legacyFeaturesRoot, filePath)) continue
    forEachParsedSource(filePath, root, ({ file, sourceFile, lineOffset }) => {
      for (const ref of collectModuleReferences(sourceFile)) {
        if (file.startsWith('src/views/') && ['element-plus', '@element-plus/icons-vue'].includes(packageNameFromSpecifier(ref.specifier))) {
          violations.push({file, line: lineFor(sourceFile, ref.node, lineOffset), message: 'Business pages must use SPARK standard components instead of importing Element Plus directly'})
        }
        const boundary = workspaceBoundaryProblem({root, filePath, packages, specifier: ref.specifier})
        if (boundary) violations.push({file, line: lineFor(sourceFile, ref.node, lineOffset), message: boundary})
        const targetPath = resolveSrcModuleTarget(root, filePath, ref.specifier)
        if (targetPath && isPathWithin(legacyFeaturesRoot, targetPath)) {
          violations.push({
            file,
            line: lineFor(sourceFile, ref.node, lineOffset),
            message: 'src/ must not import features outside tests',
          })
        }
      }
    })
  }
}

function resolveSrcModuleTarget(root, importerPath, specifier) {
  if (specifier.startsWith('@/')) {
    return path.resolve(root, 'src', specifier.slice(2))
  }
  if (specifier.startsWith('/src/') || specifier.startsWith('/packages/')) {
    return path.resolve(root, specifier.slice(1))
  }
  if (specifier.startsWith('.')) {
    return path.resolve(path.dirname(importerPath), specifier)
  }
  return undefined
}

function isPathWithin(directory, targetPath) {
  const relative = path.relative(directory, targetPath)
  return relative === ''
    || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}

function checkWorkspacePackageImports(root, exclude, {violations, packages}) {

  for (const pkg of packages) {
    if (!fs.existsSync(pkg.srcDir)) continue
    const files = collectSourceFiles({
      root,
      includeRoots: [path.relative(root, pkg.srcDir)],
      extensions: SCRIPT_EXTENSIONS,
      exclude,
    })
    const allowedDeps = new Set(pkg.allowedDeps)

    for (const filePath of files) {
      forEachParsedSource(filePath, root, ({ file, sourceFile, lineOffset }) => {
        for (const ref of collectModuleReferences(sourceFile)) {
          const boundary = workspaceBoundaryProblem({root, filePath, importer: pkg, packages, specifier: ref.specifier})
          if (boundary) violations.push({file, line: lineFor(sourceFile, ref.node, lineOffset), message: boundary})
          checkWorkspacePackageImport(pkg, packages, allowedDeps, ref, file, sourceFile, lineOffset, violations)
          checkRelativeCrossPackageImport(root, pkg, filePath, ref, file, sourceFile, lineOffset, violations)
          checkFrameworkFreeImport(pkg, ref, file, sourceFile, lineOffset, violations)
          checkSparkAiSpecifier(ref, file, sourceFile, lineOffset, violations)
        }
      })
    }
  }
}

function collectWorkspacePackages(root) {
  const packagesDir = path.join(root, 'packages')
  if (!fs.existsSync(packagesDir)) return []

  return fs.readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const packageDir = path.join(packagesDir, entry.name)
      const packageJsonPath = path.join(packageDir, 'package.json')
      if (!fs.existsSync(packageJsonPath)) return null

      const packageJson = readJsonFile(packageJsonPath)
      if (typeof packageJson.name !== 'string' || !packageJson.name.startsWith('@spark-appworks/')) return null
      return {
        dirName: entry.name,
        packageDir,
        packageName: packageJson.name,
        srcDir: path.join(packageDir, 'src'),
        exports: packageJson.exports,
        allowedDeps: Object.keys(packageJson.dependencies ?? {}).filter((depName) => depName.startsWith('@spark-appworks/')),
        runtimeDeps: Object.keys({...packageJson.dependencies, ...packageJson.optionalDependencies, ...packageJson.peerDependencies})
          .filter((depName) => depName.startsWith('@spark-appworks/')),
      }
    })
    .filter((pkg) => pkg !== null)
}

function workspaceBoundaryProblem({root, filePath, importer, packages, specifier}) {
  const resolved = resolveSrcModuleTarget(root, filePath, specifier)
  if (resolved !== undefined) {
    if (importer && isPathWithin(path.join(root, 'src'), resolved)) {
      return 'workspace packages must not import host src implementation'
    }
    const target = packages.find(pkg => isPathWithin(pkg.packageDir, resolved))
    if (target && target !== importer && (!importer || !specifier.startsWith('.'))) {
      return 'workspace package implementation paths are forbidden; import the declared public entry'
    }
    return undefined
  }

  const target = packages.find(pkg => pkg.packageName === packageNameFromSpecifier(specifier))
  if (!target) return undefined
  const subpath = `.${specifier.slice(target.packageName.length)}`
  const exports = target.exports
  const declarations = Object.entries(exports ?? {})
  if (subpath === '.' && (exports === undefined || exports === null || typeof exports === 'string' || Array.isArray(exports)
    || declarations.length > 0 && declarations.every(([key]) => !key.startsWith('.')))) return undefined
  const entries = declarations.filter(([key]) => key === '.' || key.startsWith('./'))
  const exact = entries.find(([key]) => key === subpath)
  const patterns = entries.filter(([key]) => {
    const wildcard = key.indexOf('*')
    if (wildcard < 0) return false
    const prefix = key.slice(0, wildcard), suffix = key.slice(wildcard + 1)
    return subpath.startsWith(prefix) && subpath.endsWith(suffix) && subpath.length > prefix.length + suffix.length
  }).sort(([left], [right]) => right.indexOf('*') - left.indexOf('*') || right.length - left.length)
  const match = exact ?? patterns[0]
  return match && match[1] !== null && match[1] !== undefined ? undefined : `workspace package subpath is not exported: ${specifier}`
}

function checkWorkspaceDependencyGraph(packages, violations) {
  const byName = new Map(packages.map(pkg => [pkg.packageName, pkg]))
  const completed = new Set()
  const stack = new Map()
  function visit(pkg) {
    if (completed.has(pkg.packageName)) return
    stack.set(pkg.packageName, stack.size)
    for (const name of pkg.runtimeDeps) {
      const index = stack.get(name)
      if (index !== undefined) {
        const cycle = [...stack.keys()].slice(index).concat(name)
        violations.push({file: `packages/${pkg.dirName}/package.json`, line: 1, message: `workspace runtime dependency cycle: ${cycle.join(' -> ')}`})
        continue
      }
      const dependency = byName.get(name)
      if (dependency) visit(dependency)
    }
    stack.delete(pkg.packageName)
    completed.add(pkg.packageName)
  }
  for (const pkg of packages) {
    if (pkg.packageName === '@spark-appworks/spark-component' && pkg.runtimeDeps.includes('@spark-appworks/spark-ai')) {
      violations.push({file: `packages/${pkg.dirName}/package.json`, line: 1, message: 'spark-component must not have a runtime dependency on spark-ai'})
    }
    visit(pkg)
  }
}

function checkWorkspacePackageImport(pkg, packages, allowedDeps, ref, file, sourceFile, lineOffset, violations) {
  if (!ref.specifier.startsWith('@spark-appworks/')) return
  const dependencyName = packageNameFromSpecifier(ref.specifier)
  if (dependencyName === pkg.packageName) return
  if (!packages.some((candidate) => candidate.packageName === dependencyName)) return
  if (allowedDeps.has(dependencyName)) return

  violations.push({
    file,
    line: lineFor(sourceFile, ref.node, lineOffset),
    message: `${pkg.dirName} must not depend on ${dependencyName.replace('@spark-appworks/', '')}; declare it in package.json dependencies first`,
  })
}

function checkRelativeCrossPackageImport(root, pkg, filePath, ref, file, sourceFile, lineOffset, violations) {
  if (!ref.specifier.startsWith('.')) return
  const target = path.resolve(path.dirname(filePath), ref.specifier)
  const packageRelative = path.relative(pkg.packageDir, target)
  if (!packageRelative.startsWith('..') && !path.isAbsolute(packageRelative)) return

  const rootRelative = relativePath(root, target)
  if (!rootRelative.startsWith('packages/')) return
  violations.push({
    file,
    line: lineFor(sourceFile, ref.node, lineOffset),
    message: 'cross-package relative imports are forbidden; use @spark-appworks/* package imports',
  })
}

function checkFrameworkFreeImport(pkg, ref, file, sourceFile, lineOffset, violations) {
  if (!frameworkFreePackages.has(pkg.packageName)) return
  if (!isForbiddenFrameworkImport(ref.specifier)) return
  violations.push({
    file,
    line: lineFor(sourceFile, ref.node, lineOffset),
    message: `${pkg.dirName} is framework-free and must not import ${ref.specifier}`,
  })
}

function checkSparkAiSpecifier(ref, file, sourceFile, lineOffset, violations) {
  if (!ref.specifier.startsWith('@spark-appworks/spark-ai/')) return
  if (allowedSparkAiSpecifiers.has(ref.specifier)) return
  violations.push({
    file,
    line: lineFor(sourceFile, ref.node, lineOffset),
    message: `forbidden @spark-appworks/spark-ai public subpath: ${ref.specifier}`,
  })
}

function checkSparkAiPublicSurface(root, violations) {
  const packageJsonPath = path.join(root, 'packages/spark-ai/package.json')
  if (fs.existsSync(packageJsonPath)) {
    const packageJson = readJsonFile(packageJsonPath)
    const exportKeys = Object.keys(packageJson.exports ?? {})
    assertExactSet(exportKeys, allowedSparkAiExportKeys, 'packages/spark-ai/package.json', 1, 'spark-ai package exports', violations)
  }

  for (const file of ['tsconfig.json', 'tsconfig.typecheck.json', 'vite.config.ts', 'vitest.config.ts', 'vitest.spark-ai.config.ts']) {
    const filePath = path.join(root, file)
    if (!fs.existsSync(filePath)) continue
    const content = fs.readFileSync(filePath, 'utf8')
    const keys = new Set()
    const pattern = /['"](@spark-appworks\/spark-ai(?:\/[^'"]+)?)['"]\s*:/gu
    let match
    while ((match = pattern.exec(content)) !== null) {
      keys.add(match[1])
    }
    assertExactSet([...keys], allowedSparkAiSpecifiers, file, 1, 'spark-ai aliases', violations)
  }
}

function assertExactSet(actualItems, expectedSet, file, line, label, violations) {
  const actualSet = new Set(actualItems)
  const extra = [...actualSet].filter((item) => !expectedSet.has(item))
  const missing = [...expectedSet].filter((item) => !actualSet.has(item))
  if (extra.length === 0 && missing.length === 0) return
  violations.push({
    file,
    line,
    message: `${label} must be exactly [${[...expectedSet].join(', ')}]; extra=[${extra.join(', ')}] missing=[${missing.join(', ')}]`,
  })
}

function isForbiddenFrameworkImport(specifier) {
  return forbiddenFrameworkImports.some((forbidden) => (
    forbidden.endsWith('/')
      ? specifier.startsWith(forbidden)
      : specifier === forbidden || specifier.startsWith(`${forbidden}/`)
  ))
}

function checkPattern(content, file, pattern, message, violations) {
  const match = pattern.exec(content)
  if (match === null || match.index === undefined) return
  violations.push({
    file,
    line: content.slice(0, match.index).split(/\r?\n/u).length,
    message,
  })
}

if (isCliEntrypoint(import.meta.url)) {
  try {
    process.exit(runArchitectureCli())
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
