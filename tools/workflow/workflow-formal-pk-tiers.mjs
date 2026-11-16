/**
 * workflow 正式表 PrimaryKeyFields 缺口分级（A/B/C），与 probe-formal-pk-detail repairHint 对齐。
 */
import {existsSync, readdirSync, readFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

export const FORMAL_PK_TIER = Object.freeze({A: 'A', B: 'B', C: 'C'})

const TIER_A_HINT = '字段层已唯一标记 rowid'

/** 工作台场景；UUID 模型行 Batch 写 Base_DataModel 常 500。 */
export const FLOW_WORKBENCH_SCENARIO_ID = 'A5BADCEE11D2438CB9E75C2453A220A6'

const UUID_MODEL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** 经实服验证须设计器写模型 PrimaryKeyFields 的 modelId */
export const DESIGNER_ONLY_MODEL_IDS = new Set([
  '1ae5bacc-9124-4acf-8b75-a78c61298fb3',
  '3c0d6640-9c84-4894-9996-cf1418bd4106',
])

/**
 * @param {Readonly<{modelId?: string; scenarioId?: string}>} repair
 * @param {object | undefined} _detail
 */
export function classifyDesignerOnly(repair, _detail) {
  const modelId = String(repair?.modelId ?? '').trim()
  const scenarioId = String(repair?.scenarioId ?? '').trim()
  if (DESIGNER_ONLY_MODEL_IDS.has(modelId)) return true
  if (scenarioId === FLOW_WORKBENCH_SCENARIO_ID && UUID_MODEL_ID.test(modelId)) return true
  return false
}

function buildActionsForEntry(tier, designerOnly, detail) {
  const pkeys = [...(detail?.modelFieldIsPKey ?? [])].map(name => String(name).trim()).filter(Boolean)
  const extraPkeys = pkeys.filter(name => name !== 'rowid')
  if (tier === FORMAL_PK_TIER.A) {
    return designerOnly
      ? ['designer:保存模型 PrimaryKeyFields=rowid']
      : ['api:Base_DataModel.PrimaryKeyFields=rowid']
  }
  if (tier === FORMAL_PK_TIER.B) {
    const steps = extraPkeys.map(name => `api:Base_DataModel_Field 取消 ${name} 的 IsPKey`)
    steps.push(
      designerOnly
        ? 'designer:保存模型 PrimaryKeyFields=rowid'
        : 'api:Base_DataModel.PrimaryKeyFields=rowid',
    )
    return steps
  }
  return ['designer:字段主键与 rowid 对齐', 'designer:保存模型 PrimaryKeyFields=rowid']
}

/**
 * @param {readonly object[]} repair
 * @param {Map<string, object>} detailByModelId
 */
export function buildPkRepairChecklist(repair, detailByModelId) {
  return repair.map(item => {
    const detail = detailByModelId.get(item.modelId)
    const tier = classifyFormalPkRepair(item, detailByModelId)
    const designerOnly = classifyDesignerOnly(item, detail)
  const repairHint = String(detail?.repairHint ?? item.suggestedPrimaryKeyFields ?? '').trim()
    return {
      ...item,
      tier,
      designerOnly,
      repairHint,
      actions: buildActionsForEntry(tier, designerOnly, detail),
    }
  })
}

/**
 * @param {readonly ReturnType<typeof buildPkRepairChecklist>[number][]} checklist
 * @param {Readonly<{applyFailures?: readonly string[]}>} [options]
 */
export function formatPkRepairChecklistMarkdown(checklist, options = {}) {
  const lines = [
    '# Workflow 正式主键手工清单',
    '',
    `生成于 ${new Date().toISOString()}`,
    '',
    `缺口 **${checklist.length}** 项；Tier C 及 \`designerOnly\` 模型须在 lingmacn 设计器完成。`,
    '',
  ]
  if (options.applyFailures?.length) {
    lines.push('## API 失败（改设计器）', '')
    for (const modelId of options.applyFailures) {
      const hit = checklist.find(row => row.modelId === modelId)
      lines.push(`- ${hit?.modelName ?? modelId} (\`${modelId}\`)`)
    }
    lines.push('')
  }
  const groups = [
    ['设计器必选（designerOnly）', row => row.designerOnly],
    ['Tier B（API 可写）', row => row.tier === FORMAL_PK_TIER.B && !row.designerOnly],
    ['Tier C', row => row.tier === FORMAL_PK_TIER.C],
    ['Tier A（API 可写）', row => row.tier === FORMAL_PK_TIER.A && !row.designerOnly],
  ]
  for (const [title, pred] of groups) {
    const rows = checklist.filter(pred)
    if (!rows.length) continue
    lines.push(`## ${title}`, '')
    for (const row of rows) {
      lines.push(`### ${row.scenarioKey} · ${row.modelName}`)
      lines.push('')
      lines.push(`- modelId: \`${row.modelId}\``)
      lines.push(`- scenarioId: \`${row.scenarioId}\``)
      if (row.repairHint) lines.push(`- hint: ${row.repairHint}`)
      for (const action of row.actions) lines.push(`- [ ] ${action}`)
      lines.push('')
    }
  }
  return `${lines.join('\n')}\n`
}

/**
 * @param {Readonly<{repairHint?: string; modelFieldIsPKey?: readonly string[]}>} detail
 * @returns {'A'|'B'|'C'}
 */
export function classifyFormalPkDetail(detail) {
  const hint = String(detail?.repairHint ?? '').trim()
  const pkeys = [...(detail?.modelFieldIsPKey ?? [])].map(name => String(name).trim()).filter(Boolean)
  if (pkeys.length > 1 || hint.includes('修正字段 IsPKey')) return FORMAL_PK_TIER.B
  if (hint.includes(TIER_A_HINT) || (pkeys.length === 1 && pkeys[0] === 'rowid')) return FORMAL_PK_TIER.A
  if (pkeys.length === 1 && pkeys[0].toLowerCase() !== 'rowid') return FORMAL_PK_TIER.C
  if (hint.includes('PrimaryKeyFields=rowid') && !hint.includes('先修物理表')) return FORMAL_PK_TIER.A
  return FORMAL_PK_TIER.C
}

/**
 * @param {Readonly<{modelId: string}>} repair
 * @param {Map<string, object>} detailByModelId
 */
export function classifyFormalPkRepair(repair, detailByModelId) {
  const detail = detailByModelId.get(repair.modelId)
  if (!detail) return FORMAL_PK_TIER.C
  return classifyFormalPkDetail(detail)
}

/**
 * @param {readonly {modelId: string}[]} repair
 * @param {Map<string, object>} detailByModelId
 */
export function partitionFormalPkRepairs(repair, detailByModelId) {
  const tierA = []
  const tierB = []
  const tierC = []
  for (const item of repair) {
    const tier = classifyFormalPkRepair(item, detailByModelId)
    const row = {...item, tier, repairHint: detailByModelId.get(item.modelId)?.repairHint}
    if (tier === FORMAL_PK_TIER.A) tierA.push(row)
    else if (tier === FORMAL_PK_TIER.B) tierB.push(row)
    else tierC.push(row)
  }
  return Object.freeze({tierA, tierB, tierC})
}

export function todayEvidenceStamp() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '')
}

/**
 * @param {string} [stamp] YYYYMMDD
 */
export function resolveFormalPkDetailEvidencePath(stamp = todayEvidenceStamp()) {
  const dir = join(root, 'notes', 'evidence')
  const exact = join(dir, `workflow-formal-pk-detail-${stamp}.json`)
  if (existsSync(exact)) return exact
  const matches = readdirSync(dir)
    .filter(name => name.startsWith('workflow-formal-pk-detail-') && name.endsWith('.json'))
    .sort()
  return matches.length ? join(dir, matches.at(-1)) : exact
}

/**
 * @param {string} [path]
 */
export function loadFormalPkDetailByModelId(path = resolveFormalPkDetailEvidencePath()) {
  if (!existsSync(path)) return new Map()
  const doc = JSON.parse(readFileSync(path, 'utf8'))
  const map = new Map()
  for (const row of doc.models ?? []) {
    const modelId = String(row.modelId ?? '').trim()
    if (modelId) map.set(modelId, row)
  }
  return map
}