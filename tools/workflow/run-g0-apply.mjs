#!/usr/bin/env node
/**
 * G0：读 modelId → 写 evidence → apply 到 workflow pagedata。
 * 凭证：环境变量或仓库根 .env.local 中的 SPARK_BASE_URL / SPARK_TOKEN / SPARK_APP_ID。
 */
import {spawnSync} from 'node:child_process'
import {writeFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {loadSparkEnvFromLocal} from './load-spark-env.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
const outPath = join(root, 'notes', 'evidence', `workflow-g0-read-r14-${stamp}.json`)

loadSparkEnvFromLocal()

const read = spawnSync(process.execPath, [join(here, 'read-workflow-model-ids.mjs')], {
  cwd: root,
  encoding: 'utf8',
  env: process.env,
})

if (read.status !== 0) {
  console.error(read.stderr || read.stdout)
  process.exit(read.status ?? 1)
}

writeFileSync(outPath, `${read.stdout.trim()}\n`, 'utf8')
console.log(`已写入 ${outPath}`)

const apply = spawnSync(process.execPath, [join(here, 'apply-workflow-model-ids.mjs'), outPath], {
  cwd: root,
  encoding: 'utf8',
  env: process.env,
})
if (apply.stdout) process.stdout.write(apply.stdout)
if (apply.stderr) process.stderr.write(apply.stderr)
process.exit(apply.status ?? 1)