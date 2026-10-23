/**
 * @module app:lowcode/resources/data-code/data-code-design-ops
 */
import {DataCodeDesignClient} from '@spark-appworks/spark-lowcode-api'
import type {DataSet} from '@spark-appworks/spark-data'
import type {HttpClientBase} from '@spark-appworks/spark-utils'
import {attachStagedDesignView} from '../shared/staged-design-file-view'

export const DATA_CODE_DESIGN_INPUT = 'DataCodeDesignInput'
export const DATA_CODE_DESIGN_VIEW = 'DataCodeDesignEdit'

export function attachDataCodeDesignEdit(dataSet: DataSet, http: HttpClientBase, guard: () => void): void {
  const client = new DataCodeDesignClient(http)
  attachStagedDesignView(dataSet, {
    scopeInputTable: DATA_CODE_DESIGN_INPUT,
    scopeField: 'codeDesignId',
    designViewTable: DATA_CODE_DESIGN_VIEW,
    resourceId: 'data-code-design',
    columns: [{name: 'rowid', primary: true}, {name: 'codeDesignId'}, {name: 'CodeName'}],
    loadRow: async id => {
      const detail = await client.readDetail(id)
      const codeName = typeof detail['CodeName'] === 'string' ? detail['CodeName'] : ''
      return {rowid: id, codeDesignId: id, CodeName: codeName}
    },
    persistRow: async row => {
      const id = String(row['codeDesignId'] ?? row['rowid'] ?? '')
      await client.saveDetail(id, {CodeName: String(row['CodeName'] ?? '')})
    },
  }, guard)
}
