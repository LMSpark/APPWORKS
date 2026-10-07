import fs from 'fs'
import path from 'path'
import { describe, it, expect } from 'vitest'

// Fail if any file outside packages/spark-component imports the singletons `componentManager` or `componentRegistry` from the core package.
const SKIPPED_DIRS = new Set(['node_modules', 'dist', '.git'])

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error
    && 'code' in error
    && error.code === 'ENOENT'
}

function walk(dir: string, files: string[] = []) {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch (error) {
    if (isMissingFileError(error)) return files
    throw error
  }
  for (const entry of entries) {
    if (entry.isDirectory() && SKIPPED_DIRS.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, files)
    else if (entry.isFile()) files.push(full)
  }
  return files
}

describe('forbidden singletons imports', () => {
  const root = path.resolve('.')
  const files = walk(root).filter(f => /\.(ts|js|tsx|jsx|vue)$/.test(f))
  const violations: Array<{ file: string; line: number; match: string }> = []

  const importPattern = /import\s+\{[^}]*\b(componentManager|componentRegistry)\b[^}]*\}\s+from\s+['"]@spark-appworks\/spark-component['"]/g

  for (const file of files) {
    // skip files in packages/spark-component itself
    if (file.includes(path.join('packages', 'spark-component'))) continue
    const text = fs.readFileSync(file, 'utf8')
    const lines = text.split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? ''
      if (importPattern.test(line)) {
        const found = (line.match(importPattern) ?? [line])[0]
        violations.push({ file: path.relative(root, file), line: i + 1, match: found })
      }
    }
  }

  it('no external file should import core singletons', () => {
    if (violations.length > 0) {
      const msg = violations.map(v => `${v.file}:${v.line} -> ${v.match}`).join('\n')
      throw new Error(`Found forbidden singleton imports:\n${msg}`)
    }
    expect(violations.length).toBe(0)
  })
})
