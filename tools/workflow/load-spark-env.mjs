/**
 * 从仓库根 .env.local 注入 SPARK_*（不覆盖已存在的 process.env）。
 */
import {existsSync, readFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

function stripQuotes(value) {
  const text = String(value ?? '').trim()
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1)
  }
  return text
}

export function loadSparkEnvFromLocal() {
  const file = join(root, '.env.local')
  if (!existsSync(file)) return false
  let loaded = 0
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!match) continue
    const key = match[1]
    if (process.env[key]) continue
    process.env[key] = stripQuotes(match[2])
    loaded += 1
  }
  return loaded > 0
}