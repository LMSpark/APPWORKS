#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import {
  isCliEntrypoint,
  parseCliArgs,
  printViolations,
  relativePath,
  walkFiles,
} from './verifier-common.mjs'

const docExtensions = new Set(['.md', '.dm'])

const retiredServerTextExtensions = new Set([
  '',
  '.cjs',
  '.css',
  '.dm',
  '.example',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mjs',
  '.mts',
  '.properties',
  '.ps1',
  '.scss',
  '.sh',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.vue',
  '.xml',
  '.yaml',
  '.yml',
])

const retiredServerExcludedRoots = new Set([
  '.git',
  'ai-coding-kit',
  'artifacts',
  'backend-api-contracts',
  'dist',
  'generated',
  'node_modules',
  'notes',
])

const retiredServerExcludedFiles = new Set(['CHANGELOG.md'])

const retiredServerPaths = [
  ['spark', 'ai', 'server'].join('-'),
  ['.env', 'java', 'example'].join('.'),
  ['dev', 'startup', 'pid.txt'].join('-'),
  ['public', 'config', 'default.json'].join('/'),
  ['scripts', 'app-sse-client.mjs'].join('/'),
  ['scripts', 'build-all.mjs'].join('/'),
  ['scripts', 'load-java-env.mjs'].join('/'),
  ['scripts', 'migrate-pages-config-cleanup.d.mts'].join('/'),
  ['scripts', 'start-dev.mjs'].join('/'),
  ['scripts', 'verify-ai-direct-turn-class-model.mjs'].join('/'),
  ['knowledge', 'java-backend.md'].join('/'),
]

const retiredServerMarkers = [
  ['spark', 'ai', 'server'].join('-'),
  ['.env', 'java'].join('.'),
  ['127.0.0.1', '8180'].join(':'),
  ['', 'api', 'config', 'default'].join('/'),
  ['AI', 'BACKEND', 'URL'].join('_'),
  ['SPARK', 'AI', 'SERVER'].join('_'),
  ['load', 'Local', 'Java', 'Env'].join(''),
  ['load', 'App', 'Config'].join(''),
  ['Tenant', 'Resolver'].join(''),
  ['App', 'Full', 'Config'].join(''),
]

const standardMarkdownNames = new Set([
  'AGENTS.md',
  'API.md',
  'ARCHITECTURE.md',
  'CHANGELOG.md',
  'CONTRIBUTING.md',
  'README.md',
  'SKILL.md',
])

const legacyMarkdownAllowlist = new Set([
  'docs/SPARK_APPWORKS_PROJECT_DEEP_DIVE_ZH.md',
  'docs/SPARK_VIEW_PROJECT_DEEP_DIVE_ZH.md',
  'docs/architecture/DATAFLOW_ARCHITECTURE.md',
  'docs/architecture/PERMISSION_SYSTEM.md',
  'docs/architecture/PLATFORM_TENANT_ROUTING.md',
  'docs/architecture/SPARK_PAGE_CONFIG_ARCHITECTURE.md',
  'docs/guides/COMPONENT_DEVELOPMENT.md',
  'docs/guides/CONDITION_EXPRESSION.md',
  'docs/guides/CONFIG_SYSTEM.md',
  'docs/guides/DATA_MANAGEMENT.md',
  'docs/guides/QUICKSTART.md',
  'docs/guides/SAVE_DATASET_ACTION.md',
  'docs/guides/TREE_CAPABILITY.md',
  'packages/spark-project-model/src/MODEL-HIERARCHY.md',
  'packages/spark-project-model/src/STRUCTURE.md',
  'packages/spark-utils/REQUEST_GUIDE.md',
])

const kebabMarkdownPattern = /^(?:[0-9]{2}-)?[a-z0-9]+(?:-[a-z0-9]+)*\.md$/u
const localizedReadmePattern = /^README\.[a-z]{2}(?:-[A-Z]{2})?\.md$/u
const domainModelPattern = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*\.dm$/u
const semverPattern = /^\d+\.\d+\.\d+$/u
const integerPattern = /^\d+$/u
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/u
const dateNoisePattern = /(?:^|[-_])20\d{2}(?:[-_]\d{2}){0,2}(?:$|[-_])/u
const versionNoisePattern = /(?:^|[-_])v\d+(?:$|[-_])/iu

const filenameNoiseTokens = new Set([
  'BACKUP',
  'COPY',
  'DOC',
  'DRAFT',
  'FINAL',
  'INFO',
  'LATEST',
  'MISC',
  'NEW',
  'NOTES',
  'OLD',
  'TEMP',
  'TMP',
  'WIP',
])

const domainModelRequiredHeaderFields = [
  'schema',
  'ver',
  'st',
  'dt',
]

