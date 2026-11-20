#!/usr/bin/env node
/**
 * 按计划移动源码文件/目录，并改写全仓相对导入与 `@/` 别名导入，保持原写法（省略扩展名、.js 指向 .ts、目录 index）。
 * 用法：node scripts/move-source-files.mjs --plan <plan.json> [--dry-run]
 * plan.json：[{ "from": "packages/x/src/a", "to": "packages/x/src/group/a" }, ...]（路径相对仓库根，可为文件或目录）
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { execFileSync } from 'node:child_process'

const root = process.cwd()
const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.vue', '.js', '.mjs', '.cjs'])
const RESOLVE_EXTENSIONS = ['.ts', '.tsx', '.vue', '.mts', '.mjs', '.js', '.json', '.d.ts']
const SPECIFIER_PATTERN = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\bvi\.mock\(\s*|\bvi\.doMock\(\s*|\brequire\(\s*|\brequire\.resolve\(\s*)(['"])([^'"\n]+)\2/gu

const posix = (value) => value.split(path.sep).join('/')
const args = process.argv.slice(2)
const planPath = args[args.indexOf('--plan') + 1]
const dryRun = args.includes('--dry-run')
if (!args.includes('--plan') || !planPath) {
  console.error('Usage: node scripts/move-source-files.mjs --plan <plan.json> [--dry-run]')
  process.exit(1)
}

function listRepoFiles() {
  const output = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' })
  return output.split(/\r?\n/u).filter(Boolean).filter(file => fs.existsSync(path.join(root, file)))
}

const repoFiles = listRepoFiles()
const fileSet = new Set(repoFiles)
const plan = JSON.parse(fs.readFileSync(path.resolve(root, planPath), 'utf8'))

/** 旧路径 → 新路径（逐文件展开目录）。 */
const moves = new Map()
for (const entry of plan) {
  const from = posix(path.normalize(entry.from)).replace(/\/$/u, '')
  const to = posix(path.normalize(entry.to)).replace(/\/$/u, '')
  const inside = repoFiles.filter(file => file === from || file.startsWith(`${from}/`))
  if (inside.length === 0) throw new Error(`plan 源路径不存在或无受控文件: ${from}`)
  for (const file of inside) {
    const target = file === from ? to : `${to}${file.slice(from.length)}`
    if (fileSet.has(target) && !moves.has(target)) throw new Error(`目标已存在: ${target}`)
    moves.set(file, target)
  }
}

function resolveOldTarget(fromOldFile, specifier) {
  let base
  if (specifier.startsWith('@/')) base = `src/${specifier.slice(2)}`
  else if (specifier.startsWith('./') || specifier.startsWith('../')) base = posix(path.normalize(path.join(path.dirname(fromOldFile), specifier)))
  else return undefined
  if (fileSet.has(base)) return { target: base, mode: 'exact' }
  if (base.endsWith('.js') && fileSet.has(`${base.slice(0, -3)}.ts`)) return { target: `${base.slice(0, -3)}.ts`, mode: 'js-to-ts' }
  for (const ext of RESOLVE_EXTENSIONS) if (fileSet.has(`${base}${ext}`)) return { target: `${base}${ext}`, mode: 'omit-ext', ext }
  for (const ext of RESOLVE_EXTENSIONS) if (fileSet.has(`${base}/index${ext}`)) return { target: `${base}/index${ext}`, mode: 'index' }
  return undefined
}

function formatSpecifier(fromNewFile, original, newTarget, resolved) {
  let targetPath = newTarget
  if (resolved.mode === 'js-to-ts') targetPath = `${newTarget.slice(0, -3)}.js`
  else if (resolved.mode === 'omit-ext') targetPath = newTarget.slice(0, -resolved.ext.length)
  else if (resolved.mode === 'index') targetPath = path.posix.dirname(newTarget)
  if (original.startsWith('@/') && targetPath.startsWith('src/')) return `@/${targetPath.slice(4)}`
  const relative = path.posix.relative(path.posix.dirname(fromNewFile), targetPath)
  return relative.startsWith('.') ? relative : `./${relative}`
}

const rewrites = []
for (const currentOld of repoFiles) {
  if (!CODE_EXTENSIONS.has(path.extname(currentOld))) continue
  if (/(^|\/)(node_modules|dist|generated)\//u.test(currentOld)) continue
  const newFile = moves.get(currentOld) ?? currentOld
  const text = fs.readFileSync(path.join(root, currentOld), 'utf8')
  let changed = false
  const next = text.replace(SPECIFIER_PATTERN, (match, prefix, quote, specifier) => {
    const resolved = resolveOldTarget(currentOld, specifier)
    if (resolved === undefined) return match
    const newTarget = moves.get(resolved.target) ?? resolved.target
    if (newTarget === resolved.target && newFile === currentOld) return match
    const replacement = formatSpecifier(newFile, specifier, newTarget, resolved)
    if (replacement === specifier) return match
    changed = true
    return `${prefix}${quote}${replacement}${quote}`
  })
  if (changed) rewrites.push({ oldPath: currentOld, newPath: newFile, text: next })
}

console.info(`moves: ${moves.size} file(s); import rewrites: ${rewrites.length} file(s)`)
if (dryRun) {
  for (const [from, to] of moves) console.info(`  ${from} -> ${to}`)
  for (const item of rewrites) console.info(`  rewrite ${item.newPath}`)
  process.exit(0)
}

for (const item of rewrites) fs.writeFileSync(path.join(root, item.oldPath), item.text, 'utf8')
for (const [from, to] of moves) {
  fs.mkdirSync(path.dirname(path.join(root, to)), { recursive: true })
  fs.renameSync(path.join(root, from), path.join(root, to))
}
for (const from of new Set([...moves.keys()].map(file => path.posix.dirname(file)))) {
  let dir = path.join(root, from)
  while (dir.startsWith(root) && dir !== root && fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
    fs.rmdirSync(dir)
    dir = path.dirname(dir)
  }
}
console.info('done')
