#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import ts from 'typescript'
import { collectSourceFiles, forEachParsedSource, isCliEntrypoint, lineFor, printViolations, relativePath } from './verifier-common.mjs'

/**
 * 页面层瘦身门禁（AppWorks 语义整合硬约束 1）：业务页面与页面专用 TS 不得自建
 * 命令状态机、JSON 基线比对、复制正式数据的 static-data 表或手传记录/ID 列表。
 * 基线只许收紧：现存违规登记在基线，新增即失败，减少须 --update 收档。
 */
export const PAGE_THIN_BASELINE_FILE = 'tools/page-thin-baseline.json'
const ROOTS = ['src/views/features', 'src/lowcode']
const RULES = [
  { id: 'command-status', pattern: /'(?:idle|previewing|saving|unknown|readback)'\s*\|/gu, message: '命令状态机（应由 spark-data 公共能力承接）' },
  { id: 'static-copy', pattern: /resourceType\s*=\s*['"]static-data['"]/gu, message: '页面自建 static-data 表（须证明不是正式数据副本）' },
  { id: 'hand-passed-ids', pattern: /\s:[a-z-]+-ids=/gu, message: '手传 ID 列表 props（应绑定 DataView）', vueOnly: true },
]

function recordBaselineUses(sourceFile) {
  const options = {noLib: true, noResolve: true, target: ts.ScriptTarget.Latest}, host = ts.createCompilerHost(options)
  host.getSourceFile = file => file === sourceFile.fileName ? sourceFile : undefined
  const checker = ts.createProgram([sourceFile.fileName], options, host).getTypeChecker()
  const candidates = new Set(), declarations = new Map(), dirtyRoots = []
  const isDirtyName = name => /dirty|unsaved/iu.test(name)
  const containsRows = (node, visited = new Set()) => {
    if (visited.has(node)) return false
    visited.add(node)
    if (ts.isPropertyAccessExpression(node) && node.name.text === 'rows') return true
    if (ts.isIdentifier(node)) {
      const declaration = checker.getSymbolAtLocation(node)?.valueDeclaration
      if (declaration && ts.isVariableDeclaration(declaration) && declaration.initializer && containsRows(declaration.initializer, visited)) return true
    }
    return ts.forEachChild(node, child => containsRows(child, visited)) === true
  }
  const collect = node => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const symbol = checker.getSymbolAtLocation(node.name), values = declarations.get(symbol) ?? []
      if (symbol) { values.push(node.initializer); declarations.set(symbol, values) }
      if (isDirtyName(node.name.text)) dirtyRoots.push(node.initializer)
    }
    if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) && node.name && isDirtyName(node.name.getText(sourceFile)) && node.body) dirtyRoots.push(node.body)
    if (ts.isPropertyAssignment(node) && isDirtyName(node.name.getText(sourceFile))) dirtyRoots.push(node.initializer)
    if (ts.isCallExpression(node) && node.expression.getText(sourceFile) === 'JSON.stringify' && node.arguments.some(argument => containsRows(argument))) candidates.add(node)
    ts.forEachChild(node, collect)
  }
  collect(sourceFile)
  const proven = new Set(), visited = new Set()
  const visitDependency = node => {
    if (visited.has(node)) return
    visited.add(node)
    if (candidates.has(node)) proven.add(node)
    if (ts.isIdentifier(node)) for (const initializer of declarations.get(checker.getSymbolAtLocation(node)) ?? []) visitDependency(initializer)
    ts.forEachChild(node, visitDependency)
  }
  dirtyRoots.forEach(visitDependency)
  return {proven, uncertain: [...candidates].filter(node => !proven.has(node))}
}

export function measurePageThin(root, diagnostics = []) {
  const files = collectSourceFiles({ root, includeRoots: ROOTS })
  const result = {}
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8')
    const counts = {}
    for (const rule of RULES) {
      if (rule.vueOnly && !file.endsWith('.vue')) continue
      const count = [...source.matchAll(rule.pattern)].length
      if (count > 0) counts[rule.id] = count
    }
    forEachParsedSource(file, root, ({sourceFile, lineOffset}) => {
      const {proven, uncertain} = recordBaselineUses(sourceFile)
      if (proven.size) counts['json-baseline'] = (counts['json-baseline'] ?? 0) + proven.size
      for (const node of uncertain) diagnostics.push({file: relativePath(root, file), line: lineFor(sourceFile, node, lineOffset),
        message: 'JSON 行序列化用途待审：须区分正式合同校验、响应式失效键与替代 DataView 的编辑基线'})
    })
    if (Object.keys(counts).length > 0) result[relativePath(root, file)] = counts
  }
  return result
}

function readBaseline(root) {
  const file = path.join(root, PAGE_THIN_BASELINE_FILE)
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {}
}

export function scanPageThin(options = {}) {
  const root = options.root ?? process.cwd()
  const diagnostics = [], current = measurePageThin(root, diagnostics)
  const baseline = readBaseline(root)
  const violations = []
  for (const [file, counts] of Object.entries(current)) {
    for (const [rule, count] of Object.entries(counts)) {
      const allowed = baseline[file]?.[rule] ?? 0
      if (count > allowed) {
        const message = rule === 'json-baseline' ? 'JSON 记录基线用于推导脏状态（应使用 DataView 变更跟踪）' : RULES.find(item => item.id === rule)?.message ?? rule
        violations.push({ file, line: 1, message: `${message}：${count}（基线 ${allowed}）` })
      }
    }
  }
  for (const [file, counts] of Object.entries(baseline)) {
    for (const [rule, allowed] of Object.entries(counts)) {
      if ((current[file]?.[rule] ?? 0) < allowed) {
        violations.push({ file: PAGE_THIN_BASELINE_FILE, line: 1, message: `${file} ${rule} 已减少，请运行 node tools/verify-page-thin.mjs --update 收紧基线` })
      }
    }
  }
  return { violations, current, diagnostics }
}

export function runPageThinCli(argv = process.argv.slice(2)) {
  const root = process.cwd()
  if (argv.includes('--update')) {
    const current = measurePageThin(root)
    const baseline = readBaseline(root)
    for (const [file, counts] of Object.entries(current)) {
      for (const [rule, count] of Object.entries(counts)) {
        if (count > (baseline[file]?.[rule] ?? 0)) throw new Error(`--update 只能收紧基线：${file} ${rule} ${count}`)
      }
    }
    fs.writeFileSync(path.join(root, PAGE_THIN_BASELINE_FILE), `${JSON.stringify(current, null, 2)}\n`, 'utf8')
    console.info(`page thin baseline updated: ${Object.keys(current).length} files`)
    return 0
  }
  if (argv.includes('--init')) {
    fs.writeFileSync(path.join(root, PAGE_THIN_BASELINE_FILE), `${JSON.stringify(measurePageThin(root), null, 2)}\n`, 'utf8')
    console.info('page thin baseline initialized')
    return 0
  }
  const { violations, diagnostics } = scanPageThin({ root })
  if (diagnostics.length) {
    console.info(`page thin review diagnostics: ${diagnostics.length} item(s) requiring review`)
    for (const item of diagnostics) console.info(`  ${item.file}:${item.line} ${item.message}`)
  }
  if (violations.length > 0) {
    printViolations('page thin', violations)
    return 1
  }
  console.info('page thin: ok')
  return 0
}

if (isCliEntrypoint(import.meta.url)) {
  try {
    process.exit(runPageThinCli())
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