const domainModelStatuses = new Set([
  'draft',
  'active',
  'deprecated',
  'archived',
])

const registeredDocPrefixes = [
  'ai-coding-kit/',
  'backend-api-contracts/',
  'config/',
  'docs/',
  'knowledge/',
  'notes/',
  'packages/',
  'plans/',
  'public/',
  'scripts/',
  'src/',
  'tests/',
  'tools/',
]

export function scanDocRules(options = {}) {
  const root = options.root ?? process.cwd()
  const violations = []
  const files = collectDocFiles(root)

  for (const filePath of files) {
    const rel = relativePath(root, filePath)
    const name = path.basename(filePath)
    checkRegisteredDocLocation(rel, violations)

    if (name.endsWith('.md')) {
      checkMarkdownName(rel, name, violations)
    } else if (name.endsWith('.dm')) {
      checkDomainModelName(rel, name, violations)
      checkDomainModelLocation(rel, violations)
      checkDomainModelHeader(filePath, rel, violations)
    }
  }

  checkLegacyAllowlist(root, violations)
  violations.push(...scanRetiredServerResidue({ root }).violations)
  return { files, violations }
}

export function scanRetiredServerResidue(options = {}) {
  const root = options.root ?? process.cwd()
  const violations = []

  for (const retiredPath of retiredServerPaths) {
    if (!fs.existsSync(path.resolve(root, retiredPath))) continue
    violations.push({
      file: retiredPath,
      line: 1,
      message: 'retired embedded Java server path must not exist in the current product tree',
    })
  }

  for (const filePath of collectRetiredServerTextFiles(root)) {
    const file = relativePath(root, filePath)
    const source = fs.readFileSync(filePath, 'utf8')
    const normalizedSource = source.toLowerCase()
    for (const marker of retiredServerMarkers) {
      const index = normalizedSource.indexOf(marker.toLowerCase())
      if (index === -1) continue
      violations.push({
        file,
        line: lineForTextIndex(source, index),
        message: `retired embedded Java server marker is forbidden in the current product tree: ${marker}`,
      })
    }
  }

  return { violations }
}

export function runDocsCli(argv = process.argv.slice(2)) {
  const args = parseCliArgs(argv, { root: process.cwd() })
  if (args.help) {
    console.info('Usage: node tools/verify-docs.mjs [--root DIR]')
    return 0
  }

  const { files, violations } = scanDocRules({ root: args.root })
  if (violations.length > 0) {
    printViolations('Doc governance verification failed', violations)
    return 1
  }

  console.info(`Doc governance verification passed: ${files.length} file(s) checked.`)
  return 0
}

function collectDocFiles(root) {
  const exclude = (filePath) => {
    const rel = relativePath(root, filePath)
    return rel.includes('/.git/')
      || rel === '.git'
      || rel.startsWith('.git/')
      || rel === '.cursor'
      || rel.startsWith('.cursor/')
      || rel.includes('/.cursor/')
      || rel === 'node_modules'
      || rel.startsWith('node_modules/')
      || rel.includes('/node_modules/')
      || rel === 'dist'
      || rel.startsWith('dist/')
      || rel.includes('/dist/')
  }
  return [...walkFiles(root, { extensions: docExtensions, exclude })]
    .sort((left, right) => relativePath(root, left).localeCompare(relativePath(root, right)))
}

function collectRetiredServerTextFiles(root) {
  const exclude = (filePath) => {
    const rel = relativePath(root, filePath)
    if (retiredServerExcludedFiles.has(rel)) return true
    const segments = rel.split('/')
    return segments.some(segment => retiredServerExcludedRoots.has(segment))
  }
  return [...walkFiles(root, { extensions: retiredServerTextExtensions, exclude })]
    .sort((left, right) => relativePath(root, left).localeCompare(relativePath(root, right)))
}

function lineForTextIndex(source, index) {
  return source.slice(0, index).split(/\r?\n/u).length
}

function checkMarkdownName(file, name, violations) {
  if (legacyMarkdownAllowlist.has(file)) return
  if (standardMarkdownNames.has(name)) return
  if (localizedReadmePattern.test(name)) return
  if (kebabMarkdownPattern.test(name)) {
    checkFilenameSignal(file, name, violations)
    return
  }

  const message = name.startsWith('DM-')
    ? 'DM documents must use .dm; do not add new DM-*.md files'
    : 'markdown file names must be kebab-case.md, NN-kebab-case.md, README.md, API.md, ARCHITECTURE.md, CHANGELOG.md, or an explicit legacy allowlist entry'
  violations.push({ file, line: 1, message })
}

function checkRegisteredDocLocation(file, violations) {
  if (!file.includes('/')) return
  if (registeredDocPrefixes.some((prefix) => file.startsWith(prefix))) return

  violations.push({
    file,
    line: 1,
    message: 'document location is not registered in docs/DOCUMENT-GOVERNANCE.dm DirectoryRegistry',
  })
}

