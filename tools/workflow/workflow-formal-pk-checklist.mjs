/**
 * 写 formal-pk 手工清单证据（Markdown + JSON）。
 */
import {writeFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {
  buildPkRepairChecklist,
  formatPkRepairChecklistMarkdown,
  todayEvidenceStamp,
} from './workflow-formal-pk-tiers.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/**
 * @param {readonly object[]} repair
 * @param {Map<string, object>} detailByModelId
 * @param {Readonly<{applyFailureModelIds?: readonly string[]}>} [options]
 */
export function writePkRepairChecklistEvidence(repair, detailByModelId, options = {}) {
  const checklist = buildPkRepairChecklist(repair, detailByModelId)
  const stamp = todayEvidenceStamp()
  const jsonPath = join(root, 'notes', 'evidence', `workflow-formal-pk-manual-checklist-${stamp}.json`)
  const mdPath = join(root, 'notes', 'evidence', `workflow-formal-pk-manual-checklist-${stamp}.md`)
  const payload = {
    generatedAt: new Date().toISOString(),
    gapCount: checklist.length,
    checklist,
    applyFailureModelIds: options.applyFailureModelIds ?? [],
  }
  writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  const md = formatPkRepairChecklistMarkdown(checklist, {
    applyFailures: options.applyFailureModelIds,
  })
  writeFileSync(mdPath, md, 'utf8')
  return {jsonPath, mdPath, checklist}
}