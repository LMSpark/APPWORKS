#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { collectSourceFiles, isCliEntrypoint, printViolations, relativePath } from './verifier-common.mjs'

/**
 * 页面层瘦身门禁（AppWorks 语义整合硬约束 1）：业务页面与页面专用 TS 不得自建
 * 命令状态机、JSON 基线比对、复制正式数据的 static-data 表或手传记录/ID 列表。
 * 基线只许收紧：现存违规登记在基线，新增即失败，减少须 --update 收档。
 */
export const PAGE_THIN_BASELINE_FILE = 'tools/page-thin-baseline.json'
const ROOTS = ['src/views/features', 'src/lowcode']
const RULES = [
  { id: 'command-status', pattern: /'(?:idle|previewing|saving|unknown|readback)'\s*\|/gu, message: '命令状态机（应由 spark-data 公共能力承接）' },
  { id: 'json-baseline', pattern: /JSON\.stringify\([^)\n]*\.rows\b/gu, message: 'JSON 快照基线比对（应使用 DataView 变更跟踪）' },
  { id: 'static-copy', pattern: /resourceType\s*=\s*['"]static-data['"]/gu, message: '页面自建 static-data 表（须证明不是正式数据副本）' },
  { id: 'hand-passed-ids', pattern: /\s:[a-z-]+-ids=/gu, message: '手传 ID 列表 props（应绑定 DataView）', vueOnly: true },
]

export function measurePageThin(root) {
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
  const current = measurePageThin(root)
  const baseline = readBaseline(root)
  const violations = []
  for (const [file, counts] of Object.entries(current)) {
    for (const [rule, count] of Object.entries(counts)) {
      const allowed = baseline[file]?.[rule] ?? 0
      if (count > allowed) {
        const message = RULES.find(item => item.id === rule)?.message ?? rule
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
  return { violations, current }
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
  const { violations } = scanPageThin({ root })
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
