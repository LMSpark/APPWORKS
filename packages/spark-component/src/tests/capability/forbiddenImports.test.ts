import fs from 'fs'
import path from 'path'
import { describe, it, expect } from 'vitest'

function walk(dir: string, files: string[] = []) {
  const entries = fs.readdirSync(dir)
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === 'dist' || entry === 'stories') continue
    const full = path.join(dir, entry)
    const stat = fs.statSync(full)
    if (stat.isDirectory()) walk(full, files)
    else files.push(full)
  }
  return files
}

describe('packages/spark-component: forbidden imports', () => {
  const root = path.resolve(__dirname, '../..') // packages/spark-component
  const files = walk(root)
    .filter(f => /\.(ts|js|tsx|jsx|json)$/.test(f))  // 排除 .md（文档代码示例不是真实 import）
    // 排除测试文件自身（测试可以合法引用 .vue 做集成测试）
    .filter(f => !f.includes('forbiddenImports') && !f.endsWith('.test.ts') && !f.endsWith('.spec.ts'))

  const matches: Array<{ file: string; line: number; match: string }> = []

  const featuresPathRegex = /from\s+['"][^'"]*features\//

  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8')
    const lines = text.split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? ''
      // 跳过注释行（JSDoc / 行注释中的示例代码）
      const trimmed = line.trimStart()
      if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*/')) continue
      if (featuresPathRegex.test(line)) {
        const found = line.match(featuresPathRegex)?.[0] ?? line
        matches.push({ file: path.relative(root, file), line: i + 1, match: found })
      }
    }
  }

  it('should not reference features/', () => {
    if (matches.length > 0) {
      const msg = matches.map(m => `${m.file}:${m.line} -> ${m.match}`).join('\n')
      throw new Error(`Found forbidden feature imports in packages/spark-component:\n${msg}`)
    }
    expect(matches.length).toBe(0)
  })
})
