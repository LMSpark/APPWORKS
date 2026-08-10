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

  checkSrcImplementationRules(root, exclude, violations)
  checkWorkspacePackageImports(root, exclude, violations)
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

function checkSrcImplementationRules(root, exclude, violations) {
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

    if (rel.includes('/features/')) continue
    forEachParsedSource(filePath, root, ({ file, sourceFile, lineOffset }) => {
      for (const ref of collectModuleReferences(sourceFile)) {
        if (ref.specifier === '@/features' || ref.specifier.startsWith('@/features/') || ref.specifier.includes('/features/')) {
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

function checkWorkspacePackageImports(root, exclude, violations) {
  const packages = collectWorkspacePackages(root)

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
        allowedDeps: Object.keys(packageJson.dependencies ?? {}).filter((depName) => depName.startsWith('@spark-appworks/')),
      }
    })
    .filter((pkg) => pkg !== null)
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
