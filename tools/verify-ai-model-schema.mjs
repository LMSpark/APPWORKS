#!/usr/bin/env node

/**
 * AI 模型规范运行时 schema 验证脚本。
 *
 * 对已知业务模型构造最小实例，调用 toJson()，对输出运行
 * auditDraft2020Schema() 检查 JSON Schema Draft 2020-12 合规性。
 *
 * 这是一个可选的深度验证，不在默认 verify:rules 中。
 * 需要先构建 spark-json-document 包。
 *
 * 用法：
 *   pnpm run verify:ai-model:schema
 */

import process from 'node:process'

// 动态导入 ESM 包
async function main() {
  let auditDraft2020Schema
  try {
    const schemaModule = await import('@spark-appworks/spark-json-document/schema')
    auditDraft2020Schema = schemaModule.auditDraft2020Schema
  } catch {
    console.error('Failed to import @spark-appworks/spark-json-document/schema.')
    console.error('Run "pnpm --filter @spark-appworks/spark-json-document run build" first.')
    process.exit(1)
  }

  let DataSet
  try {
    const sparkData = await import('@spark-appworks/spark-data')
    DataSet = sparkData.DataSet
  } catch {
    console.error('Failed to import @spark-appworks/spark-data.')
    console.error('Run "pnpm --filter @spark-appworks/spark-data run build" first.')
    process.exit(1)
  }

  console.info('Running AI model schema validation...\n')

  const findings = []

  // ─── DataSet ───
  try {
    const minimalDataSet = DataSet.fromJson({
      schemaVersion: 2,
      dataSetName: 'test',
      tables: {
        main: {
          columns: [
            { name: 'id', type: 'number', label: 'ID' },
            { name: 'name', type: 'string', label: 'Name' },
          ],
          views: {
            default: {
              columns: [
                { name: 'id', type: 'number', label: 'ID' },
                { name: 'name', type: 'string', label: 'Name' },
              ],
            },
          },
        },
      },
    })
    const json = minimalDataSet.toJson()
    const issues = auditDraft2020Schema(json)
    if (issues.length > 0) {
      findings.push({ model: 'DataSet', issues })
    } else {
      console.info('  ✓ DataSet.toJson() passes Draft 2020-12 audit')
    }
  } catch (error) {
    findings.push({ model: 'DataSet', error: error.message })
  }

  // ─── 汇总 ───
  console.info('')
  if (findings.length === 0) {
    console.info('All model schema validations passed.')
    process.exit(0)
  }

  console.error('Schema validation findings:')
  for (const f of findings) {
    if (f.error) {
      console.error(`  ✗ ${f.model}: construction error — ${f.error}`)
    } else {
      console.error(`  ✗ ${f.model}: ${f.issues.length} issue(s)`)
      for (const issue of f.issues) {
        console.error(`    - ${issue.rule}: ${issue.message ?? JSON.stringify(issue.path ?? issue)}`)
      }
    }
  }
  process.exit(1)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
