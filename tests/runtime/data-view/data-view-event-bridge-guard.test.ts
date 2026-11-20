import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const TARGET_ROOT = resolve(process.cwd(), 'packages/spark-component/src/components/containers')
const ALLOWED_FILES = new Set([
  resolve(process.cwd(), 'packages/spark-component/src/components/containers/composables/useDataViewEventBridge.ts'),
])

const DIRECT_EVENT_ON_PATTERNS = [
  "events.on('currentRowChanged'",
  "events.on('selectedRowsChanged'",
  "events.on('rowsChanged'",
]

function walkFiles(dir: string): string[] {
  const entries = readdirSync(dir)
  const result: string[] = []
  for (const name of entries) {
    const fullPath = resolve(dir, name)
    const stats = statSync(fullPath)
    if (stats.isDirectory()) {
      result.push(...walkFiles(fullPath))
      continue
    }
    if (fullPath.endsWith('.ts') || fullPath.endsWith('.vue')) {
      result.push(fullPath)
    }
  }
  return result
}

type Violation = {
  file: string
  pattern: string
  line: number
  snippet: string}

describe('DataView event bridge guard', () => {
  it('keeps direct DataView events.on subscriptions only inside useDataViewEventBridge', () => {
    const violations: Violation[] = []

    for (const filePath of walkFiles(TARGET_ROOT)) {
      if (ALLOWED_FILES.has(filePath)) continue
      const lines = readFileSync(filePath, 'utf8').split('\n')
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? ''
        for (const pattern of DIRECT_EVENT_ON_PATTERNS) {
          if (line.includes(pattern)) {
            violations.push({
              file: filePath.replace(`${TARGET_ROOT}\\`, '').replace(`${TARGET_ROOT}/`, ''),
              pattern,
              line: i + 1,
              snippet: line.trim(),
            })
          }
        }
      }
    }

    if (violations.length > 0) {
      const message = violations.map(
        (v) => `  ${v.file}:${v.line}\n    pattern : ${v.pattern}\n    snippet : ${v.snippet}`,
      ).join('\n\n')
      expect.fail(
        `Found ${violations.length} direct DataView event subscription(s) outside the bridge layer:\n\n${message}\n\nUse useDataViewEventBridge() instead.`,
      )
    }
  })
})
