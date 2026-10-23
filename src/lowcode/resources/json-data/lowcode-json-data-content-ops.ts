/**
 * @module app:lowcode/resources/json-data/lowcode-json-data-content-ops
 */
import {JsonDataContentClient} from '@spark-appworks/spark-lowcode-api'
import type {DataSet} from '@spark-appworks/spark-data'
import type {HttpClientBase} from '@spark-appworks/spark-utils'
import {attachStagedDesignView, parseJsonValue} from '../shared/staged-design-file-view'

export const JSON_CONTENT_INPUT_TABLE = 'JsonContentInput'
export const JSON_CONTENT_EDIT_VIEW = 'JsonContentEdit'

export function attachJsonContentEdit(dataSet: DataSet, http: HttpClientBase, guard: () => void): void {
  const client = new JsonDataContentClient(http)
  attachStagedDesignView(dataSet, {
    scopeInputTable: JSON_CONTENT_INPUT_TABLE,
    scopeField: 'jsonId',
    designViewTable: JSON_CONTENT_EDIT_VIEW,
    resourceId: 'json-data-content',
    jsonFields: ['contentJson'],
    columns: [{name: 'rowid', primary: true}, {name: 'jsonId'}, {name: 'contentJson'}],
    loadRow: async jsonId => {
      const payload = await client.read(jsonId)
      return {rowid: jsonId, jsonId, contentJson: JSON.stringify(payload ?? {}, null, 2)}
    },
    persistRow: async row => {
      const jsonId = String(row['jsonId'] ?? row['rowid'] ?? '')
      const raw = String(row['contentJson'] ?? '')
      const body = parseJsonValue(raw, [])
      await client.save(jsonId, body)
    },
  }, guard)
}
