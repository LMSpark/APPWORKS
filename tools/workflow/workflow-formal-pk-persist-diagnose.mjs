/**
 * workflow PK 持久化诊断（纯函数 + 证据形状）。
 */
import {formalDataSetId, formalModelName, formalRowId} from './workflow-metadata-models.mjs'

export function sparkConnectionFingerprint(env = process.env) {
  return {
    baseUrl: String(env.SPARK_BASE_URL ?? '').replace(/\/$/, ''),
    appId: String(env.SPARK_APP_ID ?? '').trim(),
    tenantId: String(env.SPARK_TENANT_NAME ?? env.SPARK_TENANT_ID ?? 'NewApp').trim(),
    tokenPresent: Boolean(String(env.SPARK_TOKEN ?? '').trim()),
    tokenLength: String(env.SPARK_TOKEN ?? '').trim().length,
  }
}

function fieldText(row, keys) {
  for (const key of keys) {
    const value = row?.[key]
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim()
  }
  return ''
}

export function summarizeModelRow(row) {
  const lingmaKey = fieldText(row, ['lingma_sys_key'])
  return {
    modelId: formalRowId(row),
    name: formalModelName(row),
    dataSetId: formalDataSetId(row),
    primaryKeyFields: fieldText(row, ['PrimaryKeyFields', 'primaryKeyFields']),
    updateuser: fieldText(row, ['updateuser', 'UpdateUser']),
    updatetime: fieldText(row, ['updatetime', 'UpdateTime']),
    lingma_sys_key_prefix: lingmaKey ? lingmaKey.slice(0, 16) : '',
  }
}

/**
 * @param {readonly object[]} allRows
 */
export function findDuplicateModelNames(allRows) {
  const buckets = new Map()
  for (const row of allRows) {
    const name = formalModelName(row)
    const dataSetId = formalDataSetId(row)
    if (!name || !dataSetId) continue
    const key = `${dataSetId}\0${name}`
    const list = buckets.get(key) ?? []
    list.push(summarizeModelRow(row))
    buckets.set(key, list)
  }
  return [...buckets.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([key, rows]) => {
      const [dataSetId, name] = key.split('\0')
      return {dataSetId, name, rowCount: rows.length, rows}
    })
}

/**
 * @param {readonly {modelId: string}[]} repair
 * @param {readonly object[]} allRows
 * @param {object} fingerprint
 */
export function buildPersistDiagnoseReport(repair, allRows, fingerprint) {
  const byId = new Map()
  for (const row of allRows) {
    const id = formalRowId(row)
    if (id) byId.set(id, row)
  }
  const targets = repair.map(item => {
    const row = byId.get(item.modelId)
    return {
      ...item,
      found: Boolean(row),
      snapshot: row ? summarizeModelRow(row) : null,
    }
  })
  const duplicates = findDuplicateModelNames(allRows)
  return {
    probedAt: new Date().toISOString(),
    connection: fingerprint,
    gapCount: repair.length,
    targets,
    duplicateNameInSpace: duplicates,
    hint:
      duplicates.length > 0
        ? '同 dataSetId+Name 存在多行；设计器保存可能落在非 probe 认定的 rowid。'
        : '',
  }
}