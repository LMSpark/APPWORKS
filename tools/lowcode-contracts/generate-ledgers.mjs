import { readFile, readdir, writeFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import process from 'node:process'

const APPWORKS_ROOT = resolve(import.meta.dirname, '..', '..')
const LOWCODE_ROOT = resolve(process.env['LOWCODE_JDK17_ROOT'] ?? 'E:\\lowcode-jdk17')
const CHECK_ONLY = process.argv.includes('--check')

async function walk(root, predicate) {
  const files = []
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== 'target' && entry.name !== 'node_modules' && entry.name !== '.git') await visit(path)
      } else if (predicate(path)) {
        files.push(path)
      }
    }
  }
  await visit(root)
  return files.sort()
}

function slash(path) {
  return path.replaceAll('\\', '/')
}

function lineNumber(source, offset) {
  return source.slice(0, offset).split('\n').length
}

function annotationIsCommented(source, offset) {
  const lineStart = source.lastIndexOf('\n', offset) + 1
  return source.slice(lineStart, offset).trimStart().startsWith('//')
}

function firstQuotedValue(argumentsText) {
  return /["']([^"']*)["']/.exec(argumentsText)?.[1] ?? ''
}

function mappingMethod(annotation, argumentsText) {
  const direct = {
    GetMapping: 'GET',
    PostMapping: 'POST',
    PutMapping: 'PUT',
    DeleteMapping: 'DELETE',
    PatchMapping: 'PATCH',
  }[annotation]
  if (direct !== undefined) return direct
  return /RequestMethod\.(GET|POST|PUT|DELETE|PATCH)/.exec(argumentsText)?.[1] ?? 'ANY'
}

function joinPath(base, child) {
  const parts = [base, child].filter(Boolean).map(value => value.replace(/^\/+|\/+$/g, ''))
  return `/${parts.join('/')}`.replace(/\/{2,}/g, '/')
}

function readClassMapping(source, classOffset) {
  const prefix = source.slice(0, classOffset)
  const matches = [...prefix.matchAll(/@RequestMapping\s*\(([^)]*)\)/g)]
    .filter(match => !annotationIsCommented(prefix, match.index ?? 0))
  return firstQuotedValue(matches.at(-1)?.[1] ?? '')
}

function readHandler(source, mappingEnd) {
  const tail = source.slice(mappingEnd, mappingEnd + 1800)
  const match = /\bpublic\s+(?:<[^>]+>\s*)?[\w<>, ?\[\].]+\s+(\w+)\s*\(/m.exec(tail)
  return match?.[1] ?? null
}

async function buildLowcodeLedger() {
  const files = await walk(LOWCODE_ROOT, path => path.endsWith('Controller.java'))
  const endpoints = []
  for (const file of files) {
    const source = await readFile(file, 'utf8')
    const classMatch = /\bclass\s+(\w*Controller)\b/.exec(source)
    if (classMatch === null || classMatch.index === undefined) continue
    const controller = classMatch[1]
    const classOffset = classMatch.index
    const basePath = readClassMapping(source, classOffset)
    const mappings = source.matchAll(/@(GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping|RequestMapping)\s*(?:\(([^)]*)\))?/g)
    for (const match of mappings) {
      const offset = match.index ?? 0
      if (offset < classOffset || annotationIsCommented(source, offset)) continue
      const handler = readHandler(source, offset + match[0].length)
      if (handler === null) continue
      const annotation = match[1]
      const argumentsText = match[2] ?? ''
      endpoints.push({
        method: mappingMethod(annotation, argumentsText),
        path: joinPath(basePath, firstQuotedValue(argumentsText)),
        controller,
        handler,
        sourceFile: slash(relative(LOWCODE_ROOT, file)),
        sourceLine: lineNumber(source, offset),
        evidence: match[0].replace(/\s+/g, ' ').trim(),
        confidence: 'source-characterized',
      })
    }
  }
  endpoints.sort((left, right) => left.path.localeCompare(right.path) || left.method.localeCompare(right.method))
  return {
    schemaVersion: 1,
    source: 'lowcode-jdk17-controller-source',
    generationMode: 'read-only-static-characterization',
    limitations: [
      'Records Spring mapping annotations from source; runtime gateway rewrites and Nacos routing are not inferred.',
      'ANY means RequestMapping did not declare a single HTTP method.',
      'Authentication, transaction, database and response semantics require linked source or behavior fixtures.',
    ],
    endpointCount: endpoints.length,
    endpoints,
  }
}

function consumerScope(file) {
  const normalized = slash(relative(APPWORKS_ROOT, file))
  if (normalized.startsWith('packages/spark-lowcode-api/')) return 'publishable-lowcode-api'
  if (normalized.startsWith('src/')) return 'app-composition'
  if (normalized.startsWith('tests/')) return 'test'
  return 'tooling'
}

function normalizeConsumerExpression(value) {
  return value
    .replaceAll(/\$\{[^}]+\}/g, '{dynamic}')
    .replaceAll(/\\\//g, '/')
    .replace(/[?#].*$/, '')
}

async function buildConsumerLedger(lowcodeLedger) {
  const roots = ['src', 'packages', 'scripts', 'tools']
  const files = []
  for (const root of roots) {
    files.push(...await walk(resolve(APPWORKS_ROOT, root), path => /\.(?:ts|vue|mjs)$/.test(path)))
  }
  const consumers = []
  for (const file of files.sort()) {
    const source = await readFile(file, 'utf8')
    const expressions = source.matchAll(/([`'"])(\/api\/[\w${}\-./:?=&]+)\1/g)
    for (const match of expressions) {
      const offset = match.index ?? 0
      consumers.push({
        expression: normalizeConsumerExpression(match[2]),
        sourceFile: slash(relative(APPWORKS_ROOT, file)),
        sourceLine: lineNumber(source, offset),
        scope: consumerScope(file),
      })
    }
  }
  consumers.sort((left, right) => left.sourceFile.localeCompare(right.sourceFile) || left.sourceLine - right.sourceLine)
  const sourcePaths = new Set(lowcodeLedger.endpoints.map(endpoint => endpoint.path.toLowerCase()))
  const directUnmatched = consumers.filter(consumer => !sourcePaths.has(consumer.expression.toLowerCase())).length
  return {
    schemaVersion: 1,
    source: 'appworks-static-http-path-scan',
    generationMode: 'read-only-static-characterization',
    limitations: [
      'Only direct /api string and template literals are listed; calls through typed LowcodeApi methods are represented at their adapter declaration.',
      'Dynamic path segments are normalized to {dynamic}; unmatched does not prove a missing backend route.',
      'Presence in this ledger proves a static consumer reference, not successful runtime behavior.',
    ],
    consumerCount: consumers.length,
    directUnmatchedCount: directUnmatched,
    consumers,
  }
}

async function emit(name, value) {
  const target = resolve(APPWORKS_ROOT, 'backend-api-contracts', name)
  const next = `${JSON.stringify(value, null, 2)}\n`
  if (CHECK_ONLY) {
    const current = await readFile(target, 'utf8').catch(() => '')
    if (current !== next) throw new Error(`${name} is stale; run pnpm run generate:lowcode-contracts`)
    return
  }
  await writeFile(target, next, 'utf8')
}

const lowcodeLedger = await buildLowcodeLedger()
const consumerLedger = await buildConsumerLedger(lowcodeLedger)
await emit('lowcode-endpoint-ledger.json', lowcodeLedger)
await emit('appworks-consumer-ledger.json', consumerLedger)
console.log(`lowcode contracts: ${lowcodeLedger.endpointCount} endpoints, ${consumerLedger.consumerCount} consumers`)
