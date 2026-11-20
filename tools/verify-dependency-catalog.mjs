#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import {
  isCliEntrypoint,
  printViolations,
  readJsonFile,
  relativePath,
  walkFiles,
} from './verifier-common.mjs'

/** pnpm-workspace.yaml `catalog` 中声明的包名（版本真源）。 */
const CATALOG_PACKAGES = new Set([
  'vue',
  'vue-router',
  'element-plus',
  '@element-plus/icons-vue',
  '@vue-flow/background',
  '@vue-flow/controls',
  '@vue-flow/core',
  '@vue-flow/minimap',
  'vxe-table',
  'axios',
  'ajv',
  'jmespath',
  'comlink',
  '@ag-ui/core',
  'codemirror',
  '@codemirror/commands',
  '@codemirror/lang-css',
  '@codemirror/lang-javascript',
  '@codemirror/language',
  '@codemirror/state',
  '@codemirror/view',
  'vanilla-jsoneditor',
  'typescript',
  'vite',
  'vitest',
  'eslint',
  '@eslint/js',
  '@typescript-eslint/eslint-plugin',
  '@typescript-eslint/parser',
  'eslint-plugin-vue',
  'vue-eslint-parser',
  '@types/node',
  '@types/jmespath',
  '@vitejs/plugin-vue',
  '@vue/language-core',
  '@vue/test-utils',
  'vue-tsc',
  'rimraf',
])

/** 运行时依赖单点归属：仅允许 listed package 的 dependencies 声明。 */
const RUNTIME_SINGLE_OWNER = new Map([
  ['axios', '@spark-appworks/spark-utils'],
  ['ajv', '@spark-appworks/spark-json-document'],
  ['jmespath', '@spark-appworks/spark-json-document'],
  ['comlink', '@spark-appworks/spark-ai'],
  ['@ag-ui/core', '@spark-appworks/spark-ai'],
  ['codemirror', '@spark-appworks/spark-component'],
  ['@codemirror/commands', '@spark-appworks/spark-component'],
  ['@codemirror/lang-css', '@spark-appworks/spark-component'],
  ['@codemirror/lang-javascript', '@spark-appworks/spark-component'],
  ['@codemirror/language', '@spark-appworks/spark-component'],
  ['@codemirror/state', '@spark-appworks/spark-component'],
  ['@codemirror/view', '@spark-appworks/spark-component'],
  ['vanilla-jsoneditor', '@spark-appworks/spark-component'],
])

/** 应用壳运行时：仅根 package.json dependencies 安装。 */
const APP_SHELL_RUNTIME = new Set([
  'vue',
  'vue-router',
  'element-plus',
  '@element-plus/icons-vue',
  '@vue-flow/background',
  '@vue-flow/controls',
  '@vue-flow/core',
  '@vue-flow/minimap',
  'vxe-table',
])

const ROOT_PACKAGE = 'spark-appworks'