function checkDomainModelName(file, name, violations) {
  if (name.startsWith('DM-')) {
    violations.push({
      file,
      line: 1,
      message: 'domain model names should use content-only UPPER-KEBAB.dm; drop DM- because .dm already carries the model type',
    })
    return
  }

  if (domainModelPattern.test(name)) {
    checkFilenameSignal(file, name, violations)
    return
  }

  violations.push({
    file,
    line: 1,
    message: 'domain model file names must match content-only UPPER-KEBAB.dm',
  })
}

function checkFilenameSignal(file, name, violations) {
  const stem = name.replace(/\.[^.]+$/u, '')
  if (dateNoisePattern.test(stem)) {
    violations.push({
      file,
      line: 1,
      message: 'file names must not carry dates; put update dates in document metadata',
    })
  }

  if (versionNoisePattern.test(stem)) {
    violations.push({
      file,
      line: 1,
      message: 'file names must not carry v1/v2 style versions; put versions in ver metadata',
    })
  }

  const tokens = stem.toUpperCase().split(/[-_.]+/u).filter(Boolean)
  const noisyToken = tokens.find((token) => filenameNoiseTokens.has(token))
  if (noisyToken === undefined) return

  violations.push({
    file,
    line: 1,
    message: `file name token "${noisyToken}" is low-signal; use concrete subject words instead`,
  })
}

function checkDomainModelLocation(file, violations) {
  if (file.startsWith('docs/')) return
  if (/^packages\/[^/]+\/src\//u.test(file)) return
  violations.push({
    file,
    line: 1,
    message: 'domain model files must live under docs/ or packages/<package>/src/**',
  })
}

function checkDomainModelHeader(filePath, file, violations) {
  const source = fs.readFileSync(filePath, 'utf8')
  const header = extractDomainModelHeader(source)
  if (header === null) {
    violations.push({
      file,
      line: 1,
      message: 'domain model files must start with a dm <Name> { header block',
    })
    return
  }

  for (const field of domainModelRequiredHeaderFields) {
    if (extractHeaderValue(header, field) !== null) continue
    violations.push({
      file,
      line: 1,
      message: `domain model header must declare ${field}`,
    })
  }

  const schemaVersion = extractHeaderValue(header, 'schema')
  if (schemaVersion !== null && !integerPattern.test(schemaVersion)) {
    violations.push({
      file,
      line: lineForHeaderField(source, 'schema'),
      message: 'schema must be an integer',
    })
  }

  const docVersion = unquote(extractHeaderValue(header, 'ver'))
  if (docVersion !== null && !semverPattern.test(docVersion)) {
    violations.push({
      file,
      line: lineForHeaderField(source, 'ver'),
      message: 'ver must use SemVer format, for example 1.0.0',
    })
  }

  const status = unquote(extractHeaderValue(header, 'st'))
  if (status !== null && !domainModelStatuses.has(status)) {
    violations.push({
      file,
      line: lineForHeaderField(source, 'st'),
      message: 'st must be draft, active, deprecated, or archived',
    })
  }

  const date = unquote(extractHeaderValue(header, 'dt'))
  if (date !== null && !isoDatePattern.test(date)) {
    violations.push({
      file,
      line: lineForHeaderField(source, 'dt'),
      message: 'dt must use YYYY-MM-DD format',
    })
  }
}

function extractDomainModelHeader(source) {
  if (!/^dm\s+[A-Za-z][A-Za-z0-9]*\s*\{/u.test(source)) return null
  const end = source.indexOf('\n}')
  if (end === -1) return null
  return source.slice(0, end)
}

function extractHeaderValue(header, field) {
  const pattern = new RegExp(String.raw`^\s*${field}:\s*(.+?)\s*$`, 'mu')
  const match = pattern.exec(header)
  return match?.[1]?.trim() ?? null
}

function unquote(value) {
  if (value === null) return null
  return value.replace(/^["']|["']$/gu, '')
}

function lineForHeaderField(source, field) {
  const pattern = new RegExp(String.raw`^\s*${field}:`, 'mu')
  const match = pattern.exec(source)
  if (match === null) return 1
  return source.slice(0, match.index).split(/\r?\n/u).length
}

function checkLegacyAllowlist(root, violations) {
  for (const file of legacyMarkdownAllowlist) {
    if (fs.existsSync(path.join(root, file))) continue
    violations.push({
      file,
      line: 1,
      message: 'legacy markdown allowlist entry no longer exists; remove it from tools/verify-docs.mjs',
    })
  }
}

if (isCliEntrypoint(import.meta.url)) {
  process.exitCode = runDocsCli()
}
