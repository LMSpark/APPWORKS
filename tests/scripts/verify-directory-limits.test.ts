import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
// @ts-ignore TS7016 -- Node .mjs verifier
import { DIRECTORY_BASELINE_FILE, scanDirectoryLimits } from '../../tools/verify-directory-limits.mjs'

const roots: string[] = []

function createRoot(fileCount: number): string {
  const root = mkdtempSync(join(tmpdir(), 'dir-limits-'))
  roots.push(root)
  mkdirSync(join(root, 'src', 'big'), { recursive: true })
  mkdirSync(join(root, 'tools'), { recursive: true })
  for (let i = 0; i < fileCount; i += 1) writeFileSync(join(root, 'src', 'big', `file-${i}.ts`), '')
  writeFileSync(join(root, 'src', 'big', 'index.ts'), '')
  return root
}

function writeBaseline(root: string, baseline: Record<string, { files: number; dirs: number }>): void {
  writeFileSync(join(root, DIRECTORY_BASELINE_FILE), JSON.stringify(baseline))
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('verify-directory-limits', () => {
  it('passes a compliant tree and ignores index.ts', () => {
    expect(scanDirectoryLimits({ root: createRoot(10) }).violations).toEqual([])
  })

  it('rejects a new oversized directory', () => {
    const { violations } = scanDirectoryLimits({ root: createRoot(11) })
    expect(violations).toHaveLength(1)
    expect(violations[0]?.file).toBe('src/big')
  })

  it('accepts an oversized directory within its baseline', () => {
    const root = createRoot(12)
    writeBaseline(root, { 'src/big': { files: 12, dirs: 0 } })
    expect(scanDirectoryLimits({ root }).violations).toEqual([])
  })

  it('rejects growth beyond the baseline', () => {
    const root = createRoot(13)
    writeBaseline(root, { 'src/big': { files: 12, dirs: 0 } })
    expect(scanDirectoryLimits({ root }).violations[0]?.message).toContain('只允许减少')
  })

  it('requires tightening the baseline after improvement', () => {
    const root = createRoot(11)
    writeBaseline(root, { 'src/big': { files: 12, dirs: 0 } })
    expect(scanDirectoryLimits({ root }).violations[0]?.message).toContain('--update')
  })
})
