/**
 * @module app:lowcode/resources/pdf-inspect/pdf-inspect-design-ops
 */
import {PdfInspectDesignClient} from '@spark-appworks/spark-lowcode-api'
import type {DataSet} from '@spark-appworks/spark-data'
import type {HttpClientBase} from '@spark-appworks/spark-utils'
import {attachStagedDesignView, parseJsonObject} from '../shared/staged-design-file-view'

export const PDF_INSPECT_DESIGN_INPUT = 'PdfInspectDesignInput'
export const PDF_INSPECT_DESIGN_VIEW = 'PdfInspectDesignEdit'

export function attachPdfInspectDesignEdit(dataSet: DataSet, http: HttpClientBase, guard: () => void): void {
  const client = new PdfInspectDesignClient(http)
  attachStagedDesignView(dataSet, {
    scopeInputTable: PDF_INSPECT_DESIGN_INPUT,
    scopeField: 'ruleId',
    designViewTable: PDF_INSPECT_DESIGN_VIEW,
    resourceId: 'pdf-inspect-design',
    jsonFields: ['designJson'],
    columns: [{name: 'rowid', primary: true}, {name: 'ruleId'}, {name: 'designJson'}],
    loadRow: async ruleId => {
      const doc = await client.read(ruleId)
      return {rowid: ruleId, ruleId, designJson: JSON.stringify(doc.rule ?? {}, null, 2)}
    },
    persistRow: async row => {
      const ruleId = String(row['ruleId'] ?? row['rowid'] ?? '')
      const raw = String(row['designJson'] ?? '{}')
      const rule = raw.trim() ? parseJsonObject(raw) : {}
      await client.write({ruleId, rule})
    },
  }, guard)
}
