#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { isCliEntrypoint, printViolations, relativePath } from './verifier-common.mjs'

/** AGENTS.md §2.13：单目录源文件（不含 index.ts）与子目录上限。 */
const MAX_FILES = 10
const MAX_DIRS = 7
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.vue'])
const SKIPPED_DIRS = new Set(['node_modules', 'dist', '.git'])
export const DIRECTORY_BASELINE_FILE = 'tools/directory-limits-baseline.json'

function scanRoots(root) {
  const roots = ['src', 'tests']
  const packagesDir = path.join(root, 'packages')
  if (fs.existsSync(packagesDir)) {
    for (const entry of fs.readdirSync(packagesDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      roots.push(`packages/${entry.name}/src`, `packages/${entry.name}/tests`)
    }
  }
  return roots.map(rel => path.join(root, rel)).filter(dir => fs.existsSync(dir))
}

/** 返回超限目录：相对路径 → { files, dirs }。 */
export function measureDirectories(root) {
  const result = {}
  const visit = (dir) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    const dirs = entries.filter(entry => entry.isDirectory() && !SKIPPED_DIRS.has(entry.name))
    const files = entries.filter(entry => entry.isFile() && entry.name !== 'index.ts' && SOURCE_EXTENSIONS.has(path.extname(entry.name)))
    if (files.length > MAX_FILES || dirs.length > MAX_DIRS) {
      result[relativePath(root, dir)] = { files: files.length, dirs: dirs.length }
    }
    for (const child of dirs) visit(path.join(dir, child.name))
  }
  for (const dir of scanRoots(root)) visit(dir)
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)))
}

function readBaseline(root) {
  const file = path.join(root, DIRECTORY_BASELINE_FILE)
  if (!fs.existsSync(file)) return {}
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

export function scanDirectoryLimits(options = {}) {
  const root = options.root ?? process.cwd()
  const current = measureDirectories(root)
  const baseline = readBaseline(root)
  const violations = []
  for (const [dir, counts] of Object.entries(current)) {
    const allowed = baseline[dir]
    if (allowed === undefined) {
      violations.push({ file: dir, line: 1, message: `目录超限（文件 ${counts.files}/${MAX_FILES}，子目录 ${counts.dirs}/${MAX_DIRS}），请拆分子目录` })
      continue
    }
    if (counts.files > allowed.files || counts.dirs > allowed.dirs) {
      violations.push({ file: dir, line: 1, message: `超限目录继续增长（文件 ${allowed.files}→${counts.files}，子目录 ${allowed.dirs}→${counts.dirs}），只允许减少` })
    }
  }
  for (const [dir, allowed] of Object.entries(baseline)) {
    const counts = current[dir]
    if (counts === undefined || counts.files < allowed.files || counts.dirs < allowed.dirs) {
      violations.push({ file: DIRECTORY_BASELINE_FILE, line: 1, message: `${dir} 已改善，请运行 node tools/verify-directory-limits.mjs --update 收紧基线` })
    }
  }
  return { violations, current }
}

export function runDirectoryLimitsCli(argv = process.argv.slice(2)) {
  const root = process.cwd()
  if (argv.includes('--update')) {
    const current = measureDirectories(root)
    fs.writeFileSync(path.join(root, DIRECTORY_BASELINE_FILE), `${JSON.stringify(current, null, 2)}\n`, 'utf8')
    console.info(`directory limits baseline updated: ${Object.keys(current).length} directories`)
    return 0
  }
  const { violations } = scanDirectoryLimits({ root })
  if (violations.length > 0) {
    printViolations('directory limits', violations)
    return 1
  }
  console.info('directory limits: ok')
  return 0
}

if (isCliEntrypoint(import.meta.url)) {
  try {
    process.exit(runDirectoryLimitsCli())
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
