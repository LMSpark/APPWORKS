/**
 * @module app:lowcode/resources/structured-config/logic-view/design-ops
 */
import {LogicViewDesignClient} from '@spark-appworks/spark-lowcode-api'
import type {DataSet} from '@spark-appworks/spark-data'
import type {HttpClientBase} from '@spark-appworks/spark-utils'
import {attachStagedDesignView, parseJsonObject} from '../../repository/staged-design-file-view'

export const LOGIC_VIEW_DESIGN_INPUT = 'LogicViewDesignInput'
export const LOGIC_VIEW_DESIGN_VIEW = 'LogicViewDesignEdit'

export function attachLogicViewDesignEdit(dataSet: DataSet, http: HttpClientBase, guard: () => void): void {
  const client = new LogicViewDesignClient(http)
  attachStagedDesignView(dataSet, {
    scopeInputTable: LOGIC_VIEW_DESIGN_INPUT,
    scopeField: 'viewId',
    designViewTable: LOGIC_VIEW_DESIGN_VIEW,
    resourceId: 'logic-view-design',
    jsonFields: ['designJson'],
    columns: [{name: 'rowid', primary: true}, {name: 'viewId'}, {name: 'designJson'}],
    loadRow: async viewId => {
      const payload = await client.read(viewId)
      return {rowid: viewId, viewId, designJson: JSON.stringify(payload.data ?? {}, null, 2)}
    },
    persistRow: async row => {
      const viewId = String(row['viewId'] ?? row['rowid'] ?? '')
      const raw = String(row['designJson'] ?? '')
      const data = raw.trim() ? parseJsonObject(raw) : {}
      await client.write({viewId, data})
    },
  }, guard)
}
