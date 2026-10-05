import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parsePageData } from '@spark-appworks/spark-project-model'
import { DataSet } from '@spark-appworks/spark-data'
import { isRecord } from '@spark-appworks/spark-utils'

const FIXTURE_ROOT = join(process.cwd(), 'backend-api-contracts/characterization-fixtures/pages-config')

/** 旧版 viewCascades 形状按设计被 DataSet.fromJson 拒绝（不向后兼容）；清单变化即失败。 */
const LEGACY_UNPARSEABLE: readonly string[] = [
  'lmspark/homepage/cascade-demo/pagedata.json',
  'lmspark/homepage/dataset-demo/pagedata.json',
  'lmspark/homepage/smart-load/pagedata.json',
]

function collectPageDataFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    if (statSync(path).isDirectory()) return collectPageDataFiles(path)
    return name === 'pagedata.json' ? [path] : []
  })
}

function isRemoteTable(table: Record<string, unknown>): boolean {
  const resourceType = table['resourceType']
  if (resourceType !== undefined && resourceType !== 'static-data') return true
  return isRecord(table['api']) && table['api']['list'] !== undefined
}

function parseOrNull(raw: string): DataSet | null {
  try {
    return parsePageData(raw)
  } catch {
    return null
  }
}

function fixtureLabel(file: string): string {
  return relative(FIXTURE_ROOT, file).split(sep).join('/')
}

const files = collectPageDataFiles(FIXTURE_ROOT)

describe('页面 pagedata.json 夹具序列化往返', () => {
  it('覆盖到夹具文件', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it('无法解析的夹具恰为已知旧版清单', () => {
    const unparseable = files
      .filter((file) => parseOrNull(readFileSync(file, 'utf8')) === null)
      .map(fixtureLabel)

    expect(unparseable.sort()).toEqual([...LEGACY_UNPARSEABLE].sort())
  })

  it.each(files.map((file) => [fixtureLabel(file), file] as const))(
    '%s：规范化后 toJson 幂等，且本地数据行数不变',
    (label, file) => {
      if (LEGACY_UNPARSEABLE.includes(label)) return
      const raw = readFileSync(file, 'utf8')
      const dataSet = parseOrNull(raw)
      if (dataSet === null) throw new Error(`夹具无法解析且不在已知旧版清单内: ${label}`)

      // 走页面落盘路径：toJson → JSON 文本 → fromJson → toJson。直接复用 toJson 返回的对象会被主键追踪写入 _pk。
      const saved = JSON.stringify(dataSet.toJson())
      const settled = DataSet.fromJson(JSON.parse(saved)).toJson()
      expect(JSON.stringify(settled)).toBe(saved)
      expect(saved).not.toContain('lingma_sys_')

      const source: unknown = JSON.parse(raw)
      const sourceTables = isRecord(source) && isRecord(source['tables']) ? source['tables'] : {}
      for (const [tableName, table] of Object.entries(sourceTables)) {
        if (!isRecord(table) || !isRecord(table['views'])) continue
        for (const [viewId, view] of Object.entries(table['views'])) {
          if (!isRecord(view) || !Array.isArray(view['rows'])) continue
          const savedRows = settled.tables[tableName]?.views[viewId]?.rows ?? []
          expect(savedRows.length).toBe(isRemoteTable(table) ? 0 : view['rows'].length)
        }
      }
    },
  )
})
