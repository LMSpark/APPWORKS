import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const REMOVED_TOOL_NAMES = [
  ['module', 'query'],
  ['module', 'guide'],
  ['module', 'attribute', 'guide'],
  ['module', 'function', 'guide'],
  ['module', 'find'],
  ['module', 'attr'],
  ['module', 'call'],
  ['module', 'script'],
  ['module', 'memory'],
].map(parts => parts.join('_'))
const REMOVED_PROTOCOL_EXPORT = ['PROTOCOL', 'TOOL', 'NAMES'].join('_')
const REMOVED_TOOL_IDENTIFIER_PATTERN = new RegExp(
  `\\b(?:${REMOVED_TOOL_NAMES.join('|')})\\b|${REMOVED_PROTOCOL_EXPORT}`,
  'u',
)

/** 禁令句等刻意保留已移除协议引用的生产文件 */
const ALLOWLIST = new Set([
  'packages/spark-ai/src/agent/business/class-model-agent-adapter.ts',
  'packages/spark-ai/ARCHITECTURE.md',
])

const SCAN_ROOTS = [
  'packages/spark-ai/src',
  'packages/spark-project-model/src',
  'src/services',
]

function collectSourceFiles(rootDir: string, relativeRoot: string): string[] {
  const entries = readdirSync(rootDir)
  const files: string[] = []

  for (const entry of entries) {
    const absolutePath = join(rootDir, entry)
    const relativePath = join(relativeRoot, entry).replace(/\\/gu, '/')
    const stats = statSync(absolutePath)

    if (stats.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') continue
      files.push(...collectSourceFiles(absolutePath, relativePath))
      continue
    }

    if (/\.(?:ts|tsx|mdc|md)$/u.test(entry)) {
      if (/\.test\.(?:ts|tsx)$/u.test(entry) || relativePath.includes('/__tests__/')) {
        continue
      }
      files.push(relativePath)
    }
  }

  return files
}

function findRemovedToolMatches(repoRoot: string): Array<{ file: string, matches: string[] }> {
  const violations: Array<{ file: string, matches: string[] }> = []

  for (const scanRoot of SCAN_ROOTS) {
    const absoluteRoot = join(repoRoot, scanRoot)
    for (const file of collectSourceFiles(absoluteRoot, scanRoot)) {
      if (ALLOWLIST.has(file)) continue

      const text = readFileSync(join(repoRoot, file), 'utf8')
      const matches = [...new Set(text.match(new RegExp(REMOVED_TOOL_IDENTIFIER_PATTERN.source, 'gu')) ?? [])]
      if (matches.length > 0) {
        violations.push({ file, matches })
      }
    }
  }

  return violations
}

function findWorkspaceRoot(startDir: string): string {
  let current = startDir
  for (;;) {
    if (existsSync(join(current, 'pnpm-workspace.yaml'))) return current
    const parent = dirname(current)
    if (parent === current) return startDir
    current = parent
  }
}

describe('removed tool identifiers', () => {
  it('has no LLM-visible removed tool literals outside allowlist', () => {
    const repoRoot = findWorkspaceRoot(process.cwd())
    const violations = findRemovedToolMatches(repoRoot)

    expect(violations).toEqual([])
  })
})
