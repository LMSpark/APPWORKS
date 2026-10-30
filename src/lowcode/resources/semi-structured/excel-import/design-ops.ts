/**
 * @module app:lowcode/resources/semi-structured/excel-import/design-ops
 */
import {ExcelImportDesignClient} from '@spark-appworks/spark-lowcode-api'
import type {DataSet} from '@spark-appworks/spark-data'
import type {HttpClientBase} from '@spark-appworks/spark-utils'
import {attachStagedDesignView, parseJsonObject, readJsonArray} from '../../repository/staged-design-file-view'

export const EXCEL_IMPORT_DESIGN_INPUT = 'ExcelImportDesignInput'
export const EXCEL_IMPORT_DESIGN_VIEW = 'ExcelImportDesignEdit'

export function attachExcelImportDesignEdit(dataSet: DataSet, http: HttpClientBase, guard: () => void): void {
  const client = new ExcelImportDesignClient(http)
  attachStagedDesignView(dataSet, {
    scopeInputTable: EXCEL_IMPORT_DESIGN_INPUT,
    scopeField: 'importConfigId',
    designViewTable: EXCEL_IMPORT_DESIGN_VIEW,
    resourceId: 'excel-import-design',
    jsonFields: ['designJson'],
    columns: [{name: 'rowid', primary: true}, {name: 'importConfigId'}, {name: 'designJson'}],
    loadRow: async importConfigId => {
      const doc = await client.read(importConfigId)
      return {rowid: importConfigId, importConfigId, designJson: JSON.stringify({layout: doc.layout, rules: doc.rules}, null, 2)}
    },
    persistRow: async row => {
      const importConfigId = String(row['importConfigId'] ?? row['rowid'] ?? '')
      const raw = String(row['designJson'] ?? '{}')
      const parsed = parseJsonObject(raw)
      await client.write({importConfigId, layout: readJsonArray(parsed, 'layout'), rules: readJsonArray(parsed, 'rules')})
    },
  }, guard)
}