function readPnpmCatalog(root) {
  const filePath = path.join(root, 'pnpm-workspace.yaml')
  const text = fs.readFileSync(filePath, 'utf8')
  const catalog = {}
  let inCatalog = false

  for (const line of text.split(/\r?\n/u)) {
    if (/^catalog:\s*$/u.test(line)) {
      inCatalog = true
      continue
    }
    if (!inCatalog) continue
    if (/^\S/u.test(line)) break

    const match = line.match(/^\s+(('[^']+'|"[^"]+"|[^:\s]+)):\s*(.+?)\s*$/u)
    if (!match) continue
    const rawKey = match[1]
    const key = rawKey.startsWith("'") || rawKey.startsWith('"')
      ? rawKey.slice(1, -1)
      : rawKey
    catalog[key] = match[2]
  }

  return catalog
}

function listWorkspacePackages(root) {
  const packagesDir = path.join(root, 'packages')
  const entries = []

  if (fs.existsSync(path.join(root, 'package.json'))) {
    entries.push({
      dirName: '.',
      packageName: readJsonFile(path.join(root, 'package.json')).name,
      packageJsonPath: path.join(root, 'package.json'),
    })
  }

  for (const dirName of fs.readdirSync(packagesDir)) {
    const packageJsonPath = path.join(packagesDir, dirName, 'package.json')
    if (!fs.existsSync(packageJsonPath)) continue
    const packageJson = readJsonFile(packageJsonPath)
    entries.push({ dirName: `packages/${dirName}`, packageName: packageJson.name, packageJsonPath })
  }

  return entries
}

function collectDeclaredDeps(packageJson, section) {
  const bucket = packageJson[section]
  if (!bucket || typeof bucket !== 'object') return []
  return Object.entries(bucket).map(([name, version]) => ({ name, version, section }))
}

/** 收集包源码中引用的 workspace 包名（去子路径）。 */
function collectWorkspaceImports(sourceDir) {
  const names = new Set()
  const pattern = /['"](@spark-appworks\/[a-z0-9-]+)(?:\/[^'"]*)?['"]/gu
  for (const file of walkFiles(sourceDir, {
    extensions: new Set(['.ts', '.vue']),
    exclude: fullPath => fullPath.includes(`${path.sep}node_modules`) || fullPath.includes(`${path.sep}dist`),
  })) {
    const text = fs.readFileSync(file, 'utf8')
    for (const match of text.matchAll(pattern)) names.add(match[1])
  }
  return names
}

export function scanDependencyCatalogRules(options = {}) {
  const root = options.root ?? process.cwd()
  const violations = []
  const catalog = readPnpmCatalog(root)
  const relWorkspace = relativePath(root, path.join(root, 'pnpm-workspace.yaml'))

  for (const key of CATALOG_PACKAGES) {
    if (!(key in catalog)) {
      violations.push({
        file: relWorkspace,
        line: 1,
        message: `catalog 缺少基础依赖项: ${key}`,
      })
    }
  }

  for (const key of Object.keys(catalog)) {
    if (!CATALOG_PACKAGES.has(key)) {
      violations.push({
        file: relWorkspace,
        line: 1,
        message: `catalog 含未登记项 ${key}；请同步 tools/verify-dependency-catalog.mjs 的 CATALOG_PACKAGES`,
      })
    }
  }

  const packages = listWorkspacePackages(root)

  for (const pkg of packages) {
    const packageJson = readJsonFile(pkg.packageJsonPath)
    const relPath = relativePath(root, pkg.packageJsonPath)
    const isRoot = pkg.packageName === ROOT_PACKAGE

    for (const section of ['dependencies', 'devDependencies', 'peerDependencies']) {
      for (const { name, version } of collectDeclaredDeps(packageJson, section)) {
        if (!CATALOG_PACKAGES.has(name)) continue

        if (version !== 'catalog:') {
          violations.push({
            file: relPath,
            line: 1,
            message: `${section}.${name} 必须为 "catalog:"，当前为 "${version}"`,
          })
        }

        if (section === 'dependencies') {
          const owner = RUNTIME_SINGLE_OWNER.get(name)
          if (owner && owner !== pkg.packageName) {
            violations.push({
              file: relPath,
              line: 1,
              message: `${name} 运行时归属 ${owner}，${pkg.packageName} 不得在 dependencies 声明`,
            })
          }

          if (APP_SHELL_RUNTIME.has(name) && !isRoot) {
            violations.push({
              file: relPath,
              line: 1,
              message: `${name} 为应用壳运行时，仅根 package.json dependencies 可安装；${pkg.packageName} 请用 peerDependencies / devDependencies`,
            })
          }
        }
      }
    }

    const sourceDir = path.join(root, pkg.dirName, 'src')
    const declared = new Set(['dependencies', 'devDependencies', 'peerDependencies']
      .flatMap(section => collectDeclaredDeps(packageJson, section).map(dep => dep.name)))
    for (const name of collectWorkspaceImports(sourceDir)) {
      if (name === pkg.packageName || declared.has(name)) continue
      violations.push({
        file: relPath,
        line: 1,
        message: `${pkg.packageName} 源码引用 ${name} 但未在 dependencies/devDependencies/peerDependencies 声明`,
      })
    }

    if (isRoot) {
      for (const name of APP_SHELL_RUNTIME) {
        if (!packageJson.dependencies?.[name]) {
          violations.push({
            file: relPath,
            line: 1,
            message: `根 dependencies 缺少应用壳运行时: ${name}`,
          })
        }
      }
      for (const [name, owner] of RUNTIME_SINGLE_OWNER) {
        if (packageJson.dependencies?.[name]) {
          violations.push({
            file: relPath,
            line: 1,
            message: `根 dependencies 不得重复声明 ${name}（归属 ${owner}）`,
          })
        }
      }
    }
  }

  return { violations }
}

export function runDependencyCatalogCli() {
  const { violations } = scanDependencyCatalogRules()
  if (violations.length > 0) {
    printViolations('dependency catalog', violations)
    return 1
  }
  console.log('dependency catalog: ok')
  return 0
}

if (isCliEntrypoint(import.meta.url)) {
  try {
    process.exit(runDependencyCatalogCli())
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
